import type { Ctx, ResourceKey } from "../commands";
import { FATIGUE_MAX, maxHp, type WoundLevel } from "../types";

/** 자원 변화는 모두 이 함수들을 거친다: 범위 제한 + 피드 기록이 한 곳에 모인다. */

const REPUTATION_MAX = 100;
/** 말솜씨가 이 이상이면 평판을 얻을 때 +1 (SYSTEM_SPEC 1-2) */
const CHA_REPUTATION_BONUS_AT = 2;

export function changeSilver(ctx: Ctx, delta: number): void {
  const r = ctx.draft.resources;
  const next = Math.max(0, r.silver + delta);
  record(ctx, "silver", next - r.silver);
  r.silver = next;
}

export function changeFood(ctx: Ctx, delta: number): void {
  const r = ctx.draft.resources;
  const next = Math.max(0, r.food + delta);
  record(ctx, "food", next - r.food);
  r.food = next;
}

export function changeDebt(ctx: Ctx, delta: number): void {
  const r = ctx.draft.resources;
  const next = Math.max(0, r.debt + delta);
  record(ctx, "debt", next - r.debt);
  r.debt = next;
}

/** 피로가 10에 닿으면 탈진: 그날은 끝나고 다음 날 오전을 잃는다. (SYSTEM_SPEC 6-3) */
export function changeFatigue(ctx: Ctx, delta: number): void {
  const { resources: r, time } = ctx.draft;
  const next = Math.min(FATIGUE_MAX, Math.max(0, r.fatigue + delta));
  record(ctx, "fatigue", next - r.fatigue);
  r.fatigue = next;
  if (next >= FATIGUE_MAX && !time.collapsedToday) {
    time.collapsedToday = true;
    time.skipNextAm = true;
    ctx.feed.push({ kind: "text", text: "눈앞이 하얘진다. 그대로 주저앉았다. (탈진: 오늘은 끝, 내일 오전도 쉰다)" });
  }
}

export function changeHp(ctx: Ctx, delta: number): void {
  const s = ctx.draft;
  const next = Math.min(maxHp(s.player.stats), Math.max(0, s.player.hp + delta));
  record(ctx, "hp", next - s.player.hp);
  s.player.hp = next;
  if (!s.stats.lowestHp || next < s.stats.lowestHp.hp) s.stats.lowestHp = { hp: next, day: s.time.day };
}

export function changeReputation(ctx: Ctx, delta: number): void {
  const p = ctx.draft.player;
  const bonus = delta > 0 && p.stats.cha >= CHA_REPUTATION_BONUS_AT ? 1 : 0;
  const next = Math.min(REPUTATION_MAX, Math.max(0, p.reputation + delta + bonus));
  record(ctx, "reputation", next - p.reputation);
  p.reputation = next;
}

const WOUND_ORDER: WoundLevel[] = ["none", "light", "serious", "critical"];

/** 부상을 steps 단계 악화시킨다 (치명상이 끝). 단계가 바뀌면 회복 카운트는 새로 센다. */
export function worsenWound(ctx: Ctx, steps = 1): void {
  const w = ctx.draft.player.wound;
  const next = WOUND_ORDER[Math.min(WOUND_ORDER.length - 1, WOUND_ORDER.indexOf(w.level) + steps)];
  if (next !== w.level) setWound(ctx, next);
}

export function setWound(ctx: Ctx, level: WoundLevel): void {
  ctx.draft.player.wound = { level, restCount: 0, treatedDays: null, untreatedDays: 0 };
  ctx.feed.push({ kind: "wound", level });
}

function record(ctx: Ctx, key: ResourceKey, delta: number): void {
  if (delta !== 0) ctx.feed.push({ kind: "resource", key, delta });
}
