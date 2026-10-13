import type { DiceExpr, Rng } from "../types";

export interface ParsedDice { count: number; sides: number; mod: number }

/** "1d6+1" → { count: 1, sides: 6, mod: 1 } */
export function parseDice(expr: DiceExpr): ParsedDice {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(expr);
  if (!m) throw new Error(`주사위 표기가 잘못됨: ${expr}`);
  return { count: Number(m[1]), sides: Number(m[2]), mod: Number(m[3] ?? 0) };
}

/** 주사위를 굴린 합. doubleDice면 주사위 개수만 2배 (보정은 한 번만, SYSTEM_SPEC 3-3 대성공) */
export function rollDice(expr: DiceExpr, rng: Rng, doubleDice = false): number {
  const { count, sides, mod } = parseDice(expr);
  let sum = mod;
  for (let i = 0; i < count * (doubleDice ? 2 : 1); i++) sum += Math.floor(rng() * sides) + 1;
  return sum;
}

/** 대성공 전에 피해가 가장 큰 눈 (자연 20은 대성공) */
const TOP_ROLL = 19;

/**
 * 명중 굴림 하나로 피해까지 정한다 (플레이어 공격, SYSTEM_SPEC 3-3).
 * 맞히는 데 필요한 최소 눈(need)이면 무기 주사위의 최소 피해, 19면 최대 피해, 그 사이는 고르게 오른다 → 평균은 주사위를 굴린 것과 같다.
 * 대성공(자연 20)은 주사위 두 배를 굴린 평균(올림)이라 최대 피해보다 크다 (1d6 → 7, 1d8 → 9). 보정(+1 등)은 한 번만.
 */
export function damageFromRoll(expr: DiceExpr, kept: number, need: number, crit: boolean): number {
  const { count, sides, mod } = parseDice(expr);
  if (crit) return Math.ceil(count * (sides + 1)) + mod;
  const min = count + mod;
  const max = count * sides + mod;
  if (need >= TOP_ROLL) return max;
  const frac = Math.min(1, Math.max(0, (kept - need) / (TOP_ROLL - need)));
  return min + Math.round((max - min) * frac);
}

/** 무기 피해의 범위 [최소, 최대] (화면 표시용) */
export function damageRange(expr: DiceExpr): [number, number] {
  const { count, sides, mod } = parseDice(expr);
  return [count + mod, count * sides + mod];
}
