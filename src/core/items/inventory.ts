import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import { setWound } from "../day/resources";
import { applyEffect } from "../events/effects";
import { josa } from "../labels";
import type { ConsumableDef, Effect, Inventory, ItemId, RunState, WoundLevel } from "../types";

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

const WOUND_STEPS: WoundLevel[] = ["none", "light", "serious", "critical"];

/** 아이템을 쓸 때 문장. 없으면 "○○을 썼다" */
const USE_TEXT: Record<string, string> = {
  herb: "약초를 씹었다. 쓴맛이 혀에 퍼진다.",
  bandage: "붕대를 단단히 감았다.",
  bitter_tea: "쓴 약차를 마셨다. 정신이 번쩍 든다.",
  healing_potion: "치유 물약을 들이켰다. 몸이 후끈 달아오른다.",
  salve: "상처에 연고를 발랐다. 화끈거리더니 이내 시원해진다.",
  vigor_pill: "기운 환을 삼켰다. 단맛 뒤로 쓴맛이 올라온다.",
  sleep_herb: "숙면초를 달여 마시고 잠깐 눈을 붙였다.",
  splint: "부목을 대고 단단히 묶었다. 한결 움직일 만하다.",
  hot_stew: "뜨끈한 스튜를 비웠다. 속이 든든하다.",
  barley_ale: "보리술을 한 잔 들이켰다. 피로가 가시고 머리가 조금 띵하다.",
};

/** 지금 쓸 수 있는 소모품인지: 가방에 있고, 효과가 있고, 전투 중이면 전투용이어야 한다 */
export function canUseItem(run: RunState, content: Pick<ContentDB, "items">, itemId: ItemId, inCombat: boolean): boolean {
  const def = content.items[itemId];
  if (def?.category !== "consumable" || def.use.length === 0) return false;
  if (inCombat && !def.usableInCombat) return false;
  // 부상 치료만 하는 물건(붕대·부목)은 고칠 부상이 없으면 쓰지 않는다 (헛되이 사라지지 않게)
  const now = WOUND_STEPS.indexOf(run.player.wound.level);
  if (def.use.every((e) => e.type === "healWound" && now !== WOUND_STEPS.indexOf(e.to) + 1)) return false;
  return countInBag(run.inventory, itemId) > 0;
}

/**
 * 소모품 하나를 쓴다: 가방에서 1개 빼고 효과를 적용한다.
 * 아이템의 부상 치료는 한 단계만 낫게 한다 (붕대·약초: 경상 → 없음, 치유 물약: 치명상 → 중상). (SYSTEM_SPEC 5-5)
 * @returns 썼으면 true
 */
export function consumeItem(ctx: Ctx, itemId: ItemId, inCombat: boolean): boolean {
  if (!canUseItem(ctx.draft, ctx.content, itemId, inCombat)) return false;
  const def = ctx.content.items[itemId] as ConsumableDef;
  removeItem(ctx, itemId, 1);
  ctx.feed.push({ kind: "text", text: USE_TEXT[itemId] ?? `${josa(def.name, "을/를")} 썼다.` });

  const effects: Effect[] = [...def.use];
  for (const ce of def.chanceEffects ?? []) if (ctx.rng() < ce.p) effects.push(...ce.effects);
  for (const e of effects) {
    if (e.type === "healWound") {
      const now = WOUND_STEPS.indexOf(ctx.draft.player.wound.level);
      if (now === WOUND_STEPS.indexOf(e.to) + 1) setWound(ctx, e.to);
    } else {
      applyEffect(ctx, e);
    }
  }
  return true;
}
