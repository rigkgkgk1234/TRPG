/** 단어 이음표(WORD JOINER): 보이지 않고, 이 자리에서는 줄을 바꾸지 않는다 */
export const WJ = "\u2060";

/** 줄을 바꾸지 않는 띄어쓰기 */
const NBSP = "\u00a0";

/**
 * 띄어쓰기에서만 줄이 바뀌도록 붙어 있는 글자 사이에 단어 이음표를 넣는다.
 * 안드로이드(와 iOS 일부)는 한글을 글자 단위로 끊어 "안녕하 / 세요"처럼 나오기 때문이다.
 * 한 묶음으로 읽히는 것은 띄어쓰기에서도 끊지 않는다:
 * - 괄호 안: "(대성공 +6)", "(D20 / 8↑)"
 * - 이름과 수치: "피로 +2", "목표 10", "은화 3", "HP 12/12", "1d6"
 * 한 덩어리가 줄보다 길면 그때는 끊긴다.
 */
export function keepWords(text: string): string {
  const grouped = text
    .replace(/\([^()\n]*\)/g, (m) => m.replace(/ /g, NBSP))
    .replace(/ (?=[+\-−]?\d)/g, NBSP);
  return grouped.replace(/(\S)(?=\S)/gu, `$1${WJ}`);
}
