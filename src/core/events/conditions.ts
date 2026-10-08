import { JOB_LABEL, SKILL_LABEL, STAT_LABEL, WOUND_LABEL } from "../labels";
import type { ContentDB } from "../content";
import { countItem } from "../items/inventory";
import type { Condition, Rng, RunState, WoundLevel } from "../types";

export const WOUND_RANK: Record<WoundLevel, number> = { none: 0, light: 1, serious: 2, critical: 3 };
const WOUND_ORDER: WoundLevel[] = ["none", "light", "serious", "critical"];

/**
 * 조건 하나를 평가한다. (SYSTEM_SPEC 4-5)
 * `chance`만 rng를 쓴다. 선택지·문장 변형처럼 화면이 미리 그려야 하는 곳에는 rng가 없으므로
 * 그곳의 `chance`는 build-content가 막는다. 여기서 rng 없이 만나면 데이터 오류로 던진다.
 */
export function evalCondition(c: Condition, run: RunState, rng?: Rng): boolean {
  const p = run.player;
  const r = run.resources;
  switch (c.type) {
    case "dayRange": return run.time.day >= (c.min ?? 1) && run.time.day <= (c.max ?? Infinity);
    case "flag": {
      const v = run.flags[c.flag];
      if (c.value === undefined) return v !== undefined && v !== false && v !== 0;
      // 숫자 플래그는 "그 이상"으로 본다 (예: 늑대 2마리 이상 잡음)
      return typeof c.value === "number" && typeof v === "number" ? v >= c.value : v === c.value;
    }
    case "notFlag": {
      const v = run.flags[c.flag];
      return v === undefined || v === false || v === 0;
    }
    case "stat": return p.stats[c.stat] >= c.min;
    case "skill": return p.skills[c.skill].rank >= c.min;
    case "reputation": return p.reputation >= (c.min ?? 0) && p.reputation <= (c.max ?? Infinity);
    case "fame": return p.fame >= (c.min ?? 0) && p.fame <= (c.max ?? Infinity);
    case "silver": return r.silver >= c.min;
    case "food": return r.food >= c.min;
    case "hasItem": return countItem(run.inventory, c.itemId) >= (c.qty ?? 1);
    case "equipped": return Object.values(run.inventory.equipment).some((s) => s?.itemId === c.itemId);
    case "job": return p.job === c.job;
    case "wound": return WOUND_RANK[p.wound.level] <= WOUND_RANK[c.max];
    case "fatigue": return r.fatigue >= (c.min ?? 0) && r.fatigue <= (c.max ?? Infinity);
    case "trait": return p.traits.includes(c.trait);
    case "chance":
      if (!rng) throw new Error("chance 조건은 이벤트 발생 조건에만 쓸 수 있다");
      return rng() < c.p;
    case "any": return c.of.some((x) => evalCondition(x, run, rng));
  }
}

export function evalAll(conds: readonly Condition[] | undefined, run: RunState, rng?: Rng): boolean {
  return (conds ?? []).every((c) => evalCondition(c, run, rng));
}

/**
 * 잠긴 선택지에 보여 줄 사유. "성장 목표"가 보이도록 필요한 값을 그대로 말한다. (SYSTEM_SPEC 4-2)
 * 플래그처럼 플레이어가 알 수 없는 조건은 사유가 없다 (데이터에 lockedReason을 쓰거나 숨긴다).
 */
export function conditionReason(c: Condition, content: Pick<ContentDB, "items" | "traits">): string | null {
  switch (c.type) {
    case "dayRange": return c.min ? `${c.min}일차부터` : `${c.max}일차까지`;
    case "stat": return `${STAT_LABEL[c.stat]} ${c.min}레벨 필요`;
    case "skill": return `${SKILL_LABEL[c.skill]} ${c.min}레벨 필요`;
    case "reputation": return c.min !== undefined ? `평판 ${c.min} 필요` : "평판이 너무 높다";
    case "fame": return c.min !== undefined ? `명성 ${c.min} 필요` : "이름이 너무 알려졌다";
    case "silver": return `은화 ${c.min} 필요`;
    case "food": return `식량 ${c.min} 필요`;
    case "hasItem": return `${itemName(content, c.itemId)}${c.qty && c.qty > 1 ? ` ${c.qty}개` : ""} 필요`;
    case "equipped": return `${itemName(content, c.itemId)} 장착 필요`;
    case "job": return `${JOB_LABEL[c.job]}만`;
    case "wound": return c.max === "none" ? "다친 몸으로는 무리다" : `${WOUND_LABEL[WOUND_ORDER[WOUND_RANK[c.max] + 1] ?? c.max]} 상태로는 무리다`;
    case "fatigue": return c.max !== undefined ? "너무 지쳤다" : "아직 기운이 남았다";
    case "trait": return `흔적 「${content.traits[c.trait]?.name ?? c.trait}」 필요`;
    default: return null;
  }
}

export function itemName(content: Pick<ContentDB, "items">, id: string): string {
  return content.items[id]?.name ?? id;
}
