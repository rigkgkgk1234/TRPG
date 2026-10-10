import type { CombatFx } from "@/core/commands";

/** 활 대성공 연사: 화살 세 발이 이 간격(ms)으로 하나씩 꽂힌다 */
export const VOLLEY_GAP_MS = 100;
export const VOLLEY_SHOTS = 3;

/** 활로 급소를 맞힌 공격이면 화살 세 발로 나눠 보여 준다 (규칙상 피해는 한 번이다. 연출만 나눈다) */
export function isVolley(fx: CombatFx): boolean {
  return fx.side === "player" && fx.hit && fx.crit && fx.weapon === "bow";
}

/** 피해를 세 발로 나눈다: 나머지는 앞 화살부터 1씩 (7 → 3, 2, 2) */
export function volleyParts(damage: number): number[] {
  const base = Math.floor(damage / VOLLEY_SHOTS);
  const rest = damage - base * VOLLEY_SHOTS;
  return Array.from({ length: VOLLEY_SHOTS }, (_, i) => base + (i < rest ? 1 : 0));
}
