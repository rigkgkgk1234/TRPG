// 자동 플레이 시뮬레이터: 단순 AI로 30일을 N판 돌려 엔딩 분포·평균 사망일·은화 곡선을 본다. (ARCHITECTURE 7주차)
// 사용법: npm run simulate [-- --runs 1000] [--ai basic|cautious|bold|worker|trader|smart] [--seed 0] [--jobs farmer,smith]
//   basic: 기본 / cautious: 깊이 안 들어가고 일찍 쉰다, 늪·은광·폐허는 안 간다 / bold: 늘 더 깊이, 결투장·의뢰를 자주
//   worker: 은화를 넉넉히 모으며 교습을 산다, 전리품을 판다 / trader: 기본 + 저녁마다 전리품을 판다
//   smart: 기본 + 전리품을 팔고, 남는 은화로 같은 숙련의 더 좋은 무기·더 단단한 갑옷을 산다, 직업 고유 규칙이 있는 지역(약초꾼 늪, 나무꾼 숲)을 자주 간다
// 목표 (ARCHITECTURE 6장 7주차): 엔딩 분포 생존 40% · 사망 25% · 그 밖의 엔딩 35%.
import type { GameCommand } from "@/core/commands";
import { combatView } from "@/core/combat/combat";
import { averageDice } from "@/core/combat/dice";
import { actionStatus, LESSON_SKILLS } from "@/core/day/actions";
import { FOOD_PER_DAY } from "@/core/day/evening";
import { maxFoodAffordable } from "@/core/day/town";
import { dispatch } from "@/core/engine";
import { sceneView, type ChoiceView } from "@/core/events/runner";
import { countInBag } from "@/core/items/inventory";
import { entryPrice, SHOPS, treatable } from "@/core/items/shop";
import { HERBALIST_REGION as HERBALIST_REGION_ID, WOODCUTTER_REGION } from "@/core/jobPerks";
import { ENDING_LABEL, NPC_IDS, REGION_LABEL, SKILL_LABEL } from "@/core/labels";
import { newRun } from "@/core/newRun";
import { makeRecord } from "@/core/story/ending";
import { FATIGUE_DISADVANTAGE_AT, maxHp, SKILL_STAT, type EndingId, type ItemDef, type JobId, type RegionId, type RunState, type SkillId } from "@/core/types";
import { CONTENT } from "@/data";

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const RUNS = Number(arg("--runs")) || 1000;
type AiStyle = "basic" | "cautious" | "bold" | "worker" | "trader" | "smart";
const STYLE = (arg("--ai") ?? "basic") as AiStyle;
if (!["basic", "cautious", "bold", "worker", "trader", "smart"].includes(STYLE)) throw new Error(`모르는 --ai: ${STYLE}`);
/** 시드 시작점: 다른 시드로 같은 판 수를 돌려 결과가 얼마나 흔들리는지 본다 */
const SEED_BASE = Number(arg("--seed")) || 0;
/** --jobs herbalist,peddler: 고른 직업만 돌린다 */
const JOBS = (arg("--jobs")?.split(",") ?? Object.keys(CONTENT.jobs)) as JobId[];
const NOW = "2026-01-01T00:00:00.000Z";
/** 은화가 이보다 적으면 일하러 간다 */
const SILVER_FLOOR = STYLE === "worker" ? 15 : 6;
/** HP가 최대치의 이 비율보다 낮으면 쉰다 */
const HURT_RATIO = STYLE === "cautious" ? 0.7 : 0.5;
/** 몸이 성하고(HP 80% 이상, 피로 4 이하) 반반의 확률이면 더 깊이 들어간다 */
const DEEP_HP_RATIO = 0.8;
const DEEP_FATIGUE_MAX = STYLE === "bold" ? 6 : 4;
/** 이 피로부터 쉰다 (조심스러운 AI는 지치기 전에) */
const REST_FATIGUE = STYLE === "cautious" ? 5 : FATIGUE_DISADVANTAGE_AT;
/** 다치지 않았을 때 결투장·의뢰 중개소에 갈 확률 */
const FAME_CHANCE = STYLE === "cautious" ? 0 : STYLE === "bold" ? 0.25 : 0.12;
/** 저녁마다 전리품(재료)을 판다 */
const SELLS_LOOT = STYLE === "worker" || STYLE === "trader" || STYLE === "smart";
/** 남는 은화로 장비를 바꾼다 */
const BUYS_GEAR = STYLE === "smart";
/** 사람마다 다를 갈림길: 무작위로 고른다 (21일차 결정, 모집관의 증표, 로웬으로 떠나는 날, 용사 일행의 제안과 출발) */
const RANDOM_SCENES = new Set([
  "story_decision/start", "story_recruiter_return/offer", "story_rowen_departure/start",
  "story_heroes_return/offer", "story_heroes_fame/offer", "story_heroes_departure/start",
]);
/** 스토리에서 이보다 낮은 확률의 판정은 건너뛴다 */
const STORY_RISK_FLOOR = 0.4;
const CURVE_DAYS = [1, 5, 10, 15, 20, 25, 30];
/** smart AI가 고유 규칙 지역을 고를 때 쓴다 */
const HERBALIST_REGION = { job: "herbalist" as JobId, region: HERBALIST_REGION_ID };

/** 직업별 주력 무기 숙련 (훈련할 것) */
const MAIN_SKILL: Record<JobId, SkillId> = {
  farmer: "blunt", smith: "blunt", hunter: "bow",
  herbalist: "blade", recruit: "blade", soldier_child: "blade", woodcutter: "blade", errand: "blunt", peddler: "blade", acolyte: "blunt",
};

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
    if (STYLE === "cautious") return { type: "goDeeper", yes: false };
    const fresh = run.player.hp >= maxHp(run.player.stats) * (STYLE === "bold" ? HURT_RATIO : DEEP_HP_RATIO) && run.resources.fatigue <= DEEP_FATIGUE_MAX;
    return { type: "goDeeper", yes: fresh && (STYLE === "bold" || ai.rand() < 0.5) };
  }
  if (scene?.kind === "continue") return { type: "continue" };
  if (scene?.kind === "choices") return { type: "chooseChoice", choiceId: pickChoice(run, scene.choices, ai) };
  if (run.time.phase === "evening") return { type: "endDay" };

  const can = (cmd: Extract<GameCommand, { type: "chooseAction" }>) =>
    actionStatus(run, CONTENT, cmd.action, { skill: cmd.skill, stat: cmd.stat, region: cmd.region, npc: cmd.npc }).available;
  const options: Extract<GameCommand, { type: "chooseAction" }>[] = [];
  if (run.resources.fatigue >= REST_FATIGUE || run.player.hp < maxHp(run.player.stats) * HURT_RATIO) options.push({ type: "chooseAction", action: "rest" });
  if (run.resources.silver < SILVER_FLOOR) options.push({ type: "chooseAction", action: "work" });

  // 10일차까지는 숲만, 그 뒤로는 다섯 곳 중에서 (숲·감시탑 30%씩, 새 지역(위험 2) 늪·은광·폐허 13%쯤씩)
  const r = ai.rand();
  const job = run.player.job;
  const region: RegionId = run.time.day < 11 ? "forest"
    : STYLE === "cautious" ? (r < 0.5 ? "forest" : "watchtower")
    : STYLE === "smart" && job === HERBALIST_REGION.job && r < 0.4 ? HERBALIST_REGION.region
    : STYLE === "smart" && job === "woodcutter" && r < 0.6 ? WOODCUTTER_REGION
    : r < 0.3 ? "forest" : r < 0.6 ? "watchtower" : r < 0.73 ? "marsh" : r < 0.87 ? "mine" : "hamlet";
  const skill = MAIN_SKILL[run.player.job];
  if (ai.rand() < 0.15) options.push({ type: "chooseAction", action: "village", npc: NPC_IDS[Math.floor(ai.rand() * NPC_IDS.length)] });
  // 다치지 않았으면 가끔 결투장·의뢰 중개소 (명성)
  const healthy = run.player.wound.level === "none" && run.player.hp >= maxHp(run.player.stats) * DEEP_HP_RATIO && run.resources.fatigue <= DEEP_FATIGUE_MAX;
  if (healthy && ai.rand() < FAME_CHANCE) options.push({ type: "chooseAction", action: "village", npc: ai.rand() < 0.5 ? "arena" : "guild" });
  if (run.time.phase === "am") {
    if (LESSON_SKILLS.includes(skill) && run.resources.silver >= (STYLE === "worker" ? 9 : SILVER_FLOOR + 3)) options.push({ type: "chooseAction", action: "trainLesson", skill });
    // 혼자 훈련은 주 무기의 능력치를 단련하고, 그게 막히면 체력 (대담한 AI는 반쯤 훈련 대신 탐험)
    if (STYLE === "bold" && ai.rand() < 0.5) options.push({ type: "chooseAction", action: "explore", region });
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
  // 결투장: 열린 상대 중 가장 센 상대, 의뢰: 열린 의뢰 중 무작위 (구경·돌아가기는 마지막에)
  if (id === "arena_bout" || id === "guild_board") {
    const fights = open.filter((c) => c.id !== "watch" && c.id !== "leave");
    if (fights.length > 0) return (id === "arena_bout" ? fights[fights.length - 1] : fights[Math.floor(ai.rand() * fights.length)]).id;
  }
  if (CONTENT.events[id]?.category === "story") return (open.find((c) => c.chance === undefined || c.chance >= STORY_RISK_FLOOR) ?? open[0]).id;
  const score = (c: ChoiceView) => (c.chance !== undefined ? c.chance : c.danger ? 0.3 : 0.6);
  return open.reduce((best, c) => (score(c) > score(best) ? c : best)).id;
}

/** 저녁마다 마을에 들른다: 치료(치명상은 응급 처치, 안 되면 물약 / 중상은 약초방) → 빚 → 식량. */
function evening(run: RunState): RunState {
  const send = (cmd: GameCommand) => (run = dispatch(run, cmd, CONTENT).state);
  const bagIndex = (itemId: string) => run.inventory.slots.findIndex((x) => x?.itemId === itemId);
  /** 대장간에서 지금 것보다 나은 무기(같은 숙련, 피해 평균이 큰 것)·갑옷(방어도가 큰 것)을 은화가 넉넉하면 사서 걸치고, 쓰던 것은 판다 */
  const upgrade = (slot: "weapon" | "armor") => {
    const worn = run.inventory.equipment[slot];
    const cur = worn ? CONTENT.items[worn.itemId] : undefined;
    const score = (d: ItemDef | undefined) => (d?.category === "weapon" ? averageDice(d.damage) : d?.category === "armor" ? d.defense : 0);
    const fits = (d: ItemDef) => slot === "weapon"
      ? d.category === "weapon" && (cur?.category !== "weapon" || d.skill === cur.skill) && !(d.twoHanded && run.inventory.equipment.offHand)
      : d.category === "armor";
    const best = SHOPS.smithy.stock
      .map((e) => ({ e, d: CONTENT.items[e.itemId]! }))
      .filter(({ e, d }) => fits(d) && score(d) > score(cur) && entryPrice(run, CONTENT, e, "smithy") + SILVER_FLOOR <= run.resources.silver)
      .sort((a, b) => score(b.d) - score(a.d))[0];
    if (!best) return;
    send({ type: "shop", op: "buy", shop: "smithy", target: best.e.itemId });
    const i = bagIndex(best.e.itemId);
    if (i < 0) return;
    send({ type: "equip", slotIndex: i });
    if (cur) {
      const old = bagIndex(cur.id);
      if (old >= 0) send({ type: "shop", op: "sell", target: String(old), qty: 1 });
    }
  };
  if (run.player.wound.level === "critical") send({ type: "shop", op: "stabilize" });
  if (treatable(run)) send({ type: "shop", op: "treat" });
  if (run.player.wound.level === "critical") {
    send({ type: "shop", op: "buy", shop: "healer", target: "healing_potion" });
    if (countInBag(run.inventory, "healing_potion") > 0) send({ type: "useItem", itemId: "healing_potion" });
  }
  if (SELLS_LOOT) {
    for (let i = run.inventory.slots.length - 1; i >= 0; i--) {
      const stack = run.inventory.slots[i];
      if (stack && CONTENT.items[stack.itemId]?.category === "material") send({ type: "shop", op: "sell", target: String(i), qty: stack.qty });
    }
  }
  if (BUYS_GEAR) {
    upgrade("weapon");
    upgrade("armor");
  }
  if (run.resources.debt > 0 && run.resources.silver > SILVER_FLOOR) send({ type: "shop", op: "payDebt", qty: run.resources.silver - SILVER_FLOOR });
  const need = FOOD_PER_DAY - run.resources.food;
  const qty = Math.min(need, maxFoodAffordable(run));
  if (qty > 0) send({ type: "shop", op: "buyFood", qty });
  return run;
}

// ───────────────────────── 한 판 ─────────────────────────

interface Result { run: RunState; silverByDay: Map<number, number>; deathCause?: string; deathRegion?: string; deathEvent?: string; rankDay19?: number }

function autoPlay(job: JobId, seed: number): Result {
  const ai: Ai = { rand: aiRng(seed) };
  let run = newRun(CONTENT, job, "시뮬", { seed, now: NOW });
  const silverByDay = new Map<number, number>();
  let rankDay19: number | undefined;
  let before = run;
  for (let guard = 0; !run.ending && guard < 3000; guard++) {
    if (run.time.phase === "evening" && !run.activeEvent && !run.combat) {
      run = evening(run);
      silverByDay.set(run.time.day, run.resources.silver);
    }
    if (rankDay19 === undefined && run.time.day >= 19) rankDay19 = run.player.skills[MAIN_SKILL[job]].rank;
    before = run;
    run = dispatch(run, pickCommand(run, ai), CONTENT).state;
  }
  const result: Result = { run, silverByDay, rankDay19 };
  if (run.ending === "death") {
    const rec = makeRecord(run, CONTENT, NOW, before);
    result.deathCause = rec.death?.cause;
    result.deathRegion = rec.death ? REGION_LABEL[rec.death.region] : undefined;
    result.deathEvent = before.activeEvent?.eventId ?? "(이벤트 밖)";
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
const deathRows: Record<string, Record<string, number>> = {};
const rankRows: Record<string, Record<string, string>> = {};
for (const job of JOBS) {
  const results = Array.from({ length: RUNS }, (_, i) => autoPlay(job, SEED_BASE + i + 1));
  all.push(...results);
  const name = CONTENT.jobs[job]!.name;
  endingRows[name] = endingRow(results);
  deathRows[name] = countBy(results.filter((r) => r.run.ending === "death"), (r) => `${r.deathCause}`);
  const ranks = results.map((r) => r.rankDay19).filter((x): x is number => x !== undefined);
  rankRows[name] = {
    숙련: SKILL_LABEL[MAIN_SKILL[job]],
    평균: fmt(avg(ranks)),
    "3 이상": pct(ranks.filter((x) => x >= 3).length, ranks.length || 1),
    "2 이상": pct(ranks.filter((x) => x >= 2).length, ranks.length || 1),
    "일행 도움": pct(results.filter((r) => r.run.flags.heroes_helped).length, results.length),
    "명성 50": pct(results.filter((r) => r.run.player.fame >= 50 || r.run.eventHistory.story_heroes_fame).length, results.length),
    "용사 결투": pct(results.filter((r) => r.run.eventHistory.story_heroes_fame).length, results.length),
    "시험 합격": pct(results.filter((r) => r.run.flags.route_hero !== undefined).length, results.length),
  };
  curveRows[name] = Object.fromEntries(CURVE_DAYS.map((d) => [`${d}일`, fmt(avg(results.map((r) => r.silverByDay.get(d)).filter((x): x is number => x !== undefined)))]));
}
endingRows["전체"] = endingRow(all);

console.log(`\n== AI ${STYLE}${SEED_BASE ? ` · 시드 ${SEED_BASE}부터` : ""} ==`);
console.log(`\n== 엔딩 분포 · 직업마다 ${RUNS}판 (목표: 생존 40% · 사망 25% · 그 밖 35%) ==`);
console.table(endingRows);
console.log("\n== 저녁 은화 평균 (장보기 뒤, 세금 전) ==");
console.table(curveRows);

const deaths = all.filter((r) => r.run.ending === "death");
console.log(`\n사망 ${deaths.length}판 · 평균 사망일 ${fmt(avg(deaths.map((r) => r.run.time.day)))}일차`);
console.table(countBy(deaths, (r) => `${r.deathCause} @ ${r.deathRegion}`));
console.log("\n직업별 사망 원인 (판 수)");
console.table(deathRows);
console.log("\n사망한 이벤트 (상위 10)");
console.table(Object.fromEntries(Object.entries(countBy(deaths, (r) => r.deathEvent ?? "-")).slice(0, 10)));
console.log("\n19일차 주 무기 숙련 (19일차까지 산 판)");
console.table(rankRows);
console.log("\n스토리 도달률 (전체)");
console.table(Object.fromEntries(
  ["goblin_tracks_found", "goblin_scout_seen", "reported", "route_defend", "route_flee", "route_rowen", "route_self", "recruit_passed", "heroes_helped", "route_hero", "palisade_built", "goblin_plan_known", "raid_won"]
    .map((f) => [f, pct(all.filter((r) => !!r.run.flags[f]).length, all.length)]),
));
console.log(`평균 평판 ${fmt(avg(all.map((r) => r.run.player.reputation)))}, 평균 명성 ${fmt(avg(all.map((r) => r.run.player.fame)))}, 평균 흔적 ${fmt(avg(all.map((r) => r.run.player.traits.length)))}개, 벌어들인 은화 ${fmt(avg(all.map((r) => r.run.stats.silverEarned)))}`);

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
