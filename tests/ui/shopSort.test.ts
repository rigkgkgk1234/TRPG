import { describe, expect, it } from "vitest";
import { CONTENT } from "@/data";
import { DEFAULT_SORT, HEALER_GROUPS, nextSort, SMITHY_GROUPS, sortRows } from "@/ui/shopSort";

const rows = (...ids: string[]) => ids.map((id) => ({ def: CONTENT.items[id]!, price: CONTENT.items[id]!.price }));
const names = (r: { def: { id: string } }[]) => r.map((x) => x.def.id);
const group = (groups: typeof SMITHY_GROUPS, id: string) => groups.find((g) => g.id === id)!;

describe("가게 정렬", () => {
  it("기본은 가격 오름차순, 같은 기준을 다시 누르면 내림차순", () => {
    const list = rows("club", "soldier_sword", "rusty_sword");
    expect(names(sortRows(list, DEFAULT_SORT))).toEqual(["club", "rusty_sword", "soldier_sword"]);
    const desc = nextSort(DEFAULT_SORT, "price");
    expect(desc).toEqual({ key: "price", desc: true });
    expect(names(sortRows(list, desc))).toEqual(["soldier_sword", "rusty_sword", "club"]);
    expect(nextSort(desc, "kind")).toEqual({ key: "kind", desc: false });
  });

  it("유형: 검 → 둔기 → 활 → 갑옷 → 방패, 같은 유형은 싼 것부터", () => {
    const list = rows("wooden_shield", "longbow", "war_hammer", "leather_armor", "rusty_sword", "club");
    expect(names(sortRows(list, { key: "kind", desc: false }))).toEqual(["rusty_sword", "club", "war_hammer", "longbow", "leather_armor", "wooden_shield"]);
  });
});

describe("가게 분류", () => {
  it("대장간: 검에는 검만, 활에는 활만", () => {
    const stock = Object.values(CONTENT.items).filter((d) => d.price > 0);
    expect(stock.filter(group(SMITHY_GROUPS, "blade").match).every((d) => d.category === "weapon" && d.skill === "blade")).toBe(true);
    expect(stock.filter(group(SMITHY_GROUPS, "bow").match).map((d) => d.id).sort()).toEqual(["hunting_bow", "longbow"]);
  });

  it("약초방: 기력 알약은 HP 회복과 피로 회복에 모두, 붕대는 부상 치료에", () => {
    const pill = CONTENT.items.vigor_pill!;
    expect(group(HEALER_GROUPS, "hp").match(pill)).toBe(true);
    expect(group(HEALER_GROUPS, "fatigue").match(pill)).toBe(true);
    expect(group(HEALER_GROUPS, "wound").match(CONTENT.items.bandage!)).toBe(true);
    expect(group(HEALER_GROUPS, "wound").match(CONTENT.items.sleep_herb!)).toBe(false);
  });
});
