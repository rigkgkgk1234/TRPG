import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import { STAT_LABEL, josa } from "../labels";
import type { Equipment, ItemDef, ItemStack, RunState, StatId } from "../types";

export type EquipSlot = keyof Equipment;

/** 장비 칸에 들어갈 수 있는 아이템 분류 */
export function slotOf(def: ItemDef | undefined): EquipSlot | null {
  return def && (def.category === "weapon" || def.category === "armor" || def.category === "shield") ? def.category : null;
}

/** 내구도가 0이면 망가진 것 (SYSTEM_SPEC 5-3). 내구도가 없는 물건은 망가지지 않는다. */
export function isBroken(stack: ItemStack | null | undefined): boolean {
  return stack?.durability === 0;
}

/** 망가진 무기의 피해 감소 */
export const BROKEN_WEAPON_PENALTY = 2;

/**
 * 가방 칸의 장비를 몸에 걸친다. 같은 칸에 걸친 것은 그 가방 칸으로 돌아간다(맞바꿈).
 * 양손 무기·활과 방패는 같이 쓸 수 없다: 방패를 든 채 양손 무기를 잡으면 방패를 가방에 넣고(자리가 있으면),
 * 양손 무기를 든 채 방패를 들려고 하면 거절한다.
 * @returns 거절 사유, 성공이면 null
 */
export function equipBlock(run: RunState, content: Pick<ContentDB, "items">, slotIndex: number): string | null {
  const stack = run.inventory.slots[slotIndex];
  const def = stack ? content.items[stack.itemId] : undefined;
  const slot = slotOf(def);
  if (!stack || !def || !slot) return "몸에 걸칠 수 있는 물건이 아니다";
  if (def.category === "weapon" && def.requires) {
    for (const [stat, min] of Object.entries(def.requires) as [StatId, number][]) {
      if (run.player.stats[stat] < min) return `${STAT_LABEL[stat]} ${min}레벨 필요`;
    }
  }
  const weapon = run.inventory.equipment.weapon;
  const weaponDef = weapon ? content.items[weapon.itemId] : undefined;
  if (slot === "shield" && weaponDef?.category === "weapon" && weaponDef.twoHanded) {
    return `${josa(weaponDef.name, "을/를")} 든 채로는 방패를 들 수 없다`;
  }
  if (def.category === "weapon" && def.twoHanded && run.inventory.equipment.shield) {
    // 무기 칸이 비어 있었다면 꺼낸 가방 칸이 빈다 → 방패가 그 칸으로 간다
    const freed = run.inventory.equipment.weapon ? 0 : 1;
    const empty = run.inventory.slots.filter((s) => s === null).length + freed;
    if (empty === 0) return "방패를 넣을 자리가 가방에 없다";
  }
  return null;
}

export function equip(ctx: Ctx, slotIndex: number): string | null {
  const blocked = equipBlock(ctx.draft, ctx.content, slotIndex);
  if (blocked) return blocked;
  const inv = ctx.draft.inventory;
  const stack = inv.slots[slotIndex]!;
  const def = ctx.content.items[stack.itemId]!;
  const slot = slotOf(def)!;

  inv.slots[slotIndex] = inv.equipment[slot];
  inv.equipment[slot] = stack;
  if (def.category === "weapon" && def.twoHanded && inv.equipment.shield) {
    const free = inv.slots.indexOf(null);
    inv.slots[free] = inv.equipment.shield;
    inv.equipment.shield = null;
  }
  ctx.feed.push({ kind: "text", text: `${josa(def.name, "을/를")} ${slot === "armor" ? "입었다" : "들었다"}.` });
  return null;
}

export function unequip(ctx: Ctx, slot: EquipSlot): string | null {
  const inv = ctx.draft.inventory;
  const stack = inv.equipment[slot];
  if (!stack) return "걸친 것이 없다";
  const free = inv.slots.indexOf(null);
  if (free < 0) return "가방에 자리가 없다";
  inv.slots[free] = stack;
  inv.equipment[slot] = null;
  const name = ctx.content.items[stack.itemId]?.name ?? stack.itemId;
  ctx.feed.push({ kind: "text", text: `${josa(name, "을/를")} 가방에 넣었다.` });
  return null;
}

/** 가방 칸 하나를 통째로 버린다. 스토리 증거물은 버릴 수 없다. */
export function discard(ctx: Ctx, slotIndex: number): string | null {
  const inv = ctx.draft.inventory;
  const stack = inv.slots[slotIndex];
  if (!stack) return "빈 칸이다";
  const def = ctx.content.items[stack.itemId];
  if (def?.category === "quest") return "이건 버릴 수 없다";
  inv.slots[slotIndex] = null;
  ctx.feed.push({ kind: "item", itemId: stack.itemId, name: def?.name ?? stack.itemId, delta: -stack.qty });
  return null;
}

/**
 * 장비 내구도를 깎는다. 0이 되는 순간 망가졌다고 알린다.
 * @returns 실제로 깎인 양
 */
export function wearEquipment(ctx: Ctx, slot: EquipSlot, amount: number): number {
  const stack = ctx.draft.inventory.equipment[slot];
  if (!stack || stack.durability === undefined || stack.durability === 0) return 0;
  const before = stack.durability;
  stack.durability = Math.max(0, before - amount);
  if (stack.durability === 0) {
    const name = ctx.content.items[stack.itemId]?.name ?? stack.itemId;
    ctx.feed.push({ kind: "text", text: `${josa(name, "이/가")} 망가졌다. 대장간에서 고쳐야 한다.` });
  }
  return before - stack.durability;
}
