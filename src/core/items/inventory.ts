import type { Ctx } from "../commands";
import type { Inventory, ItemId } from "../types";

/**
 * 이벤트가 쓰는 최소한의 가방 조작: 세기·넣기·빼기. (SYSTEM_SPEC 5-2)
 * 장착·사용·버리기와 "가방이 가득 차면 버릴 것 고르기" 시트는 5주차에서 이 파일을 넓힌다.
 */

/** 가방과 장비 칸을 합친 개수 */
export function countItem(inv: Inventory, itemId: ItemId): number {
  const inBag = inv.slots.reduce((n, s) => n + (s?.itemId === itemId ? s.qty : 0), 0);
  const worn = Object.values(inv.equipment).filter((s) => s?.itemId === itemId).length;
  return inBag + worn;
}

/**
 * 같은 아이템 칸에 stackMax까지 겹치고, 남으면 빈 칸을 쓴다. 칸이 모자라면 남은 것은 두고 온다.
 * @returns 실제로 넣은 개수
 */
export function addItem(ctx: Ctx, itemId: ItemId, qty: number): number {
  const def = ctx.content.items[itemId];
  if (!def) throw new Error(`없는 아이템: ${itemId}`);
  const inv = ctx.draft.inventory;
  let left = qty;

  for (const slot of inv.slots) {
    if (left <= 0) break;
    if (slot?.itemId !== itemId) continue;
    const n = Math.min(left, def.stackMax - slot.qty);
    slot.qty += n;
    left -= n;
  }
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    if (inv.slots[i] !== null) continue;
    const n = Math.min(left, def.stackMax);
    inv.slots[i] = "durabilityMax" in def ? { itemId, qty: n, durability: def.durabilityMax } : { itemId, qty: n };
    left -= n;
  }

  const added = qty - left;
  if (added > 0) ctx.feed.push({ kind: "item", itemId, name: def.name, delta: added });
  if (left > 0) ctx.feed.push({ kind: "text", text: `가방이 가득 차서 ${def.name} ${left}개는 두고 왔다.` });
  return added;
}

/**
 * 가방에서 뒤쪽 칸부터 뺀다 (장착 중인 것은 건드리지 않는다).
 * @returns 실제로 뺀 개수
 */
export function removeItem(ctx: Ctx, itemId: ItemId, qty: number): number {
  const inv = ctx.draft.inventory;
  let left = qty;
  for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
    const slot = inv.slots[i];
    if (slot?.itemId !== itemId) continue;
    const n = Math.min(left, slot.qty);
    slot.qty -= n;
    left -= n;
    if (slot.qty === 0) inv.slots[i] = null;
  }
  const removed = qty - left;
  if (removed > 0) {
    ctx.feed.push({ kind: "item", itemId, name: ctx.content.items[itemId]?.name ?? itemId, delta: -removed });
  }
  return removed;
}

/** 장착 칸은 빼고 가방에 든 개수 (소모·지불에 쓸 수 있는 것) */
export function countInBag(inv: Inventory, itemId: ItemId): number {
  return inv.slots.reduce((n, s) => n + (s?.itemId === itemId ? s.qty : 0), 0);
}
