import type { ContentDB } from "@/core/content";
import { JOBS, type EventDef, type ItemDef, type TraitDef } from "@/core/types";
import generated from "./content.generated.json";

/**
 * 앱과 시뮬레이터가 쓰는 콘텐츠. src/data의 JSON 원본을 build-content가 검증하고 합친 결과다.
 * JSON 원본을 고쳤으면 npm run build:content (npm start는 자동). 테스트가 생성 파일이 최신인지 확인한다.
 * JSON의 문자열은 DiceExpr 같은 좁은 타입으로 추론되지 않으므로 여기서 한 번 단언한다 (검증은 build-content가 맡는다).
 */
export const CONTENT: ContentDB = {
  items: generated.items as unknown as Record<string, ItemDef>,
  traits: generated.traits as unknown as Record<string, TraitDef>,
  events: generated.events as unknown as Record<string, EventDef>,
  jobs: JOBS,
  enemies: {},
};
