import { neededRoll } from "@/core/check/modifiers";
import { chanceBadge, chanceBadgeProps, rollFormula, rollModeNote } from "@/ui/rollText";
import { describe, expect, it } from "vitest";
import { createRng, resolveMode, rollCheck, successChance, type CheckContext, type CheckSpec } from "@/core/types";
import { d20Sequence } from "./fixtures";

const ctx = (value: number, adv: string[] = [], dis: string[] = []): CheckContext => ({
  modifiers: [{ label: "보정", value }],
  advantageSources: adv,
  disadvantageSources: dis,
});
const spec = (dc: number, extra: Partial<CheckSpec> = {}): CheckSpec => ({ stat: "agi", dc, ...extra });

describe("createRng", () => {
  it("같은 상태에서 시작하면 같은 수열", () => {
    const a = createRng({ seed: 42, state: 42 });
    const b = createRng({ seed: 42, state: 42 });
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("상태 객체를 이어서 갱신한다 (저장 후 복원해도 이어짐)", () => {
    const state = { seed: 7, state: 7 };
    const rng = createRng(state);
    rng();
    const saved = { ...state };
    const expected = rng();
    expect(createRng(saved)()).toBe(expected);
  });

  it("0 이상 1 미만, D20 눈이 고르게 나온다", () => {
    const rng = createRng({ seed: 1, state: 1 });
    const counts = Array(20).fill(0);
    for (let i = 0; i < 20000; i++) {
      const r = rng();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      counts[Math.floor(r * 20)]++;
    }
    for (const c of counts) expect(c).toBeGreaterThan(800); // 기대값 1000
  });
});

describe("resolveMode", () => {
  it("유리함과 불리함은 상쇄된다", () => {
    expect(resolveMode(ctx(0, ["정보"], ["지친 상태"]))).toBe("normal");
    expect(resolveMode(ctx(0, ["정보", "도구"]))).toBe("advantage");
    expect(resolveMode(ctx(0, [], ["지친 상태", "굶주림"]))).toBe("disadvantage");
  });

  it("forceMode가 우선한다", () => {
    expect(resolveMode(ctx(0, [], ["지친 상태"]), "advantage")).toBe("advantage");
  });
});

describe("rollCheck", () => {
  it("최종값이 DC 이상이면 성공, XP +1", () => {
    const r = rollCheck(spec(12), ctx(4), d20Sequence(8));
    expect(r.total).toBe(12);
    expect(r.outcome).toBe("success");
    expect(r.xpGained).toBe(1);
  });

  it("미달이면 실패, XP +2", () => {
    const r = rollCheck(spec(12), ctx(4), d20Sequence(7));
    expect(r.outcome).toBe("fail");
    expect(r.xpGained).toBe(2);
  });

  it("자연 20은 DC와 무관하게 대성공", () => {
    const r = rollCheck(spec(30), ctx(-1), d20Sequence(20));
    expect(r.outcome).toBe("critSuccess");
    expect(r.xpGained).toBe(3);
  });

  it("자연 1은 보정과 무관하게 대실패", () => {
    expect(rollCheck(spec(5), ctx(10), d20Sequence(1)).outcome).toBe("critFail");
  });

  it("부분 성공은 allowPartial일 때 DC-2까지만", () => {
    expect(rollCheck(spec(12, { allowPartial: true }), ctx(0), d20Sequence(10)).outcome).toBe("partial");
    expect(rollCheck(spec(12, { allowPartial: true }), ctx(0), d20Sequence(9)).outcome).toBe("fail");
    expect(rollCheck(spec(12), ctx(0), d20Sequence(11)).outcome).toBe("fail");
  });

  it("유리함은 높은 눈, 불리함은 낮은 눈을 채택", () => {
    const adv = rollCheck(spec(12), ctx(0, ["정보"]), d20Sequence(3, 15));
    expect(adv.dice).toEqual([3, 15]);
    expect(adv.kept).toBe(15);
    const dis = rollCheck(spec(12), ctx(0, [], ["지친 상태"]), d20Sequence(3, 15));
    expect(dis.kept).toBe(3);
  });

  it("유리함에서 20이 채택되면 대성공, 불리함에서 1이 채택되면 대실패", () => {
    expect(rollCheck(spec(12), ctx(0, ["정보"]), d20Sequence(1, 20)).outcome).toBe("critSuccess");
    expect(rollCheck(spec(12), ctx(0, [], ["지친 상태"]), d20Sequence(20, 1)).outcome).toBe("critFail");
  });
});

describe("successChance — SYSTEM_SPEC 2-5 표", () => {
  it.each([
    [1, 11, "normal", 0.55],   // 시작 농부 쇠갈퀴 vs 늑대
    [4, 11, "normal", 0.7],    // 시작 사냥꾼 활
    [4, 11, "disadvantage", 0.49],
    [7, 11, "normal", 0.85],   // 20일차 사냥꾼
    [1, 12, "normal", 0.5],    // 시작 대장장이 흥정
    [2, 10, "normal", 0.65],   // 사망 굴림, 체력 +2
  ] as const)("보정 %i, DC %i, %s → %f", (mod, dc, mode, expected) => {
    expect(successChance(mod, dc, mode)).toBeCloseTo(expected, 5);
  });

  it("5%~95%로 제한된다", () => {
    expect(successChance(-10, 20, "normal")).toBeCloseTo(0.05);
    expect(successChance(20, 5, "normal")).toBeCloseTo(0.95);
  });

  it("몬테카를로 결과와 일치한다", () => {
    const rng = createRng({ seed: 99, state: 99 });
    let wins = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = rollCheck(spec(14), ctx(3, ["정보"]), rng);
      if (r.outcome === "success" || r.outcome === "critSuccess") wins++;
    }
    expect(wins / N).toBeCloseTo(successChance(3, 14, "advantage"), 1);
  });
});

describe("필요 굴림", () => {
  it("D20 + 보정 ≥ DC가 되는 최소 눈, 2~20으로 자른다 (1은 늘 실패, 20은 늘 성공)", () => {
    expect(neededRoll(3, 12)).toBe(9);
    expect(neededRoll(0, 10)).toBe(10);
    expect(neededRoll(15, 10)).toBe(2);
    expect(neededRoll(-5, 20)).toBe(20);
  });
});

describe("굴림 표시", () => {
  const spec: CheckSpec = { stat: "agi", skill: "bow", dc: 12 };
  const r = rollCheck(spec, { modifiers: [{ label: "민첩", value: 2 }, { label: "활", value: 2 }, { label: "가죽", value: 0 }, { label: "경상", value: -2 }], advantageSources: ["사전 정보"], disadvantageSources: [] }, d20Sequence(14, 6));
  it("확률 배지는 45%(D20 / 12↑), 버튼에서는 괄호 안을 따로 (작게 그린다)", () => {
    expect(chanceBadge(0.45, 12)).toBe("45%(D20 / 12↑)");
    expect(chanceBadge(0.45)).toBe("45%");
    expect(chanceBadgeProps(0.45, 12)).toEqual({ badge: "45%", badgeNote: "D20 / 12↑" });
  });
  it("계산식은 숫자(무엇) 차례로, 0인 보정은 뺀다. 유리함이면 어느 눈을 썼는지", () => {
    expect(rollFormula(r)).toBe("14(D20) + 2(민첩) + 2(활) − 2(경상) = 16");
    expect(rollModeNote(r)).toBe("유리함: 14와 6 중 높은 눈");
  });
});
