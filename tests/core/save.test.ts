import { describe, expect, it } from "vitest";
import { dispatch } from "@/core/engine";
import { newRun } from "@/core/newRun";
import { MIGRATIONS } from "@/core/save/migrations";
import { clearRun, decodeSave, encodeSave, loadRun, saveCheckpoint, saveRun, type KeyValueStore } from "@/core/save/serialize";
import { SAVE_KEYS, SAVE_VERSION, type RunState } from "@/core/types";
import { CONTENT } from "@/data";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (seed = 1) => newRun(CONTENT, "hunter", "하람", { seed, now: NOW });

/** AsyncStorage 대신 쓰는 메모리 저장소. failOn에 키를 넣으면 그 키 쓰기에서 실패한다 (쓰다가 꺼진 상황). */
function memory(failOn?: string): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      if (k === failOn) throw new Error("쓰다가 꺼짐");
      data.set(k, v);
    },
    removeItem: async (k) => { data.delete(k); },
  };
}

describe("저장 파일", () => {
  it("저장하고 읽으면 같은 상태", () => {
    const run = start();
    expect(decodeSave(encodeSave(run, NOW))).toEqual(run);
  });

  it("한 글자라도 바뀌면 체크섬이 맞지 않아 버린다", () => {
    const text = encodeSave(start(), NOW).replace('"silver":5', '"silver":500');
    expect(decodeSave(text)).toBeNull();
    expect(decodeSave("{망가진 json")).toBeNull();
  });

  it("더 새 버전 파일은 읽지 않고, 옛 버전은 변환을 차례로 적용한다", () => {
    const file = JSON.parse(encodeSave(start(), NOW));
    expect(decodeSave(JSON.stringify({ ...file, version: SAVE_VERSION + 1 }))).toBeNull();
    // 변환이 없는 옛 버전은 읽을 수 없다
    expect(decodeSave(JSON.stringify({ ...file, version: 0 }))).toBeNull();
    MIGRATIONS[0] = (old) => ({ ...(old as object), version: 1 });
    try {
      expect(decodeSave(JSON.stringify({ ...file, version: 0 }))).toEqual(start());
    } finally {
      delete MIGRATIONS[0];
    }
  });
});

describe("저장 슬롯", () => {
  it("본 저장 → 임시본 → 백업 순서로 읽고, 본 저장이 깨졌으면 되살렸다고 알린다", async () => {
    const kv = memory();
    const morning = start();
    const later = { ...start(), resources: { ...start().resources, silver: 99 } };
    await saveCheckpoint(kv, morning, NOW);
    await saveCheckpoint(kv, later, NOW);
    expect(await loadRun(kv)).toEqual({ run: later, recovered: false });

    kv.data.set(SAVE_KEYS.run, "깨짐");
    expect(await loadRun(kv)).toEqual({ run: morning, recovered: true });
  });

  it("임시본을 쓰다 끊기면 본 저장은 그대로 남는다", async () => {
    const kv = memory();
    await saveRun(kv, start(), NOW);
    const broken = memory(SAVE_KEYS.runTemp);
    broken.data.set(SAVE_KEYS.run, kv.data.get(SAVE_KEYS.run)!);
    await expect(saveRun(broken, { ...start(), runId: "다른 회차" }, NOW)).rejects.toThrow();
    expect((await loadRun(broken))?.run.runId).toBe(start().runId);
  });

  it("백업은 하루 시작(체크포인트)에만 바뀐다: 그때 있던 저장(전날 마지막 상태)이 백업으로", async () => {
    const kv = memory();
    await saveCheckpoint(kv, start(1), NOW);
    expect(kv.data.has(SAVE_KEYS.runBackup)).toBe(false);
    await saveRun(kv, start(2), NOW);
    await saveCheckpoint(kv, start(3), NOW);
    await saveRun(kv, start(4), NOW);
    expect(decodeSave(kv.data.get(SAVE_KEYS.runBackup)!)?.runId).toBe(start(2).runId);
    expect(kv.data.has(SAVE_KEYS.runTemp)).toBe(false);
  });

  it("회차가 끝나면 진행 저장을 모두 지운다", async () => {
    const kv = memory();
    await saveCheckpoint(kv, start(), NOW);
    await saveCheckpoint(kv, start(), NOW);
    await clearRun(kv);
    expect(await loadRun(kv)).toBeNull();
  });

  it("저장했다 불러와도 다음 굴림이 같다 (RNG 상태까지 저장)", async () => {
    const kv = memory();
    let run: RunState = dispatch(start(7), { type: "chooseAction", action: "work" }, CONTENT).state;
    await saveRun(kv, run, NOW);
    const loaded = (await loadRun(kv))!.run;
    const a = dispatch(run, { type: "chooseAction", action: "work" }, CONTENT);
    const b = dispatch(loaded, { type: "chooseAction", action: "work" }, CONTENT);
    expect(b.feed).toEqual(a.feed);
    expect(b.state).toEqual(a.state);
    run = a.state;
    expect(run.time.phase).toBe("evening");
  });
});
