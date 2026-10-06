import type { CheckOutcome, DayPhase, EndingId, RollMode, SkillId, StatId, WoundLevel } from "./types";

/** 보정치 표기: +2, 0, -1 */
export function formatSigned(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

export const STAT_IDS: readonly StatId[] = ["str", "agi", "con", "per", "cha"];
export const SKILL_IDS: readonly SkillId[] = ["blade", "blunt", "bow", "guard", "farming", "smithing", "tracking", "herbalism"];

export const STAT_LABEL: Record<StatId, string> = {
  str: "근력",
  agi: "민첩",
  con: "체력",
  per: "감각",
  cha: "말솜씨",
};

export const SKILL_LABEL: Record<SkillId, string> = {
  blade: "검술",
  blunt: "둔기",
  bow: "활",
  guard: "방어",
  farming: "농사",
  smithing: "대장일",
  tracking: "추적",
  herbalism: "약초",
};

export const OUTCOME_LABEL: Record<CheckOutcome, string> = {
  critSuccess: "대성공",
  success: "성공",
  partial: "부분 성공",
  fail: "실패",
  critFail: "대실패",
};

export const MODE_LABEL: Record<RollMode, string> = {
  normal: "일반",
  advantage: "유리함",
  disadvantage: "불리함",
};

export const WOUND_LABEL: Record<WoundLevel, string> = {
  none: "없음",
  light: "경상",
  serious: "중상",
  critical: "치명상",
};

export const PHASE_LABEL: Record<DayPhase, string> = {
  morning: "아침",
  am: "오전",
  pm: "오후",
  evening: "저녁",
};

export const ENDING_LABEL: Record<EndingId, string> = {
  shield_of_village: "마을의 방패",
  flee_together: "이웃과 함께 떠나다",
  rowen_spearman: "로웬의 창병",
  survivor: "살아남은 자",
  debtor: "빚진 자",
  death: "사망",
};
