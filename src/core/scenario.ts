import { produce } from "immer";
import type { Ctx, FeedItem } from "./commands";
import type { ContentDB } from "./content";
import { startEventAt } from "./events/runner";
import { isFallback } from "./events/selector";
import { newRun } from "./newRun";
import { createRng, maxHp, type EventDef, type JobId, type RunState, type SceneId } from "./types";

/**
 * 개발용 상황 시험: 원하는 날·자원으로 회차를 만들고, 원하는 화면(하루·저녁·이벤트·전투)에서 바로 시작한다.
 * 전투는 실제 전투 이벤트를 전투가 시작되는 장면부터 열어, 이긴 뒤·도망친 뒤의 흐름까지 그대로 시험한다.
 */
export type ScenarioStart =
  | { kind: "hub" }
  | { kind: "evening" }
  | { kind: "event"; eventId: string }
  | { kind: "combat"; eventId: string };

export interface ScenarioSetup {
  job: JobId;
  day: number;
  silver: number;
  reputation: number;
  /** 최대 HP에 대한 비율 (0~1) */
  hpRatio: number;
  start: ScenarioStart;
  seed: number;
  now: string;
}

export const SCENARIO_NAME = "시험";

/** 전투가 시작되는 첫 장면 (없으면 null) */
export function combatScene(ev: EventDef): SceneId | null {
  const found = Object.entries(ev.scenes).find(([, sc]) => sc.onEnter?.some((e) => e.type === "startCombat"));
  return found ? found[0] : null;
}

/** 상황 시험에 고를 수 있는 이벤트: 대체 이벤트는 뺀다. combat이면 전투가 있는 것만 */
export function scenarioEvents(content: Pick<ContentDB, "events">, combat: boolean): EventDef[] {
  return Object.values(content.events)
    .filter((ev) => !isFallback(ev) && (!combat || combatScene(ev) !== null))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** 전투 이벤트의 적 이름들 ("늑대 둘") */
export function combatEnemies(ev: EventDef, content: Pick<ContentDB, "enemies">): string[] {
  const id = combatScene(ev);
  const setup = id ? ev.scenes[id]?.onEnter?.find((e) => e.type === "startCombat") : undefined;
  if (!setup || setup.type !== "startCombat") return [];
  return setup.combat.enemies.map((e) => content.enemies[e]?.name ?? e);
}

export function scenarioRun(content: ContentDB, setup: ScenarioSetup): RunState {
  return scenarioStart(content, setup).run;
}

/**
 * 시험 회차를 만들고, 시작할 때 일어난 일(장면 글, 적의 선공 등)의 피드와 그 직전 상태를 함께 돌려준다.
 * 화면은 이것을 첫 결과 카드로 보여 준다.
 */
export function scenarioStart(content: ContentDB, setup: ScenarioSetup): { run: RunState; before: RunState; feed: FeedItem[] } {
  const base = produce(newRun(content, setup.job, SCENARIO_NAME, { seed: setup.seed, now: setup.now }), (draft) => {
    draft.time.day = setup.day;
    draft.time.phase = "am";
    draft.resources.silver = setup.silver;
    draft.player.reputation = setup.reputation;
    draft.player.hp = Math.max(1, Math.round(maxHp(draft.player.stats) * setup.hpRatio));
  });
  const start = setup.start;
  if (start.kind === "hub") return { run: base, before: base, feed: [] };
  if (start.kind === "evening") {
    const run = produce(base, (draft) => { draft.time.phase = "evening"; });
    return { run, before: run, feed: [] };
  }
  const ev = content.events[start.eventId];
  if (!ev) throw new Error(`없는 이벤트: ${start.eventId}`);
  // 밤 이벤트는 저녁 정산 뒤, 나머지는 낮에 일어난다
  const before = produce(base, (draft) => { draft.time.phase = ev.category === "night" ? "evening" : "am"; });
  const feed: FeedItem[] = [];
  const run = produce(before, (draft) => {
    const scene = start.kind === "combat" ? combatScene(ev) ?? ev.startScene : ev.startScene;
    const explore = ev.category === "explore" && ev.region ? { region: ev.region, cardsDrawn: 1, deep: false } : undefined;
    const ctx: Ctx = { draft, content, rng: createRng(draft.rng), feed };
    startEventAt(ctx, ev, scene, explore);
  });
  return { run, before, feed };
}

/**
 * 시험이 끝났는지: 엔딩(죽음 포함), 고른 이벤트·전투가 끝남, 하루·저녁으로 시작했으면 다음 날이 됨.
 * 고른 이벤트가 끝나는 순간 기다리던 스토리나 다음 탐험 카드가 이어 시작할 수 있으므로, 고른 이벤트가 더는 진행 중이 아니면 끝이다.
 */
export function scenarioFinished(run: RunState, setup: Pick<ScenarioSetup, "start" | "day">): boolean {
  if (run.ending) return true;
  const start = setup.start;
  if (start.kind === "event" || start.kind === "combat") return run.activeEvent?.eventId !== start.eventId;
  return run.time.day > setup.day;
}
