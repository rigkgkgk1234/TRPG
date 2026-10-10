import { describe, expect, it } from "vitest";
import { isVolley, volleyParts } from "@/store/volley";

describe("활 대성공 연사", () => {
  it("피해를 세 발로 나누고, 나머지는 앞 화살부터 1씩 더한다", () => {
    expect(volleyParts(9)).toEqual([3, 3, 3]);
    expect(volleyParts(7)).toEqual([3, 2, 2]);
    expect(volleyParts(2)).toEqual([1, 1, 0]);
    for (const d of [1, 5, 8, 13]) expect(volleyParts(d).reduce((a, b) => a + b, 0)).toBe(d);
  });

  it("활로 급소를 맞혔을 때만 연사로 보여 준다", () => {
    const fx = { side: "player", targetId: "wolf_1", weapon: "bow", hand: "main", hit: true, crit: true, damage: 9 } as const;
    expect(isVolley(fx)).toBe(true);
    expect(isVolley({ ...fx, crit: false })).toBe(false);
    expect(isVolley({ ...fx, weapon: "blade" })).toBe(false);
  });
});
