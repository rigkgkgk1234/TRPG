import type { ActiveEventState, RegionId } from "../types";

/** 탐험 한 번에 기본으로 뽑는 카드 수, 그 뒤 "더 깊이"를 고르면 1장 더 (SYSTEM_SPEC 4-3) */
export const EXPLORE_CARDS = 2;
export const EXPLORE_MAX_CARDS = EXPLORE_CARDS + 1;
/** "더 깊이"의 추가 피로 (SYSTEM_SPEC 6-2) */
export const DEEP_FATIGUE = 1;

/** 탐험할 수 있는 지역. 로웬·늪지는 확장. */
export const EXPLORE_REGIONS: readonly RegionId[] = ["forest", "watchtower"];

/**
 * 탐험 카드 2장을 다 보고 "더 깊이 갈까?"를 묻는 중인 상태.
 * 이벤트는 끝났지만 탐험은 이어질 수 있으므로 activeEvent를 남겨 두고 장면을 "END"로 둔다.
 */
export function isDeeperPrompt(a: ActiveEventState | null): boolean {
  return !!a?.explore && a.sceneId === "END";
}

/** 남은 탐험 카드를 버린다 (endDay 효과·탈진). 지금 카드가 끝나면 탐험도 끝난다. */
export function stopExplore(explore: NonNullable<ActiveEventState["explore"]>): void {
  explore.cardsDrawn = EXPLORE_MAX_CARDS;
  explore.deep = true;
}

/** 위험 등급: 1~10일차 1, 11~20일차 2, 21일차~ 3 */
export function dangerTierForDay(day: number): 1 | 2 | 3 {
  return day <= 10 ? 1 : day <= 20 ? 2 : 3;
}
