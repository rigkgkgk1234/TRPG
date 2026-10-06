import type { EnemyDef, EnemyId, EventDef, EventId, ItemDef, ItemId, JobDef, JobId, TraitDef, TraitId } from "./types";

/** 빌드된 콘텐츠 전체. 코어 함수는 이것을 인자로 받기만 하고 직접 import하지 않는다. */
export interface ContentDB {
  items: Record<ItemId, ItemDef>;
  enemies: Record<EnemyId, EnemyDef>;
  events: Record<EventId, EventDef>;
  jobs: Partial<Record<JobId, JobDef>>;
  traits: Record<TraitId, TraitDef>;
}

export function emptyContent(): ContentDB {
  return { items: {}, enemies: {}, events: {}, jobs: {}, traits: {} };
}
