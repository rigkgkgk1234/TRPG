import { describe, expect, it } from "vitest";
import { buildCheckContext, previewCheck, sumModifiers } from "@/core/check/modifiers";
import type { ContentDB } from "@/core/content";
import { SAMPLE_ITEMS, type CheckSpec } from "@/core/types";
import { makeSubject } from "./fixtures";

const content: Pick<ContentDB, "items" | "traits"> = {
  items: Object.fromEntries(SAMPLE_ITEMS.map((item) => [item.id, item])),
  traits: {
    wolf_hunter: { id: "wolf_hunter", name: "늑대 사냥꾼", description: "", checkBonus: { tags: ["beast"], value: 1 } },
    survivor: { id: "survivor", name: "죽다 살아난 자", description: "", advantageTags: ["fear"] },
    calloused: { id: "calloused", name: "굳은살", description: "", checkBonus: { tags: [], value: 1 } },
    keen_eye: { id: "keen_eye", name: "밝은 눈", description: "", checkBonus: { stat: "per", value: 1 } },
  },
};

const bow: CheckSpec = { stat: "agi", skill: "bow", dc: 12 };

describe("buildCheckContext", () => {
  it("능력치 → 숙련 순서로 보정을 쌓는다", () => {
    const c = buildCheckContext(makeSubject({ stats: { agi: 2 }, skills: { bow: 2 } }), bow, content);
    expect(c.modifiers).toEqual([{ label: "민첩", value: 2 }, { label: "활", value: 2 }]);
    expect(sumModifiers(c)).toBe(4);
    expect(c.advantageSources).toEqual([]);
    expect(c.disadvantageSources).toEqual([]);
  });

  it("경상은 근력·민첩 판정에만 -2", () => {
    expect(sumModifiers(buildCheckContext(makeSubject({ wound: "light" }), bow, content))).toBe(-2);
    const per = buildCheckContext(makeSubject({ wound: "light" }), { stat: "per", dc: 10 }, content);
    expect(sumModifiers(per)).toBe(0);
  });

  it("중상은 모든 판정 -4에 불리함", () => {
    const c = buildCheckContext(makeSubject({ wound: "serious" }), { stat: "cha", dc: 10 }, content);
    expect(sumModifiers(c)).toBe(-4);
    expect(c.disadvantageSources).toContain("중상");
  });

  it("방어구 페널티는 해당 능력치에만", () => {
    const subject = makeSubject({ armor: "chain_shirt" });
    expect(buildCheckContext(subject, bow, content).modifiers).toContainEqual({ label: "사슬 셔츠", value: -1 });
    expect(buildCheckContext(subject, { stat: "str", dc: 10 }, content).modifiers).toHaveLength(1);
  });

  it("피로 7 이상, 굶주림 2 이상이면 불리함", () => {
    expect(buildCheckContext(makeSubject({ fatigue: 6 }), bow, content).disadvantageSources).toEqual([]);
    expect(buildCheckContext(makeSubject({ fatigue: 7, hunger: 2 }), bow, content).disadvantageSources).toEqual(["지친 상태", "굶주림"]);
  });

  it("흔적 보정은 태그가 맞을 때만", () => {
    const subject = makeSubject({ traits: ["wolf_hunter"] });
    expect(sumModifiers(buildCheckContext(subject, { ...bow, tags: ["beast"] }, content))).toBe(1);
    expect(sumModifiers(buildCheckContext(subject, bow, content))).toBe(0);
  });

  it("흔적 유리함과 상황 유리/불리를 합친다", () => {
    const subject = makeSubject({ traits: ["survivor"], fatigue: 8 });
    const c = buildCheckContext(subject, { stat: "con", dc: 12, tags: ["fear"] }, content, { advantage: ["정찰 정보"] });
    expect(c.advantageSources).toEqual(["정찰 정보", "죽다 살아난 자"]);
    expect(c.disadvantageSources).toEqual(["지친 상태"]);
  });

  it("상황 보정과 알 수 없는 흔적 ID", () => {
    const c = buildCheckContext(makeSubject({ traits: ["unknown"] }), { ...bow, situational: 2 }, content);
    expect(c.modifiers.at(-1)).toEqual({ label: "상황", value: 2 });
  });

  it("tags가 빈 배열이면 모든 판정에, stat만 있으면 그 능력치에만", () => {
    expect(sumModifiers(buildCheckContext(makeSubject({ traits: ["calloused"] }), bow, content))).toBe(1);
    expect(sumModifiers(buildCheckContext(makeSubject({ traits: ["keen_eye"] }), bow, content))).toBe(0);
    expect(sumModifiers(buildCheckContext(makeSubject({ traits: ["keen_eye"] }), { stat: "per", dc: 10 }, content))).toBe(1);
  });

  it("같은 흔적이 중복 기록돼도 한 번만 적용", () => {
    const c = buildCheckContext(makeSubject({ traits: ["wolf_hunter", "wolf_hunter"] }), { ...bow, tags: ["beast"] }, content);
    expect(c.modifiers.filter((m) => m.label === "늑대 사냥꾼")).toHaveLength(1);
  });

  it("능력치는 최종 상한 +5, 하한 -1로 자른다", () => {
    expect(buildCheckContext(makeSubject({ stats: { agi: 9 } }), bow, content).modifiers[0].value).toBe(5);
    expect(buildCheckContext(makeSubject({ stats: { agi: -3 } }), bow, content).modifiers[0].value).toBe(-1);
  });
});

describe("previewCheck", () => {
  it("forceMode를 rollCheck와 똑같이 반영한다", () => {
    const subject = makeSubject({ stats: { agi: 2 }, skills: { bow: 2 }, fatigue: 8 });
    const forced: CheckSpec = { ...bow, dc: 11, forceMode: "advantage" };
    const p = previewCheck(forced, buildCheckContext(subject, forced, content));
    expect(p.mode).toBe("advantage");
    expect(p.modifierTotal).toBe(4);
    expect(p.chance).toBeCloseTo(1 - 0.3 ** 2);
  });
});
