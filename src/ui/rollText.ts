import { MODE_LABEL } from "@/core/labels";
import type { CheckResult } from "@/core/types";

/**
 * 굴림·확률 표시. 숫자 뒤 괄호에 무엇의 값인지 적는다: "9(D20) + 1(근력)".
 * 괄호 안은 화면에서 숫자보다 작게 그리므로(RollFormula·ActionButton의 badgeNote) 값과 설명을 나눠 돌려준다.
 */

/** 확률 배지: 큰 글씨 "70%", 작은 글씨 "D20 / 7↑" (주사위에서 7 이상이면 성공) */
export function chanceParts(chance: number, need?: number): { main: string; note?: string } {
  const main = `${Math.round(chance * 100)}%`;
  return need === undefined ? { main } : { main, note: `D20 / ${need}↑` };
}

/** ActionButton에 그대로 펼쳐 넣는 배지: { badge: "70%", badgeNote: "D20 / 7↑" } */
export function chanceBadgeProps(chance: number, need?: number): { badge: string; badgeNote?: string } {
  const { main, note } = chanceParts(chance, need);
  return { badge: main, badgeNote: note };
}

/** 글자 하나로 써야 할 때 (칩 등): "70%(D20 / 7↑)" */
export function chanceBadge(chance: number, need?: number): string {
  const { main, note } = chanceParts(chance, need);
  return note ? `${main}(${note})` : main;
}

/** 계산식의 한 항: 부호, 값, 무엇의 값인지 */
export interface RollTerm { sign: "+" | "−" | null; value: number; label: string }

/** D20 눈과 0이 아닌 보정들. 첫 항은 늘 D20. */
export function rollTerms(r: CheckResult): RollTerm[] {
  return [
    { sign: null, value: r.kept, label: "D20" },
    ...r.modifiers.filter((m) => m.value !== 0).map((m): RollTerm => ({ sign: m.value > 0 ? "+" : "−", value: Math.abs(m.value), label: m.label })),
  ];
}

/** 글자로 쓴 계산식: "9(D20) + 1(근력) + 2(농사) = 12" */
export function rollFormula(r: CheckResult): string {
  const body = rollTerms(r).map((t) => `${t.sign ? ` ${t.sign} ` : ""}${t.value}(${t.label})`).join("");
  return `${body} = ${r.total}`;
}

/** 유리함·불리함이면 두 주사위 중 어느 쪽을 썼는지: "유리함: 14와 6 중 높은 눈" */
export function rollModeNote(r: CheckResult): string | null {
  if (r.mode === "normal" || r.dice.length < 2) return null;
  const [a, b] = r.dice;
  return `${MODE_LABEL[r.mode]}: ${a}${withAnd(a)} ${b} 중 ${r.mode === "advantage" ? "높은" : "낮은"} 눈`;
}

/** 숫자 뒤 "과/와": 일·삼·육·칠·팔·십으로 끝나게 읽히면 받침이 있어 "과" */
function withAnd(n: number): string {
  return [0, 1, 3, 6, 7, 8].includes(n % 10) ? "과" : "와";
}
