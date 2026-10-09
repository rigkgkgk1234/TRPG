import { SKILL_IDS, STAT_IDS } from "../labels";
import { INVENTORY_CAPACITY, type RunState, type SkillId, type Skills, type StatId, type Stats, type WoundLevel } from "../types";

/** 판정에 필요한 상태만 골라낸 것. 테스트·개발 화면에서 RunState 전체 없이도 쓸 수 있다. */
export type CheckSubject = Pick<RunState, "player" | "resources" | "inventory">;

export interface SubjectOptions {
  stats?: Partial<Stats>;
  skills?: Partial<Record<SkillId, number>>;
  fatigue?: number;
  hunger?: number;
  wound?: WoundLevel;
  traits?: string[];
  armor?: string;
}

/** 값을 지정한 것 외에는 모두 0·빈 상태인 판정 대상. 2주차의 newRun이 실제 게임용 초기 상태를 만든다. */
export function blankSubject(opts: SubjectOptions = {}): CheckSubject {
  const stats = Object.fromEntries(STAT_IDS.map((s) => [s, opts.stats?.[s] ?? 0])) as Stats;
  const skills = Object.fromEntries(SKILL_IDS.map((s) => [s, { rank: opts.skills?.[s] ?? 0, xp: 0 }])) as Skills;
  const statUses = Object.fromEntries(STAT_IDS.map((s) => [s, 0])) as Record<StatId, number>;
  return {
    player: {
      name: "",
      job: "farmer",
      stats,
      statUses,
      skills,
      skillXpToday: {},
      hp: 10,
      wound: { level: opts.wound ?? "none", restCount: 0, treatedDays: null, untreatedDays: 0 },
      traits: opts.traits ?? [],
      reputation: 10,
      fame: 0,
    },
    resources: { silver: 0, food: 0, debt: 0, fatigue: opts.fatigue ?? 0, hunger: opts.hunger ?? 0, familyHunger: 0 },
    inventory: {
      slots: Array(INVENTORY_CAPACITY).fill(null),
      capacity: INVENTORY_CAPACITY,
      equipment: { weapon: null, offHand: null, head: null, armor: opts.armor ? { itemId: opts.armor, qty: 1, durability: 25 } : null, legs: null, feet: null },
    },
  };
}
