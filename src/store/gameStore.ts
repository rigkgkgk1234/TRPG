import { create } from "zustand";
import type { FeedItem, GameCommand } from "@/core/commands";
import { dispatch } from "@/core/engine";
import { newRun } from "@/core/newRun";
import type { JobId, RunState } from "@/core/types";
import { CONTENT } from "@/data";

/** 화면에 남겨 둘 최근 명령 수 */
const LOG_MAX = 20;

/** 명령 하나가 남긴 피드 묶음. id는 화면 key용으로 계속 늘어난다. */
export interface LogGroup {
  id: number;
  items: FeedItem[];
}
let nextLogId = 1;

interface GameStore {
  run: RunState | null;
  /** 최근 결과 기록. 명령 하나가 남긴 피드가 한 묶음 (새것이 뒤). 주사위 연출·입력 잠금(useFeedPlayer)은 8주차에 이 자리에 들어온다. */
  log: LogGroup[];
  send: (cmd: GameCommand) => void;
  startNew: (job: JobId, name: string) => void;
}

/**
 * 진행 중인 회차를 들고 있는 얇은 스토어. 규칙은 전부 코어(dispatch)에 있다. (ARCHITECTURE 3-2)
 * 저장(AsyncStorage)은 5주차 storage.ts에서 send의 result.save / checkpoint를 보고 붙인다.
 */
export const useGame = create<GameStore>()((set, get) => ({
  run: null,
  log: [],

  send: (cmd) => {
    const { run, log } = get();
    if (!run) return;
    const result = dispatch(run, cmd, CONTENT);
    // 한 번의 set으로: 새 기록과 새 상태가 따로 보이는 순간이 없게
    set({
      run: result.state,
      log: result.feed.length > 0 ? [...log, { id: nextLogId++, items: result.feed }].slice(-LOG_MAX) : log,
    });
  },

  startNew: (job, name) => {
    const now = new Date();
    const seed = (now.getTime() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    set({ run: newRun(CONTENT, job, name, { seed, now: now.toISOString() }), log: [] });
  },
}));
