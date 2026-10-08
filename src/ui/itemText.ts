import { isBroken } from "@/core/items/equipment";
import { SKILL_LABEL, STAT_LABEL, WOUND_LABEL } from "@/core/labels";
import type { Effect, ItemDef, ItemStack, StatId } from "@/core/types";

/** 아이템 성능 한 줄: "피해 1d6, 양손", "방어도 +2", "HP +2, 경상 50% 치료" */
export function itemSummary(def: ItemDef): string[] {
  switch (def.category) {
    case "weapon": {
      const req = Object.entries(def.requires ?? {}).map(([s, v]) => `${STAT_LABEL[s as StatId]} ${v}레벨 필요`);
      return [`${SKILL_LABEL[def.skill]}`, `피해 ${def.damage}`, ...(def.twoHanded ? ["양손"] : []), ...req];
    }
    case "armor":
      return [`방어도 +${def.defense}`, ...(def.checkPenalty ? [`${STAT_LABEL[def.checkPenalty.stat]} 판정 ${def.checkPenalty.value}`] : [])];
    case "shield":
      return [`방어도 +${def.defense}`, "한손 무기만"];
    case "consumable": {
      const lines = def.use.map(effectText).filter((x): x is string => !!x);
      for (const ce of def.chanceEffects ?? []) {
        for (const e of ce.effects) {
          const t = effectText(e);
          if (t) lines.push(`${Math.round(ce.p * 100)}% ${t}`);
        }
      }
      if (def.usableInCombat) lines.push("전투 중 사용");
      return lines;
    }
    case "material": return ["팔 수 있는 물건"];
    case "quest": return ["팔거나 버릴 수 없다"];
  }
}

function effectText(e: Effect): string | null {
  switch (e.type) {
    case "hp": return `HP ${e.delta > 0 ? "+" : ""}${e.delta}`;
    case "fatigue": return `피로 ${e.delta > 0 ? "+" : ""}${e.delta}`;
    // 아이템 치료는 한 단계만: 목표보다 한 단계 나쁜 부상을 고친다
    case "healWound": return e.to === "none" ? "경상 치료" : `${WOUND_LABEL[e.to === "light" ? "serious" : "critical"]} → ${WOUND_LABEL[e.to]}`;
    default: return null;
  }
}

/** "내구도 18/20", 0이면 "망가짐" */
export function durabilityText(def: ItemDef, stack: ItemStack): string | null {
  if (!("durabilityMax" in def) || stack.durability === undefined) return null;
  return isBroken(stack) ? "망가짐" : `내구도 ${stack.durability}/${def.durabilityMax}`;
}
