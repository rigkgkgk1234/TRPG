import type { RunState } from "@/core/types";

/** 게임 화면 안의 뷰는 라우터가 아니라 상태에서 정해진다. (ARCHITECTURE 3-3) 이벤트·전투 뷰는 3·4주차. */
export type GameView = "ending" | "evening" | "hub";

export function selectView(run: RunState): GameView {
  if (run.ending) return "ending";
  if (run.time.phase === "evening") return "evening";
  return "hub";
}
