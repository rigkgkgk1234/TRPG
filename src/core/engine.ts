import { produce } from "immer";
import type { Ctx, DispatchResult, FeedItem, GameCommand } from "./commands";
import type { ContentDB } from "./content";
import { handleAction } from "./day/actions";
import { runEvening } from "./day/evening";
import { buyFood, payDebt } from "./day/town";
import { handleChoice, handleContinue, handleGoDeeper } from "./events/runner";
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
        save = handleAction(ctx, cmd.action, { skill: cmd.skill, region: cmd.region });
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
      case "endDay":
        if (draft.time.phase !== "evening") {
          feed.push({ kind: "toast", text: "아직 할 일이 남았다" });
          break;
        }
        checkpoint = runEvening(ctx, cmd.order);
        save = true;
        break;
      case "shop":
        save = cmd.op === "buyFood" ? buyFood(ctx, cmd.qty) : payDebt(ctx, cmd.qty);
        break;
    }
  });

  return { state: next, feed, save: save || checkpoint, checkpoint };
}
