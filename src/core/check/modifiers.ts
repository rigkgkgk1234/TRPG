import type { ContentDB } from "../content";
import { SKILL_LABEL, STAT_LABEL } from "../labels";
import {
  FATIGUE_DISADVANTAGE_AT,
  resolveMode,
  STAT_HARD_CAP,
  STAT_MIN,
  successChance,
  type CheckContext,
  type CheckSpec,
  type ModifierSource,
  type RollMode,
  type TraitDef,
} from "../types";
import type { CheckSubject } from "./subject";

export type { CheckSubject } from "./subject";

/** 이벤트·상황이 추가로 주는 유리/불리 출처 (예: 사전 정보 플래그 → "정찰 정보") */
export interface ExtraSources {
  advantage?: string[];
  disadvantage?: string[];
}

const PHYSICAL_STATS = new Set(["str", "agi"]);
const LIGHT_WOUND_PENALTY = -2;
const SERIOUS_WOUND_PENALTY = -4;
const HUNGER_DISADVANTAGE_AT = 2;

/**
 * 상태를 읽어 판정 보정치와 유리/불리 출처를 조립한다. (SYSTEM_SPEC 2-2, 2-3)
 * 보정 순서: 능력치 → 숙련 → 장비 → 부상 → 상황 → 흔적. UI는 이 순서대로 내역을 보여 준다.
 */
export function buildCheckContext(
  subject: CheckSubject,
  spec: CheckSpec,
  content: Pick<ContentDB, "items" | "traits">,
  extra: ExtraSources = {},
): CheckContext {
  const { player, resources, inventory } = subject;
  const statValue = clamp(player.stats[spec.stat], STAT_MIN, STAT_HARD_CAP);
  const modifiers: ModifierSource[] = [{ label: STAT_LABEL[spec.stat], value: statValue }];

  if (spec.skill) {
    modifiers.push({ label: SKILL_LABEL[spec.skill], value: player.skills[spec.skill].rank });
  }

  // 판정 페널티는 현재 방어구에만 있다 (SYSTEM_SPEC 5-5). 방패·무기에 생기면 여기에 추가한다.
  const armorStack = inventory.equipment.armor;
  const armor = armorStack ? content.items[armorStack.itemId] : undefined;
  if (armor?.category === "armor" && armor.checkPenalty?.stat === spec.stat) {
    modifiers.push({ label: armor.name, value: armor.checkPenalty.value });
  }

  const wound = player.wound.level;
  const seriouslyHurt = wound === "serious" || wound === "critical";
  if (wound === "light" && PHYSICAL_STATS.has(spec.stat)) {
    modifiers.push({ label: "경상", value: LIGHT_WOUND_PENALTY });
  } else if (seriouslyHurt) {
    modifiers.push({ label: wound === "critical" ? "치명상" : "중상", value: SERIOUS_WOUND_PENALTY });
  }

  if (spec.situational) {
    modifiers.push({ label: "상황", value: spec.situational });
  }

  // 같은 흔적이 두 번 기록돼도 효과는 한 번만
  const traits = [...new Set(player.traits)]
    .map((id) => content.traits[id])
    .filter((t): t is TraitDef => t !== undefined);
  for (const trait of traits) {
    if (trait.checkBonus && traitBonusApplies(trait.checkBonus, spec)) {
      modifiers.push({ label: trait.name, value: trait.checkBonus.value });
    }
  }

  const advantageSources = [...(extra.advantage ?? [])];
  for (const trait of traits) {
    if (trait.advantageTags?.some((tag) => spec.tags?.includes(tag))) advantageSources.push(trait.name);
  }

  const disadvantageSources = [...(extra.disadvantage ?? [])];
  if (resources.fatigue >= FATIGUE_DISADVANTAGE_AT) disadvantageSources.push("지친 상태");
  if (resources.hunger >= HUNGER_DISADVANTAGE_AT) disadvantageSources.push("굶주림");
  if (seriouslyHurt) disadvantageSources.push(wound === "critical" ? "치명상" : "중상");

  return { modifiers, advantageSources, disadvantageSources };
}

/** stat이 있으면 같아야 하고, tags가 비어 있지 않으면 그중 하나 이상이 판정 태그에 있어야 한다. */
function traitBonusApplies(bonus: NonNullable<TraitDef["checkBonus"]>, spec: CheckSpec): boolean {
  if (bonus.stat && bonus.stat !== spec.stat) return false;
  if (bonus.tags?.length && !bonus.tags.some((tag) => spec.tags?.includes(tag))) return false;
  return true;
}

export function sumModifiers(ctx: CheckContext): number {
  return ctx.modifiers.reduce((sum, m) => sum + m.value, 0);
}

export interface CheckPreview {
  mode: RollMode;
  modifierTotal: number;
  /** 0~1, 부분 성공 제외 */
  chance: number;
}

/** 선택지 버튼용 미리보기. rollCheck와 같은 규칙(forceMode 포함)으로 계산하므로 표시와 실제 굴림이 어긋나지 않는다. */
export function previewCheck(spec: CheckSpec, ctx: CheckContext): CheckPreview {
  const mode = resolveMode(ctx, spec.forceMode);
  const modifierTotal = sumModifiers(ctx);
  return { mode, modifierTotal, chance: successChance(modifierTotal, spec.dc, mode) };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
