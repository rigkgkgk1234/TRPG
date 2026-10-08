import { produce } from "immer";
import type { Ctx, DispatchResult, FeedItem, GameCommand } from "./commands";
import type { ContentDB } from "./content";
import { handleAction } from "./day/actions";
import { runEvening } from "./day/evening";
import { buyFood, payDebt } from "./day/town";
import { discard, equip, unequip } from "./items/equipment";
import { consumeItem } from "./items/inventory";
import { buy, repair, sell, treat, type RepairTarget } from "./items/shop";
import { handleChoice, handleCombat, handleContinue, handleGoDeeper, startPendingStory } from "./events/runner";
import { createRng, type RunState } from "./types";

/**
 * 코어의 유일한 진입점. 원본 상태는 건드리지 않고 새 상태와 피드를 돌려준다. (ARCHITECTURE 3-1)
 * 잘못된 명령은 크래시 대신 피드에 사유(toast)만 남기고 상태를 그대로 둔다.
 */
export function dispatch(state: RunState, cmd: GameCommand, content: ContentDB): DispatchResult {
  const feed: FeedItem[] = [];
  let save = false;
  let checkpoint = false;

  if (state.ending) {
    feed.push({ kind: "toast", text: "이미 끝난 이야기다" });
    return { state, feed, save, checkpoint };
  }

  const next = produce(state, (draft) => {
    // 상태 안의 RNG를 이어서 쓴다 → 저장 후 불러와도 같은 굴림
    const ctx: Ctx = { draft, content, rng: createRng(draft.rng), feed };
    switch (cmd.type) {
      case "chooseAction":
        save = handleAction(ctx, cmd.action, { skill: cmd.skill, stat: cmd.stat, region: cmd.region, npc: cmd.npc });
        break;
      case "chooseChoice":
        save = handleChoice(ctx, cmd.choiceId);
        break;
      case "continue":
        save = handleContinue(ctx);
        break;
      case "goDeeper":
        save = handleGoDeeper(ctx, cmd.yes);
        break;
      case "combat":
        save = handleCombat(ctx, cmd.action);
        break;
      case "endDay":
        if (draft.time.phase !== "evening" || draft.activeEvent || draft.combat) {
          feed.push({ kind: "toast", text: "아직 할 일이 남았다" });
          break;
        }
        runEvening(ctx, cmd.order);
        save = true;
        break;
      case "shop":
        save = handleShop(ctx, cmd);
        break;
      case "equip":
        save = ok(ctx, equip(ctx, cmd.slotIndex));
        break;
      case "unequip":
        save = ok(ctx, unequip(ctx, cmd.slot));
        break;
      case "discard":
        save = ok(ctx, draft.combat ? "싸우는 중에는 할 수 없다" : discard(ctx, cmd.slotIndex));
        break;
      case "useItem":
        save = ok(ctx, draft.combat ? "싸우는 중에는 전투 행동으로 쓴다" : consumeItem(ctx, cmd.itemId, false) ? null : "지금은 쓸 수 없다");
        break;
    }
    // 명령이 받아들여져 행동을 고를 차례가 됐으면, 때가 된 스토리가 먼저 끼어든다 (SYSTEM_SPEC 4-3)
    if (save && startPendingStory(ctx)) save = true;
    // 날이 바뀌었으면 체크포인트 (저녁 정산 뒤, 또는 밤 이벤트가 끝난 뒤)
    checkpoint = draft.time.day > state.time.day && !draft.ending;
  });

  return { state: next, feed, save: save || checkpoint, checkpoint };
}

function handleShop(ctx: Ctx, cmd: Extract<GameCommand, { type: "shop" }>): boolean {
  switch (cmd.op) {
    case "buyFood": return buyFood(ctx, cmd.qty ?? 1);
    case "payDebt": return payDebt(ctx, cmd.qty ?? ctx.draft.resources.debt);
    case "buy": return ok(ctx, cmd.shop && cmd.target ? buy(ctx, cmd.shop, cmd.target) : "무엇을 살지 정하지 않았다");
    case "sell": return ok(ctx, sell(ctx, Number(cmd.target), cmd.qty ?? 1));
    case "repair": return ok(ctx, repair(ctx, (cmd.target ?? "weapon") as RepairTarget));
    case "treat": return ok(ctx, treat(ctx));
  }
}

/** 거절 사유가 있으면 피드에 남기고 false */
function ok(ctx: Ctx, reason: string | null): boolean {
  if (reason) ctx.feed.push({ kind: "toast", text: reason });
  return reason === null;
}
