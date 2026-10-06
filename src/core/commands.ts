import type { ContentDB } from "./content";
import type { CheckResult, DailyActionId, ItemId, RegionId, Rng, RunState, SkillId, StatId, WoundLevel } from "./types";

/** UI가 엔진에 보낼 수 있는 명령. 전투·가방 명령은 4·5주차에 더한다. (ARCHITECTURE 3-1) */
export type GameCommand =
  | { type: "chooseAction"; action: DailyActionId; skill?: SkillId; region?: RegionId }
  /** 이벤트 장면의 선택지 */
  | { type: "chooseChoice"; choiceId: string }
  /** 선택지가 없는 장면의 "계속" */
  | { type: "continue" }
  /** 탐험 카드 2장 뒤 "더 깊이" 갈지 */
  | { type: "goDeeper"; yes: boolean }
  /** 저녁 정산 실행. 식량이 모자랄 때 누구부터 먹일지 고른다 */
  | { type: "endDay"; order?: FeedOrder }
  | { type: "shop"; op: "buyFood" | "payDebt"; qty: number };

export type FeedOrder = "selfFirst" | "familyFirst";

/** 화면이 순서대로 보여 줄 결과. 상태는 이미 확정된 뒤다. */
export type FeedItem =
  | { kind: "text"; text: string }
  | { kind: "roll"; label: string; result: CheckResult }
  | { kind: "resource"; key: ResourceKey; delta: number }
  | { kind: "item"; itemId: ItemId; name: string; delta: number }
  | { kind: "levelUp"; skill?: SkillId; stat?: StatId; newValue: number }
  | { kind: "wound"; level: WoundLevel }
  | { kind: "toast"; text: string };

export type ResourceKey = "silver" | "food" | "hp" | "fatigue" | "reputation" | "debt";

export interface DispatchResult {
  state: RunState;
  feed: FeedItem[];
  /** 저장해야 하는 지점이면 true */
  save: boolean;
  /** 백업 체크포인트까지 갱신해야 하면 true (하루 시작) */
  checkpoint: boolean;
}

/** 코어 함수에 넘기는 묶음. draft는 immer 초안이라 직접 고쳐도 된다. */
export interface Ctx {
  draft: RunState;
  content: ContentDB;
  rng: Rng;
  feed: FeedItem[];
}
