import { create } from "zustand";
import type { FeedItem, GameCommand } from "@/core/commands";
import { dispatch } from "@/core/engine";
import { newRun } from "@/core/newRun";
import { checksum, type JobId, type RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { makeRecord } from "@/core/story/ending";
import { useMeta } from "./metaStore";
import { clearRun, loadRun, saveCheckpoint, saveRun } from "./storage";

/** 화면에 남겨 둘 최근 명령 수 */
const LOG_MAX = 20;

/** 명령 하나가 남긴 피드 묶음. id는 화면 key용으로 계속 늘어난다. */
export interface LogGroup {
  id: number;
  /** 무엇을 했는지 (결과 카드 제목) */
  cmd: GameCommand;
  /** 명령을 보내기 직전 상태. 고른 선택지의 이름·시각을 여기서 읽는다 (immer가 바뀌지 않은 부분을 공유하므로 가볍다) */
  before: RunState;
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
  /** 앱을 켠 뒤 저장을 읽어 봤는지 (읽기 전에는 타이틀의 "이어하기"를 정할 수 없다) */
  hydrated: boolean;
  /** 저장이 깨져 백업에서 되살렸을 때 한 번 보여 줄 안내 */
  notice: string | null;
  send: (cmd: GameCommand) => void;
  finishPlaying: () => void;
  startNew: (job: JobId, name: string) => void;
  /** 저장된 회차를 불러온다. 앱을 켤 때 한 번 */
  hydrate: () => Promise<void>;
  /** 앱이 뒤로 갈 때 */
  flush: () => void;
  dismissNotice: () => void;
}

/** 연출 없이 바로 반영하는 명령 (가방·마을 창에서 연달아 누를 수 있게) */
const INSTANT = new Set<GameCommand["type"]>(["shop", "equip", "unequip", "useItem", "discard"]);
/**
 * 연출 없는 명령은 이 간격 안에 다시 들어오면 무시한다: 두 번 눌렀을 때 첫 번째로 버튼이 사라지면
 * 그 자리로 올라온 다른 버튼(예: 식량 사기 → 빚 갚기)이 눌리는 것을 막는다.
 */
const INSTANT_GAP_MS = 350;
let lastInstantAt = 0;

/**
 * 실행 중 조작 막기: 스토어가 상태를 바꿀 때마다 지문을 남기고, 다음 명령·저장 전에 맞춰 본다.
 * 메모리 조작 도구로 은화·HP 같은 값을 바꾸면 지문이 어긋나므로 그 상태를 버리고 마지막 저장으로 되돌린다.
 */
let fingerprint: string | null = null;
const SALT = "brw:" + (0x1e).toString(36);
const stamp = (run: RunState | null) => (run ? checksum(SALT + JSON.stringify(run)) : null);
const intact = (run: RunState | null) => stamp(run) === fingerprint;
export const TAMPER_NOTICE = "게임 값이 바깥에서 바뀐 것을 발견해 마지막 저장으로 되돌렸다.";

/** 저장은 순서대로 한 번에 하나씩 (앞 저장이 끝나기 전에 뒤 저장이 끼어들지 않게) */
let writing: Promise<void> = Promise.resolve();
function persist(task: () => Promise<void>): void {
  writing = writing.then(task).catch((e) => console.warn("저장 실패", e));
}

/**
 * 진행 중인 회차를 들고 있는 얇은 스토어. 규칙은 전부 코어(dispatch)에 있다. (ARCHITECTURE 3-2)
 * 저장: 상태를 바꾼 뒤 저장하고 나서 연출한다 (SYSTEM_SPEC 7-2). 하루 시작은 체크포인트(백업 갱신), 회차가 끝나면 진행 저장을 지운다.
 */
export const useGame = create<GameStore>()((set, get) => ({
  run: null,
  log: [],
  playing: null,
  hydrated: false,
  notice: null,

  send: (cmd) => {
    const { run, log, playing } = get();
    if (!run || playing) return;
    if (!intact(run)) return void restoreAfterTamper();
    if (INSTANT.has(cmd.type)) {
      const now = Date.now();
      if (now - lastInstantAt < INSTANT_GAP_MS) return;
      lastInstantAt = now;
    }
    const result = dispatch(run, cmd, CONTENT);
    // 피드가 비어도(피로 0·HP 가득일 때 휴식) 무엇을 했는지는 카드로 남긴다
    const group: LogGroup = { id: nextLogId++, cmd, before: run, items: result.feed };
    // 거절(토스트)만 있는 묶음은 연출할 것이 없다
    const animate = !INSTANT.has(cmd.type) && (result.feed.length === 0 || result.feed.some((f) => f.kind !== "toast"));
    // 한 번의 set으로: 새 기록과 새 상태가 따로 보이는 순간이 없게
    fingerprint = stamp(result.state);
    set({
      run: result.state,
      log: [...log, group].slice(-LOG_MAX),
      // 되돌렸다는 안내는 다음 행동을 하면 거둔다
      notice: null,
      playing: animate ? { id: group.id, before: run } : null,
    });
    const next = result.state;
    if (next.ending) {
      // 기록을 먼저 남기고, 저장이 끝난 뒤에 진행 저장을 지운다 (순서가 바뀌면 기록이 사라질 수 있다)
      const record = makeRecord(next, CONTENT, new Date().toISOString(), run);
      persist(async () => {
        await useMeta.getState().record(record);
        await clearRun();
      });
    }
    else if (result.checkpoint) persist(() => saveCheckpoint(next));
    else if (result.save) persist(() => saveRun(next));
  },

  finishPlaying: () => set({ playing: null }),

  startNew: (job, name) => {
    const now = new Date();
    const seed = (now.getTime() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const previous = get().run;
    const run = newRun(CONTENT, job, name, { seed, now: now.toISOString() });
    fingerprint = stamp(run);
    set({ run, log: [], playing: null });
    // 끝나지 않은 회차를 버리면 포기 기록을 남기고, 이전 회차의 백업이 새 회차로 되살아나지 않게 지운다
    persist(async () => {
      if (previous && !previous.ending) await useMeta.getState().record(makeRecord(previous, CONTENT, now.toISOString(), undefined, true));
      await clearRun();
      await saveCheckpoint(run);
    });
  },

  hydrate: async () => {
    try {
      const loaded = await loadRun();
      if (loaded && !loaded.run.ending) {
        fingerprint = stamp(loaded.run);
        set({
          run: loaded.run,
          log: [],
          notice: loaded.recovered ? "저장 기록 일부가 손상되어 남아 있던 기록으로 되살렸다." : null,
        });
      }
    } catch (e) {
      console.warn("불러오기 실패", e);
    } finally {
      set({ hydrated: true });
    }
  },

  flush: () => {
    const run = get().run;
    if (!intact(run)) return void restoreAfterTamper();
    if (run && !run.ending) persist(() => saveRun(run));
  },

  dismissNotice: () => set({ notice: null }),
}));

/** 화면이 그릴 상태: 연출 중이면 명령 전 상태, 아니면 현재 상태 */
export const useShownRun = () => useGame((s) => s.playing?.before ?? s.run);

/** 조작된 상태는 저장하지 않고 버린다: 마지막 저장(봉인·규칙 검사를 통과한 것)으로 되돌리고, 없으면 타이틀로 */
async function restoreAfterTamper(): Promise<void> {
  let loaded: Awaited<ReturnType<typeof loadRun>> = null;
  try {
    loaded = await loadRun();
  } catch {
    loaded = null;
  }
  const run = loaded && !loaded.run.ending ? loaded.run : null;
  fingerprint = stamp(run);
  useGame.setState({ run, log: [], playing: null, notice: TAMPER_NOTICE });
}
