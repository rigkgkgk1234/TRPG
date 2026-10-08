// 자동 플레이 시뮬레이터: 단순 AI로 30일을 N판 돌려 엔딩 분포·평균 사망일·은화 곡선을 본다. (ARCHITECTURE 7주차)
// 사용법: npm run simulate [-- --runs 1000]
// 목표 (ARCHITECTURE 6장 7주차): 엔딩 분포 생존 40% · 사망 25% · 그 밖의 엔딩 35%.
import type { GameCommand } from "@/core/commands";
import { combatView } from "@/core/combat/combat";
import { actionStatus, LESSON_SKILLS } from "@/core/day/actions";
import { FOOD_PER_DAY } from "@/core/day/evening";
import { maxFoodAffordable } from "@/core/day/town";
import { dispatch } from "@/core/engine";
import { sceneView, type ChoiceView } from "@/core/events/runner";
import { countInBag } from "@/core/items/inventory";
import { treatable } from "@/core/items/shop";
import { ENDING_LABEL, NPC_IDS, REGION_LABEL } from "@/core/labels";
import { newRun } from "@/core/newRun";
import { makeRecord } from "@/core/story/ending";
import { FATIGUE_DISADVANTAGE_AT, maxHp, SKILL_STAT, type EndingId, type JobId, type RunState, type SkillId } from "@/core/types";
import { CONTENT } from "@/data";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 1000;
const JOBS: JobId[] = ["farmer", "smith", "hunter"];
const NOW = "2026-01-01T00:00:00.000Z";
/** 은화가 이보다 적으면 일하러 간다 */
const SILVER_FLOOR = 6;
/** HP가 최대치의 이 비율보다 낮으면 쉰다 */
const HURT_RATIO = 0.5;
/** 몸이 성하고(HP 80% 이상, 피로 4 이하) 반반의 확률이면 더 깊이 들어간다 */
const DEEP_HP_RATIO = 0.8;
const DEEP_FATIGUE_MAX = 4;
/** 사람마다 다를 갈림길: 무작위로 고른다 (21일차 결정, 모집관의 증표, 로웬으로 떠나는 날, 용사 일행의 제안과 출발) */
const RANDOM_SCENES = new Set([
  "story_decision/start", "story_recruiter_return/offer", "story_rowen_departure/start",
  "story_heroes_return/offer", "story_heroes_departure/start",
]);
/** 스토리에서 이보다 낮은 확률의 판정은 건너뛴다 */
const STORY_RISK_FLOOR = 0.4;
const CURVE_DAYS = [1, 5, 10, 15, 20, 25, 30];

/** 직업별 주력 무기 숙련 (훈련할 것) */
const MAIN_SKILL: Record<JobId, SkillId> = { farmer: "blunt", smith: "blunt", hunter: "bow", herbalist: "blade", errand: "blade" };

/** AI가 스스로 굴리는 작은 시드 RNG (게임 RNG와 따로 둔다: AI의 변덕이 게임 결과의 재현성을 해치지 않게) */
function aiRng(seed: number): () => number {
  let a = seed * 2654435761;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Ai { rand: () => number }

// ───────────────────────── 고르기 ─────────────────────────

/**
 * 단순 AI (ARCHITECTURE 7주차):
 * - 탐험: 몸이 성하면 반반의 확률로 더 깊이 들어간다.
 * - 전투: 공격. HP가 1/3 이하면 약초를 쓰고, 없으면 도주(할 수 있으면).
 * - 이벤트: 성공 확률이 가장 높은 선택지. 판정 없는 선택지는 안전하면 0.6, 싸움이 붙으면 0.3으로 친다.
 *   스토리는 고를 수 있는 첫 선택지(이야기를 앞으로 미는 쪽)를 고른다. 단, 성공 확률 40% 미만인 판정은 건너뛴다.
 *   21일차 결정 같은 갈림길은 무작위, 습격 밤은 준비한 길대로 (방어 → 싸움, 피난 준비 → 피난, 그 밖에는 숨기).
 * - 하루: 피로 7 이상이거나 HP가 절반 아래면 휴식, 은화가 모자라면 일, 나머지는 오전 훈련·오후 탐험 (가끔 마을 볼일).
 */
function pickCommand(run: RunState, ai: Ai): GameCommand {
  const fight = combatView(run, CONTENT);
  if (fight) {
    const low = run.player.hp <= maxHp(run.player.stats) / 3;
    if (low && fight.items.some((i) => i.itemId === "healing_potion")) return { type: "combat", action: { type: "useItem", itemId: "healing_potion" } };
    if (low && fight.items.some((i) => i.itemId === "herb")) return { type: "combat", action: { type: "useItem", itemId: "herb" } };
    const flee = fight.actions.find((a) => a.type === "flee")!;
    if (low && !flee.lockedReason) return { type: "combat", action: { type: "flee" } };
    const attack = fight.actions.find((a) => a.type === "attack")!;
    if (attack.lockedReason || !fight.targetId) return { type: "combat", action: flee.lockedReason ? { type: "defend" } : { type: "flee" } };
    return { type: "combat", action: { type: "attack", targetId: fight.targetId } };
  }

  const scene = sceneView(run, CONTENT);
  if (scene?.kind === "deeper") {
    const fresh = run.player.hp >= maxHp(run.player.stats) * DEEP_HP_RATIO && run.resources.fatigue <= DEEP_FATIGUE_MAX;
    return { type: "goDeeper", yes: fresh && ai.rand() < 0.5 };
  }
  if (scene?.kind === "continue") return { type: "continue" };
  if (scene?.kind === "choices") return { type: "chooseChoice", choiceId: pickChoice(run, scene.choices, ai) };
  if (run.time.phase === "evening") return { type: "endDay" };

  const can = (cmd: Extract<GameCommand, { type: "chooseAction" }>) =>
    actionStatus(run, CONTENT, cmd.action, { skill: cmd.skill, stat: cmd.stat, region: cmd.region, npc: cmd.npc }).available;
  const options: Extract<GameCommand, { type: "chooseAction" }>[] = [];
  if (run.resources.fatigue >= FATIGUE_DISADVANTAGE_AT || run.player.hp < maxHp(run.player.stats) * HURT_RATIO) options.push({ type: "chooseAction", action: "rest" });
  if (run.resources.silver < SILVER_FLOOR) options.push({ type: "chooseAction", action: "work" });

  const region = run.time.day < 11 ? "forest" : ai.rand() < 0.5 ? "watchtower" : "forest";
  const skill = MAIN_SKILL[run.player.job];
  if (ai.rand() < 0.15) options.push({ type: "chooseAction", action: "village", npc: NPC_IDS[Math.floor(ai.rand() * NPC_IDS.length)] });
  if (run.time.phase === "am") {
    if (LESSON_SKILLS.includes(skill) && run.resources.silver >= SILVER_FLOOR + 3) options.push({ type: "chooseAction", action: "trainLesson", skill });
    // 혼자 훈련은 주 무기의 능력치를 단련하고, 그게 막히면 체력
    options.push({ type: "chooseAction", action: "trainSolo", stat: SKILL_STAT[skill] }, { type: "chooseAction", action: "trainSolo", stat: "con" });
  }
  options.push({ type: "chooseAction", action: "explore", region });
  options.push({ type: "chooseAction", action: "work" }, { type: "chooseAction", action: "rest" });
  return options.find(can)!;
}

function pickChoice(run: RunState, choices: ChoiceView[], ai: Ai): string {
  const open = choices.filter((c) => c.lockedReason === null);
  if (open.length === 0) throw new Error(`고를 수 있는 선택지가 없다: ${run.activeEvent!.eventId}/${run.activeEvent!.sceneId}`);
  const id = run.activeEvent!.eventId;
  if (RANDOM_SCENES.has(`${id}/${run.activeEvent!.sceneId}`)) return open[Math.floor(ai.rand() * open.length)].id;
  if (id === "story_raid") {
    const pref = run.flags.route_defend ? "fight" : run.flags.flee_organized ? "flee" : "hide";
    return (open.find((c) => c.id === pref) ?? open.find((c) => c.id === "hide") ?? open[0]).id;
  }
  if (CONTENT.events[id]?.category === "story") return (open.find((c) => c.chance === undefined || c.chance >= STORY_RISK_FLOOR) ?? open[0]).id;
  const score = (c: ChoiceView) => (c.chance !== undefined ? c.chance : c.danger ? 0.3 : 0.6);
  return open.reduce((best, c) => (score(c) > score(best) ? c : best)).id;
}

/** 저녁마다 마을에 들른다: 치료(중상은 약초방, 치명상은 물약) → 빚 → 식량 → 화살 (돈이 남으면). */
function evening(run: RunState): RunState {
  const send = (cmd: GameCommand) => (run = dispatch(run, cmd, CONTENT).state);
  if (treatable(run)) send({ type: "shop", op: "treat" });
  if (run.player.wound.level === "critical") {
    send({ type: "shop", op: "buy", shop: "healer", target: "healing_potion" });
    if (countInBag(run.inventory, "healing_potion") > 0) send({ type: "useItem", itemId: "healing_potion" });
  }
  if (run.resources.debt > 0 && run.resources.silver > SILVER_FLOOR) send({ type: "shop", op: "payDebt", qty: run.resources.silver - SILVER_FLOOR });
  const need = FOOD_PER_DAY - run.resources.food;
  const qty = Math.min(need, maxFoodAffordable(run));
  if (qty > 0) send({ type: "shop", op: "buyFood", qty });
  if (run.player.job === "hunter" && countInBag(run.inventory, "arrow") < 5 && run.resources.silver >= SILVER_FLOOR + 3) {
    send({ type: "shop", op: "buy", shop: "inn", target: "arrow" });
  }
  return run;
}

// ───────────────────────── 한 판 ─────────────────────────

interface Result { run: RunState; silverByDay: Map<number, number>; deathCause?: string; deathRegion?: string }

function autoPlay(job: JobId, seed: number): Result {
  const ai: Ai = { rand: aiRng(seed) };
  let run = newRun(CONTENT, job, "시뮬", { seed, now: NOW });
  const silverByDay = new Map<number, number>();
  let before = run;
  for (let guard = 0; !run.ending && guard < 3000; guard++) {
    if (run.time.phase === "evening" && !run.activeEvent && !run.combat) {
      run = evening(run);
      silverByDay.set(run.time.day, run.resources.silver);
    }
    before = run;
    run = dispatch(run, pickCommand(run, ai), CONTENT).state;
  }
  const result: Result = { run, silverByDay };
  if (run.ending === "death") {
    const rec = makeRecord(run, CONTENT, NOW, before);
    result.deathCause = rec.death?.cause;
    result.deathRegion = rec.death ? REGION_LABEL[rec.death.region] : undefined;
  }
  return result;
}

// ───────────────────────── 보고 ─────────────────────────

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n: number) => (Number.isNaN(n) ? "-" : n.toFixed(1));
const pct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`;
const ENDINGS: EndingId[] = ["survivor", "death", "shield_of_village", "flee_together", "rowen_spearman", "hero_party", "debtor"];

const all: Result[] = [];
const endingRows: Record<string, Record<string, string>> = {};
const curveRows: Record<string, Record<string, string>> = {};
for (const job of JOBS) {
  const results = Array.from({ length: RUNS }, (_, i) => autoPlay(job, i + 1));
  all.push(...results);
  const name = CONTENT.jobs[job]!.name;
  endingRows[name] = endingRow(results);
  curveRows[name] = Object.fromEntries(CURVE_DAYS.map((d) => [`${d}일`, fmt(avg(results.map((r) => r.silverByDay.get(d)).filter((x): x is number => x !== undefined)))]));
}
endingRows["전체"] = endingRow(all);

console.log(`\n== 엔딩 분포 · 직업마다 ${RUNS}판 (목표: 생존 40% · 사망 25% · 그 밖 35%) ==`);
console.table(endingRows);
console.log("\n== 저녁 은화 평균 (장보기 뒤, 세금 전) ==");
console.table(curveRows);

const deaths = all.filter((r) => r.run.ending === "death");
console.log(`\n사망 ${deaths.length}판 · 평균 사망일 ${fmt(avg(deaths.map((r) => r.run.time.day)))}일차`);
console.table(countBy(deaths, (r) => `${r.deathCause} @ ${r.deathRegion}`));
console.log("\n스토리 도달률 (전체)");
console.table(Object.fromEntries(
  ["goblin_tracks_found", "goblin_scout_seen", "reported", "route_defend", "route_flee", "route_rowen", "route_self", "recruit_passed", "heroes_helped", "route_hero", "palisade_built", "goblin_plan_known", "raid_won"]
    .map((f) => [f, pct(all.filter((r) => !!r.run.flags[f]).length, all.length)]),
));
console.log(`평균 평판 ${fmt(avg(all.map((r) => r.run.player.reputation)))}, 평균 흔적 ${fmt(avg(all.map((r) => r.run.player.traits.length)))}개, 벌어들인 은화 ${fmt(avg(all.map((r) => r.run.stats.silverEarned)))}`);

function endingRow(results: Result[]): Record<string, string> {
  const n = results.length;
  const row: Record<string, string> = {};
  for (const e of ENDINGS) row[ENDING_LABEL[e]] = pct(results.filter((r) => r.run.ending === e).length, n);
  const other = results.filter((r) => r.run.ending && !["survivor", "death"].includes(r.run.ending)).length;
  row["그 밖 합계"] = pct(other, n);
  row["미완"] = pct(results.filter((r) => !r.run.ending).length, n);
  return row;
}

function countBy<T>(xs: T[], key: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
}
