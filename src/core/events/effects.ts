import type { Ctx } from "../commands";
import { gainSkillXp } from "../check/progress";
import { gainTrait } from "../day/evening";
import { changeFatigue, changeFood, changeHp, changeReputation, changeSilver, setWound, worsenWound } from "../day/resources";
import { addItem, removeItem } from "../items/inventory";
import type { Effect } from "../types";
import { WOUND_RANK } from "./conditions";
import { stopExplore } from "./explore";

/** 사망 굴림(4주차) 전까지 이벤트 피해로는 쓰러지기 직전(HP 1)까지만 간다 */
const EVENT_HP_FLOOR = 1;

/**
 * 효과 하나를 상태에 반영한다. 자원 변화는 resources.ts를 거치므로 범위 제한과 피드 기록이 따라온다.
 * 남은 슬롯·탐험 흐름에 관한 효과(endDay)는 runner가 이벤트가 끝날 때 처리한다.
 */
export function applyEffect(ctx: Ctx, e: Effect): void {
  const s = ctx.draft;
  switch (e.type) {
    case "silver": return changeSilver(ctx, e.delta);
    case "food": return changeFood(ctx, e.delta);
    case "hp": {
      const delta = e.delta < 0 ? Math.max(e.delta, Math.min(0, EVENT_HP_FLOOR - s.player.hp)) : e.delta;
      return changeHp(ctx, delta);
    }
    case "fatigue": return changeFatigue(ctx, e.delta);
    case "reputation": return changeReputation(ctx, e.delta);
    case "addItem": addItem(ctx, e.itemId, e.qty); return;
    case "removeItem": removeItem(ctx, e.itemId, e.qty); return;
    case "wound": return worsenWound(ctx, e.steps);
    case "healWound":
      if (WOUND_RANK[s.player.wound.level] > WOUND_RANK[e.to]) setWound(ctx, e.to);
      return;
    case "setFlag": s.flags[e.flag] = e.value ?? true; return;
    case "incFlag": {
      const v = s.flags[e.flag];
      s.flags[e.flag] = (typeof v === "number" ? v : 0) + e.delta;
      return;
    }
    case "skillXp": gainSkillXp(ctx, e.skill, e.amount); return;
    case "gainTrait": return gainTrait(ctx, e.trait);
    case "endDay":
      // 남은 탐험 카드를 버리고, 이벤트가 끝나면 저녁으로 (runner.finishExplore가 pm → evening으로 넘긴다)
      s.time.phase = "pm";
      if (s.activeEvent?.explore) stopExplore(s.activeEvent.explore);
      return;
    case "loseNextSlot":
      if (s.time.phase === "am") s.time.phase = "pm";
      else s.time.skipNextAm = true;
      return;
    case "ending":
      s.ending = e.ending;
      return;
    case "startCombat":
      // build-content가 4주차 전까지 이 효과를 막는다
      throw new Error("전투는 4주차에 구현된다");
  }
}

export function applyEffects(ctx: Ctx, effects: readonly Effect[] | undefined): void {
  for (const e of effects ?? []) {
    if (ctx.draft.ending) return;
    applyEffect(ctx, e);
  }
}
