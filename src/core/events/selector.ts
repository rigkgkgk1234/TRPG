import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import type { EventCategory, EventDef, EventHistoryEntry, RegionId, Rng, RunState } from "../types";
import { evalAll } from "./conditions";
import { dangerTierForDay } from "./explore";

/** 최근 이만큼 안에 본 카드는 덜 뽑힌다 */
const RECENT_DAYS = 3;
const RECENT_WEIGHT = 0.3;
const SAME_TIER_WEIGHT = 2;
const FALLBACK_SUFFIX = "_fallback";

/** 후보가 없을 때 대신 나오는 이벤트 ID: 지역이 있으면 "forest_fallback", 없으면 "npc_fallback" */
export function fallbackId(category: EventCategory, region?: RegionId): string {
  return `${region ?? category}${FALLBACK_SUFFIX}`;
}

export function isFallback(ev: EventDef): boolean {
  return ev.id.endsWith(FALLBACK_SUFFIX);
}

/**
 * 이벤트 풀에서 하나를 가중치로 뽑는다. (SYSTEM_SPEC 4-3 발생 알고리즘)
 * `chance` 조건이 rng를 쓰므로 순회 순서가 바뀌면 결과가 바뀐다 → 항상 ID 순으로 돈다.
 * 후보가 없으면 대체 이벤트, 그것도 없으면 null. npc를 주면 그 사람의 이벤트만 (마을 볼일).
 */
export function selectEvent(ctx: Ctx, category: EventCategory, region?: RegionId, deep = false, npc?: string): EventDef | null {
  const { draft: s, content, rng } = ctx;
  const tier = Math.min(3, dangerTierForDay(s.time.day) + (deep ? 1 : 0));

  const pool = eventPool(content, category, region, npc).filter((ev) =>
    (ev.dangerTier ?? 1) <= tier &&
    repeatAllowed(ev, s.eventHistory[ev.id], s.time.day) &&
    evalAll(ev.conditions, s, rng));

  const weighted = pool.map((ev) => {
    let w = ev.weight;
    if ((ev.dangerTier ?? 1) === tier) w *= SAME_TIER_WEIGHT;
    const last = s.eventHistory[ev.id]?.lastDay;
    if (last !== undefined && s.time.day - last <= RECENT_DAYS) w *= RECENT_WEIGHT;
    return { ev, w };
  });
  return weightedPick(weighted, rng) ?? content.events[fallbackId(category, region)] ?? null;
}

/**
 * 강제로 일어날 스토리 이벤트: 조건·반복 규칙을 만족하는 것 중 priority가 가장 높은 것 (같으면 ID 순). (SYSTEM_SPEC 4-3)
 * region이 있는 스토리는 그 지역을 탐험할 때만, 없는 스토리는 마을에서 행동을 고르기 전에 일어난다.
 */
export function selectStory(ctx: Ctx, region?: RegionId): EventDef | null {
  const s = ctx.draft;
  const pool = Object.values(ctx.content.events)
    .filter((ev) => ev.category === "story" && ev.region === region && repeatAllowed(ev, s.eventHistory[ev.id], s.time.day))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pool.find((ev) => evalAll(ev.conditions, s, ctx.rng)) ?? null;
}

/** 해당 종류·지역(·NPC)의 이벤트 (대체 이벤트 제외), ID 순 */
export function eventPool(content: Pick<ContentDB, "events">, category: EventCategory, region?: RegionId, npc?: string): EventDef[] {
  return Object.values(content.events)
    .filter((ev) => ev.category === category && !isFallback(ev) && (!region || ev.region === region) && (!npc || ev.npc === npc))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * 지금 나올 수 있는 이벤트 (화면 안내용: "오늘 나눌 이야기 3가지").
 * selectEvent와 같은 걸러내기를 하되 rng를 쓰지 않는다: 확률 조건(chance)은 나올 수 있는 것으로 친다.
 */
export function possibleEvents(run: RunState, content: Pick<ContentDB, "events">, category: EventCategory, region?: RegionId, npc?: string): EventDef[] {
  const tier = dangerTierForDay(run.time.day);
  return eventPool(content, category, region, npc).filter((ev) =>
    (ev.dangerTier ?? 1) <= tier &&
    repeatAllowed(ev, run.eventHistory[ev.id], run.time.day) &&
    ev.conditions.every((c) => c.type === "chance" || evalAll([c], run)));
}

export function repeatAllowed(ev: EventDef, h: EventHistoryEntry | undefined, day: number): boolean {
  if (!h) return true;
  switch (ev.repeat.mode) {
    case "once": return false;
    case "cooldown": return day - h.lastDay >= ev.repeat.days;
    case "always": return true;
  }
}

/** 이벤트를 봤다고 기록한다 (반복 규칙·최근 가중치용) */
export function recordEvent(run: RunState, id: string): void {
  const h = run.eventHistory[id];
  run.eventHistory[id] = { count: (h?.count ?? 0) + 1, lastDay: run.time.day };
}

/** 후보가 하나라도 있으면 rng를 정확히 한 번 쓴다 */
function weightedPick<T>(items: { ev: T; w: number }[], rng: Rng): T | null {
  const total = items.reduce((n, x) => n + x.w, 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const x of items) {
    roll -= x.w;
    if (roll < 0) return x.ev;
  }
  return items[items.length - 1].ev;
}
