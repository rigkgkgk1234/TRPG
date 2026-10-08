import { describe, expect, it } from "vitest";
import { keepWords } from "@/ui/keepWords";

/** 줄을 바꿀 수 있는 자리를 "|"로 보여 준다 (보통 띄어쓰기만 남는다) */
const breaks = (t: string) => keepWords(t).replace(/⁠/g, "").replace(/ /g, "_").replace(/ /g, "|");

describe("줄바꿈 자리", () => {
  it("낱말 안에서는 끊지 않는다", () => {
    expect(keepWords("안녕하세요")).toBe("안⁠녕⁠하⁠세⁠요");
    expect(breaks("안녕하세요 반갑다")).toBe("안녕하세요|반갑다");
  });

  it("괄호 안과 이름·수치는 한 묶음으로 둔다", () => {
    expect(breaks("성공하면 성장 +5, 실패해도 +3 (대성공 +6)")).toBe("성공하면|성장_+5,|실패해도_+3|(대성공_+6)");
    expect(breaks("42%(D20 / 8↑)")).toBe("42%(D20_/_8↑)");
    expect(breaks("판정 목표 10, 피로 +2")).toBe("판정|목표_10,|피로_+2");
  });
});
