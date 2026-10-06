import type { Ctx } from "../commands";
import { FOOD_PRICE, type RunState } from "../types";
import { changeDebt, changeFood, changeSilver } from "./resources";

/**
 * 마을 거래 중 2주차에 필요한 두 가지: 식량 사기(여관 토비), 빚 갚기.
 * 거래는 행동 슬롯을 쓰지 않는다. 상점·대장간·의원은 5주차 shop.ts에서.
 * 평판 가격 보정(SYSTEM_SPEC 5-4)은 식량에 적용하지 않는다 — 시작 평판 5인 사냥꾼은 식량값이 두 배가 되어 경제 기준선이 깨진다.
 */
export function canTrade(run: RunState): boolean {
  return !run.ending && !run.activeEvent && !run.combat;
}

export function maxFoodAffordable(run: RunState): number {
  return Math.floor(run.resources.silver / FOOD_PRICE);
}

/** @returns 거래가 이뤄졌으면 true */
export function buyFood(ctx: Ctx, qty: number): boolean {
  const n = Math.floor(qty);
  if (!canTrade(ctx.draft)) return reject(ctx, "지금은 살 수 없다");
  if (!validQty(n)) return reject(ctx, "살 수량이 올바르지 않다");
  if (n > maxFoodAffordable(ctx.draft)) return reject(ctx, "은화가 모자란다");
  changeSilver(ctx, -n * FOOD_PRICE);
  changeFood(ctx, n);
  return true;
}

/** 가진 은화와 빚 중 작은 만큼만 갚는다. */
export function payDebt(ctx: Ctx, qty: number): boolean {
  const r = ctx.draft.resources;
  if (!canTrade(ctx.draft)) return reject(ctx, "지금은 갚을 수 없다");
  if (!validQty(Math.floor(qty))) return reject(ctx, "갚을 금액이 올바르지 않다");
  if (r.debt === 0) return reject(ctx, "갚을 빚이 없다");
  if (r.silver === 0) return reject(ctx, "갚을 은화가 없다");
  const n = Math.min(Math.floor(qty), r.debt, r.silver);
  changeSilver(ctx, -n);
  changeDebt(ctx, -n);
  return true;
}

/** NaN·Infinity·0 이하를 막는다. 명령은 UI 밖(시뮬레이터·마이그레이션)에서도 오므로 엔진이 직접 검사한다. */
function validQty(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

function reject(ctx: Ctx, text: string): false {
  ctx.feed.push({ kind: "toast", text });
  return false;
}
