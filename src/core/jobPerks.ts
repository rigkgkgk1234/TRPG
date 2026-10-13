import type { JobId, RegionId } from "./types";

/**
 * 직업 고유 규칙의 수치 (SYSTEM_SPEC 1-5). 규칙을 쓰는 곳은 각 모듈이고, 수치와 "누가 받는가"만 여기 모은다.
 * 대장장이 견습의 수리비 반값(items/shop.ts)과 대장간 화상(day/actions.ts)은 원래 자리에 둔다.
 */

/** 약초꾼: 약초를 쓰면 경상이 늘 낫는다 (다른 직업은 50%) */
export const HERB_SURE_HEAL_JOB: JobId = "herbalist";
/** 약초꾼: 이 지역의 탐험 판정 +1 */
export const HERBALIST_REGION: RegionId = "marsh";
export const HERBALIST_REGION_BONUS = 1;

/** 경비대 신병: 방어 자세 보너스 +1, 습격 때 자경단 +1명 */
export const RECRUIT_DEFEND_BONUS = 1;
export const RECRUIT_MILITIA_BONUS = 1;

/** 옛 병사의 자식: 강타 명중 벌점이 이만큼 줄어든다 (−2 → −1) */
export const SOLDIER_CHILD_POWER_RELIEF = 1;

/** 나무꾼: 이 지역 탐험의 피로가 1 적다 */
export const WOODCUTTER_REGION: RegionId = "forest";
export const WOODCUTTER_EXPLORE_RELIEF = 1;

/** 여관 심부름꾼: 평판이 오를 때 +1 더, 여관 물건값 반값 (올림) */
export const ERRAND_REPUTATION_BONUS = 1;
export const ERRAND_INN_DISCOUNT = 0.5;

/** 떠돌이 행상: 파는 값 +20% */
export const PEDDLER_SELL_BONUS = 0.2;

/** 수도원 견습: 밤에 피로가 1 더 풀린다 */
export const ACOLYTE_SLEEP_BONUS = 1;
