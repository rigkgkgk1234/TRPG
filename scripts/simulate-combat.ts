// 전투 자동 시뮬레이션: 직업별로 같은 적과 N번 싸워 승률·도주율·사망률을 본다. (ARCHITECTURE 4주차)
// 사용법: npm run simulate:combat [-- --runs 1000]
// 목표치 (SYSTEM_SPEC 8장): 시작 캐릭터 vs 늑대 사망률 10~15%, 20일차 캐릭터 2% 이하.
import type { ContentDB } from "@/core/content";
import { combatView } from "@/core/combat/combat";
import { dispatch } from "@/core/engine";
import { newRun } from "@/core/newRun";
import type { CombatAction, EnemyId, EventDef, JobId, RunState } from "@/core/types";
import { CONTENT } from "@/data";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 1000;
const JOBS: JobId[] = ["farmer", "smith", "hunter"];

/** 선공 굴림으로 시작하는 1:1 전투 하나뿐인 이벤트 */
function arena(enemy: EnemyId): ContentDB {
  const ev: EventDef = {
    id: "sim_arena", category: "story", title: "시뮬레이션", conditions: [], weight: 1, repeat: { mode: "always" }, startScene: "start",
    scenes: {
      start: { text: "", choices: [{ id: "go", label: "싸운다", outcome: { next: "fight" } }] },
      fight: {
        text: "",
        onEnter: [{ type: "startCombat", combat: { enemies: [enemy], initiative: "roll", canFlee: true, onVictory: "won", onFled: "fled" } }],
        choices: [],
      },
      won: { text: "", choices: [] },
      fled: { text: "", choices: [] },
    },
  };
  return { ...CONTENT, events: { sim_arena: ev } };
}

type Veteran = "start" | "day20";

/** 20일차 가정: 주력 능력치 +1, 무기 숙련 4, 가죽 갑옷 */
function fighter(job: JobId, seed: number, level: Veteran): RunState {
  const run = newRun(CONTENT, job, "시뮬", { seed, now: "2026-01-01T00:00:00.000Z" });
  run.activeEvent = { eventId: "sim_arena", sceneId: "start" };
  run.inventory.slots = run.inventory.slots.map((s) => (s?.itemId === "herb" ? null : s));
  if (level === "day20") {
    const weaponSkill = job === "hunter" ? "bow" : job === "smith" ? "blunt" : "blunt";
    run.player.skills[weaponSkill].rank = 4;
    run.player.skills.guard.rank = 1;
    if (job === "hunter") run.player.stats.agi += 1; else run.player.stats.str += 1;
    run.inventory.equipment.armor = { itemId: "leather_armor", qty: 1, durability: 25 };
  }
  return run;
}

/** 단순한 전투 방침: 그냥 공격한다. HP가 1/3 이하로 떨어지면 도주를 시도한다. */
function pick(run: RunState, content: ContentDB): CombatAction {
  const view = combatView(run, content)!;
  const target = view.targetId!;
  const hpLow = run.player.hp <= (8 + run.player.stats.con * 2) / 3;
  if (hpLow) return { type: "flee" };
  const attack = view.actions.find((a) => a.type === "attack")!;
  return attack.lockedReason ? { type: "flee" } : { type: "attack", targetId: target };
}

interface Tally { won: number; fled: number; downed: number; died: number; rounds: number; hpLeft: number; wounded: number }

function fight(job: JobId, enemy: EnemyId, level: Veteran, seed: number, t: Tally): void {
  const content = arena(enemy);
  let run = dispatch(fighter(job, seed, level), { type: "chooseChoice", choiceId: "go" }, content).state;
  let rounds = 0;
  while (run.combat && rounds < 50) {
    run = dispatch(run, { type: "combat", action: pick(run, content) }, content).state;
    rounds++;
  }
  t.rounds += rounds;
  const scene = run.activeEvent?.sceneId;
  if (run.ending === "death") t.died++;
  else if (scene === "won") { t.won++; t.hpLeft += run.player.hp; }
  else if (scene === "fled") t.fled++;
  else t.downed++; // 쓰러졌지만 살았다 (사망 굴림 성공, 강탈)
  if (run.player.wound.level !== "none") t.wounded++;
}

const pct = (n: number) => `${((n / RUNS) * 100).toFixed(1)}%`;

for (const enemy of ["wolf", "boar", "bandit", "goblin_scout"] as EnemyId[]) {
  for (const level of ["start", "day20"] as Veteran[]) {
    const rows: Record<string, Record<string, string>> = {};
    for (const job of JOBS) {
      const t: Tally = { won: 0, fled: 0, downed: 0, died: 0, rounds: 0, hpLeft: 0, wounded: 0 };
      for (let i = 1; i <= RUNS; i++) fight(job, enemy, level, i, t);
      rows[CONTENT.jobs[job]!.name] = {
        승리: pct(t.won), 도주: pct(t.fled), "쓰러졌지만 생존": pct(t.downed), 사망: pct(t.died),
        "평균 행동": (t.rounds / RUNS).toFixed(1), "승리 시 남은 HP": t.won ? (t.hpLeft / t.won).toFixed(1) : "-", 부상: pct(t.wounded),
      };
    }
    console.log(`\n== ${CONTENT.enemies[enemy]!.name} · ${level === "start" ? "시작 캐릭터" : "20일차 가정"} · ${RUNS}판 ==`);
    console.table(rows);
  }
}
