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

/** 평균 피해 (화면 표시용) */
export function averageDice(expr: DiceExpr): number {
  const { count, sides, mod } = parseDice(expr);
  return count * (sides + 1) / 2 + mod;
}
