import type { ContentDB } from "@/core/content";
import { JOBS, type ItemDef, type TraitDef } from "@/core/types";
import items from "./items.json";
import traits from "./traits.json";

/**
 * 앱과 시뮬레이터가 쓰는 콘텐츠.
 * 지금은 JSON을 직접 import한다. 3주차에 build-content(구조·참조 검증)가 생기면 content.generated.json으로 바꾼다.
 * JSON의 문자열은 DiceExpr 같은 좁은 타입으로 추론되지 않으므로 여기서 한 번 단언한다 (검증은 테스트가 맡는다).
 */
export const CONTENT: ContentDB = {
  items: byId(items as unknown as ItemDef[]),
  traits: byId(traits as TraitDef[]),
  jobs: JOBS,
  enemies: {},
  events: {},
};

function byId<T extends { id: string }>(list: T[]): Record<string, T> {
  return Object.fromEntries(list.map((x) => [x.id, x]));
}
