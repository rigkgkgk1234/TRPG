import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import { canTrade } from "../day/town";
import { changeSilver } from "../day/resources";
import { josa } from "../labels";
import {
  REP_DISCOUNT_RATE,
  REP_DISCOUNT_THRESHOLD,
  REP_HEAVY_SURCHARGE_RATE,
  REP_HEAVY_SURCHARGE_THRESHOLD,
  REP_SURCHARGE_RATE,
  REP_SURCHARGE_THRESHOLD,
  REPAIR_SILVER_PER_DURABILITY,
  SELL_RATE,
  type ItemDef,
  type ItemId,
  type ItemStack,
  type RunState,
} from "../types";
import { slotOf } from "./equipment";
import { addItem } from "./inventory";

export type ShopId = "smithy" | "healer" | "inn";

/** 가게에 놓인 물건. qty개를 한 묶음으로 판다 (화살 10개 3닢) */
export interface ShopEntry {
  itemId: ItemId;
  qty: number;
  /** 묶음 값. 없으면 아이템 가격 × qty */
  price?: number;
}

export interface ShopDef {
  id: ShopId;
  name: string;
  owner: string;
  stock: ShopEntry[];
}

/** 마을의 세 가게 (GAME_DESIGN 2장 NPC). 식량·빚은 여관이 맡는다. */
export const SHOPS: Record<ShopId, ShopDef> = {
  smithy: {
    id: "smithy", name: "대장간", owner: "브록",
    stock: [
      "club", "pitchfork", "old_hammer", "hunting_knife", "hand_axe", "rusty_sword", "short_spear", "war_hammer", "soldier_sword",
      "hunting_bow", "longbow",
      "padded_coat", "patched_leather", "leather_armor", "chain_shirt", "wooden_shield", "round_shield",
    ].map((itemId) => ({ itemId, qty: 1 })),
  },
  healer: {
    id: "healer", name: "약초방", owner: "마그다 할멈",
    stock: ["herb", "bandage", "salve", "vigor_pill", "bitter_tea", "sleep_herb", "splint", "healing_potion"].map((itemId) => ({ itemId, qty: 1 })),
  },
  inn: {
    id: "inn", name: "여관", owner: "토비",
    stock: [{ itemId: "arrow", qty: 10, price: 3 }, { itemId: "hot_stew", qty: 1 }, { itemId: "barley_ale", qty: 1 }],
  },
};

/** 의원 치료비 (SYSTEM_SPEC 3-5) */
export const TREAT_PRICE = 5;
/** 대장장이 견습은 수리비 반값 (SYSTEM_SPEC 5-3) */
const SMITH_REPAIR_RATE = 0.5;

/**
 * 평판 가격 보정: 60 이상이면 10% 싸게, 10 미만이면 10%, 5 미만이면 20% 비싸게 (올림). (SYSTEM_SPEC 5-4)
 * 식량은 이 보정을 받지 않는다 (town.ts 참고).
 */
export function adjustedPrice(run: RunState, base: number): number {
  const rep = run.player.reputation;
  const rate =
    rep >= REP_DISCOUNT_THRESHOLD ? 1 - REP_DISCOUNT_RATE
    : rep < REP_HEAVY_SURCHARGE_THRESHOLD ? 1 + REP_HEAVY_SURCHARGE_RATE
    : rep < REP_SURCHARGE_THRESHOLD ? 1 + REP_SURCHARGE_RATE
    : 1;
  return Math.ceil(base * rate - 1e-9);
}

export function entryPrice(run: RunState, content: Pick<ContentDB, "items">, e: ShopEntry): number {
  return adjustedPrice(run, e.price ?? (content.items[e.itemId]?.price ?? 0) * e.qty);
}

/** 한 개를 팔 때 값: 판매가 지정이 있으면 그것, 아니면 구매가의 50% (내림). 못 팔면 0. */
export function sellPrice(def: ItemDef | undefined): number {
  if (!def || !def.sellable) return 0;
  return def.sellPrice ?? Math.floor(def.price * SELL_RATE);
}

/** 내구도 5당 은화 1 (올림), 대장장이 견습은 반값 (올림) */
export function repairPrice(run: RunState, content: Pick<ContentDB, "items">, stack: ItemStack): number {
  const def = content.items[stack.itemId];
  if (!def || !("durabilityMax" in def) || stack.durability === undefined) return 0;
  const missing = def.durabilityMax - stack.durability;
  if (missing <= 0) return 0;
  // 0.2 × 15 = 3.0000000000000004 같은 부동소수 오차로 한 닢 더 받지 않게
  const base = Math.ceil(missing * REPAIR_SILVER_PER_DURABILITY - 1e-9);
  return run.player.job === "smith" ? Math.ceil(base * SMITH_REPAIR_RATE) : base;
}

/** 수리할 물건을 가리키는 표기: 장비 칸 이름("weapon") 또는 가방 칸 번호("bag:3") */
export type RepairTarget = "weapon" | "armor" | "shield" | `bag:${number}`;

export function stackAt(run: RunState, target: RepairTarget): ItemStack | null {
  if (target.startsWith("bag:")) return run.inventory.slots[Number(target.slice(4))] ?? null;
  return run.inventory.equipment[target as "weapon" | "armor" | "shield"];
}

export function treatable(run: RunState): boolean {
  const w = run.player.wound;
  return w.level === "serious" && w.treatedDays === null;
}

// ───────────────────────── 거래 ─────────────────────────

/** 산다. 장비는 그 칸이 비어 있고 걸칠 수 있으면 바로 걸친다. @returns 거절 사유, 성공이면 null */
export function buy(ctx: Ctx, shopId: ShopId, itemId: ItemId): string | null {
  const s = ctx.draft;
  if (!canTrade(s)) return "지금은 살 수 없다";
  const entry = SHOPS[shopId]?.stock.find((e) => e.itemId === itemId);
  const def = ctx.content.items[itemId];
  if (!entry || !def) return "그런 물건은 없다";
  const price = entryPrice(s, ctx.content, entry);
  if (s.resources.silver < price) return "은화가 모자란다";

  const slot = slotOf(def);
  const wearNow = slot && !s.inventory.equipment[slot] && !(slot === "shield" && twoHandedEquipped(s, ctx.content));
  if (!wearNow && !hasRoom(s, def, entry.qty)) return "가방에 자리가 없다";

  changeSilver(ctx, -price);
  if (wearNow) {
    s.inventory.equipment[slot] = "durabilityMax" in def ? { itemId, qty: 1, durability: def.durabilityMax } : { itemId, qty: 1 };
    ctx.feed.push({ kind: "item", itemId, name: def.name, delta: 1 });
    ctx.feed.push({ kind: "text", text: `${josa(def.name, "을/를")} 사서 바로 ${slot === "armor" ? "입었다" : "들었다"}.` });
  } else {
    addItem(ctx, itemId, entry.qty);
    ctx.feed.push({ kind: "text", text: `${josa(def.name, "을/를")} 사서 가방에 넣었다.` });
  }
  return null;
}

/** 가방 칸에서 qty개를 판다 */
export function sell(ctx: Ctx, slotIndex: number, qty: number): string | null {
  const s = ctx.draft;
  if (!canTrade(s)) return "지금은 팔 수 없다";
  const stack = s.inventory.slots[slotIndex];
  if (!stack) return "팔 물건이 없다";
  const each = sellPrice(ctx.content.items[stack.itemId]);
  if (each <= 0) return "토비가 사지 않는 물건이다";
  const n = Math.min(Math.max(1, Math.floor(qty)), stack.qty);
  removeAt(ctx, slotIndex, n);
  changeSilver(ctx, each * n);
  return null;
}

export function repair(ctx: Ctx, target: RepairTarget): string | null {
  const s = ctx.draft;
  if (!canTrade(s)) return "지금은 맡길 수 없다";
  const stack = stackAt(s, target);
  if (!stack) return "고칠 물건이 없다";
  const price = repairPrice(s, ctx.content, stack);
  if (price <= 0) return "고칠 데가 없다";
  if (s.resources.silver < price) return "은화가 모자란다";
  const def = ctx.content.items[stack.itemId]!;
  changeSilver(ctx, -price);
  stack.durability = "durabilityMax" in def ? def.durabilityMax : stack.durability;
  ctx.feed.push({ kind: "text", text: `브록이 ${josa(def.name, "을/를")} 말끔히 손봐 주었다.` });
  return null;
}

/** 중상 치료: 은화 5. 그날부터 3일이 지나면 경상으로 (SYSTEM_SPEC 3-5) */
export function treat(ctx: Ctx): string | null {
  const s = ctx.draft;
  if (!canTrade(s)) return "지금은 치료받을 수 없다";
  if (!treatable(s)) return s.player.wound.level === "critical" ? "할멈 손으로는 어렵다. 치유 물약이 필요하다" : "치료할 큰 상처가 없다";
  const price = adjustedPrice(s, TREAT_PRICE);
  if (s.resources.silver < price) return "은화가 모자란다";
  changeSilver(ctx, -price);
  s.player.wound.treatedDays = 0;
  ctx.feed.push({ kind: "text", text: "마그다 할멈이 상처를 꿰매고 약을 발라 주었다. 사흘쯤 지나면 한결 나을 거라고 한다." });
  return null;
}

function twoHandedEquipped(run: RunState, content: Pick<ContentDB, "items">): boolean {
  const w = run.inventory.equipment.weapon;
  const def = w ? content.items[w.itemId] : undefined;
  return def?.category === "weapon" && def.twoHanded;
}

/** 이미 있는 칸에 겹치거나 빈 칸에 다 들어가는지 */
function hasRoom(run: RunState, def: ItemDef, qty: number): boolean {
  let room = 0;
  for (const slot of run.inventory.slots) {
    if (slot === null) room += def.stackMax;
    else if (slot.itemId === def.id) room += def.stackMax - slot.qty;
  }
  return room >= qty;
}

/** 지정한 가방 칸에서 뺀다 (removeItem은 뒤 칸부터라 칸을 고를 수 없다) */
function removeAt(ctx: Ctx, slotIndex: number, n: number): void {
  const inv = ctx.draft.inventory;
  const stack = inv.slots[slotIndex]!;
  if (n >= stack.qty) {
    // 같은 아이템의 다른 칸을 건드리지 않도록 이 칸만 비운다
    inv.slots[slotIndex] = null;
    ctx.feed.push({ kind: "item", itemId: stack.itemId, name: ctx.content.items[stack.itemId]?.name ?? stack.itemId, delta: -stack.qty });
    return;
  }
  stack.qty -= n;
  ctx.feed.push({ kind: "item", itemId: stack.itemId, name: ctx.content.items[stack.itemId]?.name ?? stack.itemId, delta: -n });
}
