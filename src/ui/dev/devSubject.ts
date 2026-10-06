import type { CheckSubject } from "@/core/check/modifiers";
import { blankSubject } from "@/core/check/subject";
import type { ContentDB } from "@/core/content";
import { SAMPLE_ITEMS, type SkillId, type StatId, type WoundLevel } from "@/core/types";

/** 개발용 판정 테스트 화면의 입력값 */
export interface DevCheckInput {
  stat: StatId;
  statValue: number;
  skill: SkillId | null;
  skillRank: number;
  fatigued: boolean;
  hungry: boolean;
  wound: WoundLevel;
  chainShirt: boolean;
}

/** 입력값을 판정 대상 상태로 바꾼다. 실제 게임에서는 RunState가 이 역할을 한다. */
export function devSubject(input: DevCheckInput): CheckSubject {
  return blankSubject({
    stats: { [input.stat]: input.statValue },
    skills: input.skill ? { [input.skill]: input.skillRank } : {},
    fatigue: input.fatigued ? 8 : 0,
    hunger: input.hungry ? 2 : 0,
    wound: input.wound,
    armor: input.chainShirt ? "chain_shirt" : undefined,
  });
}

export const DEV_CONTENT: Pick<ContentDB, "items" | "traits"> = {
  items: Object.fromEntries(SAMPLE_ITEMS.map((item) => [item.id, item])),
  traits: {},
};
