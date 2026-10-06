import { create } from "zustand";
import type { FeedItem, GameCommand } from "@/core/commands";
import { dispatch } from "@/core/engine";
import { newRun } from "@/core/newRun";
import type { DayPhase, JobId, RunState } from "@/core/types";
import { CONTENT } from "@/data";

/** 화면에 남겨 둘 최근 명령 수 */
const LOG_MAX = 20;

/** 명령 하나가 남긴 피드 묶음. id는 화면 key용으로 계속 늘어난다. */
export interface LogGroup {
  id: number;
  /** 무엇을 했는지 (결과 카드 제목) */
  cmd: GameCommand;
  /** 명령을 보낸 시점 */
  day: number;
  phase: DayPhase;
  items: FeedItem[];
}
let nextLogId = 1;

interface GameStore {
  run: RunState | null;
  /** 최근 결과 기록. 명령 하나가 남긴 피드가 한 묶음 (새것이 뒤). */
  log: LogGroup[];
  /**
   * 연출 중인 묶음. 상태는 이미 확정됐지만(SYSTEM_SPEC 7-2) 화면은 결과 카드가 다 보일 때까지
   * 명령 전 상태(shownRun)를 그리고 입력을 잠근다. (ARCHITECTURE 3-4의 단순한 형태)
   */
  playing: { id: number; before: RunState } | null;
  send: (cmd: GameCommand) => void;
  finishPlaying: () => void;
  startNew: (job: JobId, name: string) => void;
}

/**
 * 진행 중인 회차를 들고 있는 얇은 스토어. 규칙은 전부 코어(dispatch)에 있다. (ARCHITECTURE 3-2)
 * 저장(AsyncStorage)은 5주차 storage.ts에서 send의 result.save / checkpoint를 보고 붙인다.
 */
export const useGame = create<GameStore>()((set, get) => ({
  run: null,
  log: [],
  playing: null,

  send: (cmd) => {
    const { run, log, playing } = get();
    if (!run || playing) return;
    const result = dispatch(run, cmd, CONTENT);
    // 피드가 비어도(피로 0·HP 가득일 때 휴식) 무엇을 했는지는 카드로 남긴다
    const group: LogGroup = { id: nextLogId++, cmd, day: run.time.day, phase: run.time.phase, items: result.feed };
    // 거절(토스트)만 있는 묶음은 연출할 것이 없다
    const animate = result.feed.length === 0 || result.feed.some((f) => f.kind !== "toast");
    // 한 번의 set으로: 새 기록과 새 상태가 따로 보이는 순간이 없게
    set({
      run: result.state,
      log: [...log, group].slice(-LOG_MAX),
      playing: animate ? { id: group.id, before: run } : null,
    });
  },

  finishPlaying: () => set({ playing: null }),

  startNew: (job, name) => {
    const now = new Date();
    const seed = (now.getTime() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    set({ run: newRun(CONTENT, job, name, { seed, now: now.toISOString() }), log: [], playing: null });
  },
}));

/** 화면이 그릴 상태: 연출 중이면 명령 전 상태, 아니면 현재 상태 */
export const useShownRun = () => useGame((s) => s.playing?.before ?? s.run);
