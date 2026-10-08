import { describe, expect, it } from "vitest";
import { dispatch } from "@/core/engine";
import { newRun } from "@/core/newRun";
import { MIGRATIONS } from "@/core/save/migrations";
import { seal, unseal } from "@/core/save/seal";
import { clearRun, decodeSave, encodeSave, loadRun, saveCheckpoint, saveRun, type KeyValueStore } from "@/core/save/serialize";
import { validateRun } from "@/core/save/validate";
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

  it("저장 파일은 봉인되어 있어 글자로 읽을 수 없다 (이름·수치가 그대로 보이지 않는다)", () => {
    const text = encodeSave(start(), NOW);
    expect(text.startsWith("BRW2.")).toBe(true);
    expect(text).not.toContain("하람");
    expect(text).not.toContain("silver");
  });

  it("봉인을 한 글자라도 고치거나, 봉인 없는 옛 JSON을 넣으면 읽지 않는다", () => {
    const text = encodeSave(start(), NOW);
    const [magic, body, mac] = text.split(".");
    const flipped = body.slice(0, 40) + (body[40] === "A" ? "B" : "A") + body.slice(41);
    expect(decodeSave(`${magic}.${flipped}.${mac}`)).toBeNull();
    expect(decodeSave(`${magic}.${body}.${"0".repeat(64)}`)).toBeNull();
    // 서명을 다시 계산하지 못하는 편집: 풀어서 고친 뒤 다른 열쇠 없이 붙이면 안 맞는다
    const plain = JSON.stringify({ version: SAVE_VERSION, savedAt: NOW, checksum: "x", data: { ...start(), resources: { ...start().resources, silver: 999 } } });
    expect(decodeSave(plain)).toBeNull();
    expect(decodeSave("{망가진 json")).toBeNull();
  });

  it("서명이 맞아도 게임에서 나올 수 없는 상태는 버린다 (수치 조작·엔딩 건너뛰기)", () => {
    const forged = (fn: (s: RunState) => void) => {
      const run = structuredClone(start());
      fn(run);
      return seal(JSON.stringify({ version: SAVE_VERSION, savedAt: NOW, data: run }));
    };
    expect(decodeSave(forged(() => {}), CONTENT)).toEqual(start());
    expect(decodeSave(forged((s) => { s.resources.silver = 99999; }), CONTENT)).toBeNull();
    expect(decodeSave(forged((s) => { s.player.stats.str = 9; }), CONTENT)).toBeNull();
    expect(decodeSave(forged((s) => { s.player.hp = 99; }), CONTENT)).toBeNull();
    expect(decodeSave(forged((s) => { s.player.skills.blade.rank = 9; }), CONTENT)).toBeNull();
    expect(decodeSave(forged((s) => { s.ending = "hero_party"; }), CONTENT)).toBeNull();
    expect(decodeSave(forged((s) => { s.time.day = 31; }), CONTENT)).toBeNull();
    expect(decodeSave(forged((s) => { s.inventory.slots[0] = { itemId: "healing_potion", qty: 99 }; }), CONTENT)).toBeNull();
    expect(decodeSave(forged((s) => { s.player.traits.push("없는 흔적"); }), CONTENT)).toBeNull();
    expect(validateRun(start(), CONTENT)).toBeNull();
  });

  it("봉인은 한글·이모지도 그대로 되돌린다", () => {
    for (const t of ["", "보리울의 30일", "🐺 늑대", "x".repeat(1000)]) expect(unseal(seal(t))).toBe(t);
  });

  it("더 새 버전 파일은 읽지 않고, 옛 버전은 변환을 차례로 적용한다", () => {
    const file = JSON.parse(unseal(encodeSave(start(), NOW))!);
    const sealed = (version: number) => seal(JSON.stringify({ ...file, version }));
    expect(decodeSave(sealed(SAVE_VERSION + 1))).toBeNull();
    // 변환이 없는 옛 버전(봉인 전 1)은 읽을 수 없다
    expect(decodeSave(sealed(1))).toBeNull();
    // 1 → 2 변환을 잠시 넣으면 2 → 3 → 4를 차례로 거친다 (옛 HP 6 → 12)
    const old = JSON.parse(unseal(encodeSave(start(), NOW))!);
    old.data.player.hp = start().player.hp / 2;
    MIGRATIONS[1] = (f) => ({ ...(f as object), version: 2 });
    try {
      expect(decodeSave(seal(JSON.stringify({ ...old, version: 1 })))).toEqual(start());
    } finally {
      delete MIGRATIONS[1];
    }
  });

  it("버전 2 저장은 명성 0을 더하고, 버전 3 저장은 HP를 2배로 읽는다", () => {
    const file = JSON.parse(unseal(encodeSave(start(), NOW))!);
    file.data.player.hp = 6;
    delete file.data.player.fame;
    const back = decodeSave(seal(JSON.stringify({ ...file, version: 2 })), CONTENT);
    expect(back?.player).toMatchObject({ fame: 0, hp: 12 });

    const fighting = dispatch(start(), { type: "chooseAction", action: "village", npc: "arena" }, CONTENT).state;
    const inFight = dispatch(fighting, { type: "chooseChoice", choiceId: "brawler" }, CONTENT).state;
    expect(inFight.combat).not.toBeNull();
    const v3 = JSON.parse(unseal(encodeSave(inFight, NOW))!);
    v3.data.player.hp = 5;
    for (const e of v3.data.combat.enemies) { e.hp = 3; e.maxHp = 6; }
    const loaded = decodeSave(seal(JSON.stringify({ ...v3, version: 3 })), CONTENT);
    expect(loaded?.player.hp).toBe(10);
    expect(loaded?.combat?.enemies[0]).toMatchObject({ hp: 6, maxHp: 12 });
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
