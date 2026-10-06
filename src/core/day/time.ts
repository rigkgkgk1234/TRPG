import type { RunState } from "../types";

/** 행동 슬롯 하나를 쓴다: 오전 → 오후 → 저녁. 탈진했으면 바로 저녁. */
export function advanceSlot(s: RunState): void {
  if (s.time.collapsedToday || s.time.phase === "pm") s.time.phase = "evening";
  else s.time.phase = "pm";
}
