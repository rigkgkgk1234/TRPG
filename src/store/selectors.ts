import type { RunState } from "@/core/types";

/** 게임 화면 안의 뷰는 라우터가 아니라 상태에서 정해진다. (ARCHITECTURE 3-3) */
export type GameView = "ending" | "overflow" | "combat" | "event" | "evening" | "hub";

export function selectView(run: RunState): GameView {
  if (run.ending) return "ending";
  // 가방에 넣지 못한 물건이 있으면 정리부터 (다른 행동은 엔진이 받지 않는다)
  if (run.overflow.length > 0) return "overflow";
  if (run.combat) return "combat";
  if (run.activeEvent) return "event";
  if (run.time.phase === "evening") return "evening";
  return "hub";
}
