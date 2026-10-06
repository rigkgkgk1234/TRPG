// 하루 루프 자동 플레이: 정해진 방침으로 30일을 보내고 은화·피로 곡선을 본다. (ARCHITECTURE 2주차)
// 사용법: npm run simulate [-- --runs 500]
import type { GameCommand } from "@/core/commands";
import { actionStatus } from "@/core/day/actions";
import { FOOD_PER_DAY } from "@/core/day/evening";
import { maxFoodAffordable } from "@/core/day/town";
import { dispatch } from "@/core/engine";
import { newRun } from "@/core/newRun";
import type { JobId, RunState } from "@/core/types";
import { CONTENT } from "@/data";

const RUNS = Number(process.argv[process.argv.indexOf("--runs") + 1]) || 300;
const JOBS: JobId[] = ["farmer", "smith", "hunter"];
const CHECKPOINT_DAYS = [1, 7, 8, 14, 15, 21, 22, 28, 29, 30];

interface DaySnapshot { silver: number; fatigue: number; food: number; debt: number }

type Policy = { name: string; pm: "work" | "rest" };
/** 오전은 늘 일한다. 오후 행동만 다르다. */
const POLICIES: Policy[] = [
  { name: "오전 일하기 + 오후 휴식", pm: "rest" },
  { name: "하루 두 번 일하기", pm: "work" },
];

/** 일을 못 하는 상태(치명상)면 쉰다. 저녁마다 모자란 식량을 산다(autoPlay). */
function pickCommand(run: RunState, policy: Policy): GameCommand {
  if (run.time.phase === "evening") return { type: "endDay" };
  const action = run.time.phase === "am" ? "work" : policy.pm;
  return { type: "chooseAction", action: actionStatus(run, action).available ? action : "rest" };
}

function autoPlay(job: JobId, seed: number, policy: Policy): { run: RunState; days: Map<number, DaySnapshot>; collapses: number } {
  let run = newRun(CONTENT, job, "시뮬", { seed, now: "2026-01-01T00:00:00.000Z" });
  const days = new Map<number, DaySnapshot>();
  let collapses = 0;
  for (let guard = 0; !run.ending && guard < 1000; guard++) {
    if (run.time.phase === "evening") {
      const need = FOOD_PER_DAY - run.resources.food;
      const qty = Math.min(need, maxFoodAffordable(run));
      if (qty > 0) run = dispatch(run, { type: "shop", op: "buyFood", qty }, CONTENT).state;
      // 저녁 정산 직전(세금 전)의 모습을 기록
      const r = run.resources;
      days.set(run.time.day, { silver: r.silver, fatigue: r.fatigue, food: r.food, debt: r.debt });
      if (run.time.collapsedToday) collapses++;
    }
    run = dispatch(run, pickCommand(run, policy), CONTENT).state;
  }
  return { run, days, collapses };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (n: number) => (Number.isNaN(n) ? "-" : n.toFixed(1));

for (const policy of POLICIES) for (const job of JOBS) {
  const results = Array.from({ length: RUNS }, (_, i) => autoPlay(job, i + 1, policy));
  console.log(`\n== ${CONTENT.jobs[job]!.name} · ${RUNS}판 · ${policy.name} ==`);

  const collapses = results.reduce((n, r) => n + r.collapses, 0);
  const endings: Record<string, number> = {};
  for (const { run } of results) endings[run.ending ?? "미완"] = (endings[run.ending ?? "미완"] ?? 0) + 1;
  console.log("엔딩:", Object.entries(endings).map(([k, v]) => `${k} ${((v / RUNS) * 100).toFixed(0)}%`).join(" · "), `| 탈진 평균 ${fmt(collapses / RUNS)}회/판`);

  console.table(Object.fromEntries(CHECKPOINT_DAYS.map((day) => {
    const snaps = results.map((r) => r.days.get(day)).filter((s): s is DaySnapshot => !!s);
    return [`${day}일차 저녁`, {
      은화: fmt(avg(snaps.map((s) => s.silver))),
      피로: fmt(avg(snaps.map((s) => s.fatigue))),
      식량: fmt(avg(snaps.map((s) => s.food))),
      빚: fmt(avg(snaps.map((s) => s.debt))),
      "빚 있는 판": `${((snaps.filter((s) => s.debt > 0).length / RUNS) * 100).toFixed(0)}%`,
    }];
  })));

  const finals = results.map((r) => r.run);
  console.log(
    `최종 평균: 은화 ${fmt(avg(finals.map((r) => r.resources.silver)))}, 번 은화 ${fmt(avg(finals.map((r) => r.stats.silverEarned)))}, ` +
    `숙련 등급 합 ${fmt(avg(finals.map((r) => Object.values(r.player.skills).reduce((n, s) => n + s.rank, 0))))}`,
  );
}
