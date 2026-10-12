import { EQUIP_SLOTS } from "@/core/items/equipment";
import { repairPrice, sellPrice, SHOPS, stackAt, treatable, type RepairTarget, type ShopId } from "@/core/items/shop";
import { maxHp, REP_DISCOUNT_THRESHOLD, REP_HEAVY_SURCHARGE_THRESHOLD, REP_SURCHARGE_THRESHOLD, type ItemDef, type ItemStack, type RunState } from "@/core/types";
import { CONTENT } from "@/data";
import {
  BasketIcon, BeerSteinIcon, FirstAidKitIcon, HammerIcon, HandCoinsIcon, HeartbeatIcon, ShoppingCartIcon, WrenchIcon, type Icon,
} from "@/ui/icons";

/** 가게에 들어가서 먼저 고르는 것: 대장간 구매·수리 / 약초방 치료·물건 / 여관 구매·판매 */
export type ShopMode = "buy" | "repair" | "care" | "goods" | "sell";

export const SHOP_IDS: ShopId[] = ["smithy", "healer", "inn"];
export const SHOP_MODES: Record<ShopId, [ShopMode, ShopMode]> = {
  smithy: ["buy", "repair"],
  healer: ["care", "goods"],
  inn: ["buy", "sell"],
};
export const MODE_LABEL: Record<ShopMode, string> = { buy: "구매", repair: "수리", care: "치료", goods: "물건", sell: "판매" };
export const MODE_ICON: Record<ShopMode, Icon> = { buy: ShoppingCartIcon, repair: WrenchIcon, care: HeartbeatIcon, goods: BasketIcon, sell: HandCoinsIcon };
export const SHOP_ICON: Record<ShopId, Icon> = { smithy: HammerIcon, healer: FirstAidKitIcon, inn: BeerSteinIcon };

export const isShopId = (v: unknown): v is ShopId => SHOP_IDS.includes(v as ShopId);
export const isShopMode = (shop: ShopId, v: unknown): v is ShopMode => SHOP_MODES[shop].includes(v as ShopMode);

export function reputationNote(run: RunState): string {
  const rep = run.player.reputation;
  if (rep >= REP_DISCOUNT_THRESHOLD) return `평판 ${rep}: 물건값 10% 할인`;
  if (rep < REP_HEAVY_SURCHARGE_THRESHOLD) return `평판 ${rep}: 물건값 20% 웃돈`;
  if (rep < REP_SURCHARGE_THRESHOLD) return `평판 ${rep}: 물건값 10% 웃돈`;
  return `평판 ${rep}`;
}

export interface RepairRow { target: RepairTarget; where: string; stack: ItemStack; def: ItemDef; price: number }

/** 손볼 데가 있는 장비: 걸친 것 먼저, 그다음 가방 */
export function repairRows(run: RunState): RepairRow[] {
  const targets: { target: RepairTarget; where: string }[] = [
    ...EQUIP_SLOTS.map((slot) => ({ target: slot as RepairTarget, where: "걸친 것" })),
    ...run.inventory.slots.map((_, i) => ({ target: `bag:${i}` as RepairTarget, where: "가방" })),
  ];
  return targets.flatMap(({ target, where }) => {
    const stack = stackAt(run, target);
    const def = stack ? CONTENT.items[stack.itemId] : undefined;
    const price = stack ? repairPrice(run, CONTENT, stack) : 0;
    return stack && def && price > 0 ? [{ target, where, stack, def, price }] : [];
  });
}

export interface SellRow { index: number; stack: ItemStack; def: ItemDef; price: number }

/** 팔 수 있는 가방 칸 (price는 개당 값) */
export function sellRows(run: RunState): SellRow[] {
  return run.inventory.slots.flatMap((stack, index) => {
    const def = stack ? CONTENT.items[stack.itemId] : undefined;
    const price = sellPrice(def);
    return stack && def && price > 0 ? [{ index, stack, def, price }] : [];
  });
}

/** 고르기 패널의 모드 버튼 설명 한 줄 */
export function modeDetail(run: RunState, shop: ShopId, mode: ShopMode): string {
  switch (mode) {
    case "buy":
      return shop === "inn" ? `가진 식량 ${run.resources.food}` : `물건 ${SHOPS[shop].stock.length}가지`;
    case "repair": {
      const n = repairRows(run).length;
      return n > 0 ? `손볼 장비 ${n}개` : "손볼 장비 없음";
    }
    case "care": {
      const w = run.player.wound.level;
      if (w === "critical") return "응급 처치 필요";
      if (treatable(run)) return "중상 치료 가능";
      const max = maxHp(run.player.stats);
      return run.player.hp < max ? `HP ${run.player.hp}/${max}` : "아픈 데가 없다";
    }
    case "goods":
      return `약 ${SHOPS.healer.stock.length}가지`;
    case "sell": {
      const n = sellRows(run).length;
      return n > 0 ? `팔 물건 ${n}개` : "팔 물건 없음";
    }
  }
}
