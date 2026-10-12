import type { ItemDef } from "@/core/types";

/** 가게 목록의 정렬 기준. 기본은 가격 오름차순 */
export type SortKey = "price" | "kind";
export interface SortState { key: SortKey; desc: boolean }
export const DEFAULT_SORT: SortState = { key: "price", desc: false };
export const SORT_LABEL: Record<SortKey, string> = { price: "가격", kind: "유형" };

/** 정렬 칩을 눌렀을 때: 다른 기준이면 그 기준의 오름차순, 같은 기준이면 방향만 뒤집는다 */
export function nextSort(cur: SortState, key: SortKey): SortState {
  return cur.key === key ? { key, desc: !cur.desc } : { key, desc: false };
}

/** 유형 순서: 검 → 둔기 → 활 → 갑옷 → 머리 → 다리 → 발 → 방패 → 소모품 → 전리품 → 그 밖 */
export function kindRank(def: ItemDef): number {
  if (def.category === "weapon") return { blade: 0, blunt: 1, bow: 2 }[def.skill] ?? 0;
  const order: Record<string, number> = { armor: 3, head: 4, legs: 5, feet: 6, shield: 7, consumable: 8, material: 9 };
  return order[def.category] ?? 10;
}

export interface SortRow { def: ItemDef; price: number }

/**
 * 고른 기준으로 늘어놓는다. 유형의 오름차순은 위 순서(검이 먼저)다.
 * 유형이 같으면 같은 방향의 가격 순, 그래도 같으면 이름순으로 고정한다.
 */
export function sortRows<T extends SortRow>(rows: T[], sort: SortState): T[] {
  const sign = sort.desc ? -1 : 1;
  const value = (r: T) => (sort.key === "price" ? r.price : kindRank(r.def));
  return [...rows].sort((a, b) =>
    sign * (value(a) - value(b))
    || (sort.key !== "price" ? sign * (a.price - b.price) : 0)
    || a.def.name.localeCompare(b.def.name, "ko"));
}

// ───────────────────────── 분류 칩 ─────────────────────────

export interface ItemGroup { id: string; label: string; match: (def: ItemDef) => boolean }

const ALL: ItemGroup = { id: "all", label: "전체", match: () => true };
const weaponOf = (skill: string) => (d: ItemDef) => d.category === "weapon" && d.skill === skill;
const uses = (d: ItemDef, test: (e: Extract<ItemDef, { category: "consumable" }>["use"][number]) => boolean) =>
  d.category === "consumable" && d.use.some(test);

/** 대장간 구매: 검 / 둔기 / 활 / 방어구 / 방패 */
export const SMITHY_GROUPS: ItemGroup[] = [
  ALL,
  { id: "blade", label: "검", match: weaponOf("blade") },
  { id: "blunt", label: "둔기", match: weaponOf("blunt") },
  { id: "bow", label: "활", match: weaponOf("bow") },
  { id: "armor", label: "방어구", match: (d) => d.category === "armor" || d.category === "head" || d.category === "legs" || d.category === "feet" },
  { id: "shield", label: "방패", match: (d) => d.category === "shield" },
];

/** 약초방 물건: 효과로 나눈다 (기력 알약처럼 여러 효과면 여러 칸에 나온다) */
export const HEALER_GROUPS: ItemGroup[] = [
  ALL,
  { id: "hp", label: "HP 회복", match: (d) => uses(d, (e) => e.type === "hp" && e.delta > 0) },
  { id: "fatigue", label: "피로 회복", match: (d) => uses(d, (e) => e.type === "fatigue" && e.delta < 0) },
  { id: "wound", label: "부상 치료", match: (d) => uses(d, (e) => e.type === "healWound") || (d.category === "consumable" && !!d.chanceEffects?.some((c) => c.effects.some((e) => e.type === "healWound"))) },
];

/** 여관 판매: 장비 / 소모품 / 전리품 */
export const SELL_GROUPS: ItemGroup[] = [
  ALL,
  { id: "gear", label: "장비", match: (d) => ["weapon", "armor", "head", "legs", "feet", "shield"].includes(d.category) },
  { id: "consumable", label: "소모품", match: (d) => d.category === "consumable" },
  { id: "material", label: "전리품", match: (d) => d.category === "material" },
];
