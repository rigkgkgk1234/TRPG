import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import { STAT_LABEL, josa } from "../labels";
import type { ArmorDef, Equipment, ItemDef, ItemStack, RunState, StatId } from "../types";

export type EquipSlot = keyof Equipment;

/** 화면에 보이는 순서 (머리 → 상체 → 하체 → 오른손 → 왼손 → 발) */
export const EQUIP_SLOTS: readonly EquipSlot[] = ["head", "armor", "legs", "weapon", "offHand", "feet"];

export const EQUIP_SLOT_LABEL: Record<EquipSlot, string> = {
  head: "머리", armor: "상체", legs: "하체", weapon: "오른손", offHand: "왼손", feet: "발",
};

/** 걸칠 때 쓰는 동사 */
export function wearVerb(slot: EquipSlot): string {
  if (slot === "head") return "썼다";
  if (slot === "feet") return "신었다";
  if (slot === "armor" || slot === "legs") return "입었다";
  return "들었다";
}

/** 몸에 걸치는 방어구(상체·머리·하체·발)인지 */
export function isWear(def: ItemDef | undefined): def is ArmorDef {
  return def?.category === "armor" || def?.category === "head" || def?.category === "legs" || def?.category === "feet";
}

/** 이 물건이 들어갈 수 있는 칸들. 첫 칸이 기본 (가방에서 "들기"를 누르면 이 칸으로) */
export function slotsFor(def: ItemDef | undefined): EquipSlot[] {
  if (!def) return [];
  if (def.category === "weapon") return def.twoHanded ? ["weapon"] : ["weapon", "offHand"];
  if (def.category === "shield") return ["offHand"];
  if (isWear(def)) return [def.category];
  return [];
}

/** 장비 칸에 들어갈 수 있는 기본 칸 */
export function slotOf(def: ItemDef | undefined): EquipSlot | null {
  return slotsFor(def)[0] ?? null;
}

/** 내구도가 0이면 망가진 것 (SYSTEM_SPEC 5-3). 내구도가 없는 물건은 망가지지 않는다. */
export function isBroken(stack: ItemStack | null | undefined): boolean {
  return stack?.durability === 0;
}

/** 망가진 무기의 피해 감소 */
export const BROKEN_WEAPON_PENALTY = 2;

/**
 * 가방 칸의 장비를 몸에 걸친다. 같은 칸에 걸친 것은 그 가방 칸으로 돌아간다(맞바꿈).
 * 양손 무기·활을 들면 왼손은 비어야 한다: 왼손에 든 것이 있으면 가방에 넣고(자리가 있으면),
 * 양손 무기를 든 채 왼손에 무언가를 들려고 하면 거절한다.
 * @param to 넣을 칸 (생략하면 기본 칸)
 * @returns 거절 사유, 성공이면 null
 */
export function equipBlock(run: RunState, content: Pick<ContentDB, "items">, slotIndex: number, to?: EquipSlot): string | null {
  const stack = run.inventory.slots[slotIndex];
  const def = stack ? content.items[stack.itemId] : undefined;
  const slots = slotsFor(def);
  if (!stack || !def || slots.length === 0) return "몸에 걸칠 수 있는 물건이 아니다";
  const slot = to ?? slots[0];
  if (!slots.includes(slot)) return `${EQUIP_SLOT_LABEL[slot]}에는 걸칠 수 없다`;
  if (def.category === "weapon" && def.requires) {
    for (const [stat, min] of Object.entries(def.requires) as [StatId, number][]) {
      if (run.player.stats[stat] < min) return `${STAT_LABEL[stat]} ${min}레벨 필요`;
    }
  }
  const eq = run.inventory.equipment;
  const mainDef = eq.weapon ? content.items[eq.weapon.itemId] : undefined;
  if (slot === "offHand" && mainDef?.category === "weapon" && mainDef.twoHanded) {
    return `${josa(mainDef.name, "을/를")} 든 채로는 왼손에 들 수 없다`;
  }
  if (def.category === "weapon" && def.twoHanded && eq.offHand) {
    // 오른손이 비어 있었다면 꺼낸 가방 칸이 빈다 → 왼손에 든 것이 그 칸으로 간다
    const freed = eq.weapon ? 0 : 1;
    const empty = run.inventory.slots.filter((s) => s === null).length + freed;
    if (empty === 0) return "왼손에 든 것을 넣을 자리가 가방에 없다";
  }
  return null;
}

export function equip(ctx: Ctx, slotIndex: number, to?: EquipSlot): string | null {
  const blocked = equipBlock(ctx.draft, ctx.content, slotIndex, to);
  if (blocked) return blocked;
  const inv = ctx.draft.inventory;
  const stack = inv.slots[slotIndex]!;
  const def = ctx.content.items[stack.itemId]!;
  const slot = to ?? slotOf(def)!;

  inv.slots[slotIndex] = inv.equipment[slot];
  inv.equipment[slot] = stack;
  if (def.category === "weapon" && def.twoHanded && inv.equipment.offHand) {
    const free = inv.slots.indexOf(null);
    inv.slots[free] = inv.equipment.offHand;
    inv.equipment.offHand = null;
  }
  const where = slot === "offHand" ? "왼손에 " : slot === "weapon" && def.category === "weapon" && !def.twoHanded ? "오른손에 " : "";
  ctx.feed.push({ kind: "text", text: `${josa(def.name, "을/를")} ${where}${wearVerb(slot)}.` });
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
