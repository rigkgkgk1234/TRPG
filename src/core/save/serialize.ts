import type { ContentDB } from "../content";
import { SAVE_KEYS, SAVE_VERSION, type RunSaveFile, type RunState } from "../types";
import { MIGRATIONS } from "./migrations";
import { seal, unseal } from "./seal";
import { validateRun } from "./validate";

/**
 * 저장 파일 읽기·쓰기 규칙 (SYSTEM_SPEC 7장). 저장소(AsyncStorage)는 바깥에서 주입한다:
 * 코어는 React Native를 모르므로 테스트에서는 메모리 저장소를 넣는다.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** 저장 파일은 봉인해서 쓴다: 글자로 읽거나 고칠 수 없고, 고치면 서명이 맞지 않는다 (seal.ts) */
export function encodeSave(run: RunState, savedAt: string): string {
  const file: RunSaveFile = { version: SAVE_VERSION, savedAt, data: run };
  return seal(JSON.stringify(file));
}

/**
 * 봉인이 깨졌거나(서명·형식) 모르는 버전이면 null. content를 주면 게임 규칙으로 나올 수 없는 상태도 버린다
 * (수치 조작·엔딩 건너뛰기 방지, validate.ts).
 */
export function decodeSave(raw: string, content?: Parameters<typeof validateRun>[1]): RunState | null {
  try {
    const text = unseal(raw);
    if (text === null) return null;
    let file = JSON.parse(text) as RunSaveFile;
    if (typeof file?.version !== "number" || file.version > SAVE_VERSION) return null;
    while (file.version < SAVE_VERSION) {
      const step = MIGRATIONS[file.version];
      if (!step) return null;
      file = step(file) as RunSaveFile;
    }
    if (!file.data) return null;
    if (content && validateRun(file.data, content) !== null) return null;
    return file.data;
  } catch {
    return null;
  }
}

/** 원자적 쓰기 흉내: 임시 키에 먼저 쓰고, 성공하면 본 키에 쓰고 임시 키를 지운다 */
export async function saveRun(kv: KeyValueStore, run: RunState, savedAt: string): Promise<void> {
  const text = encodeSave(run, savedAt);
  await kv.setItem(SAVE_KEYS.runTemp, text);
  await kv.setItem(SAVE_KEYS.run, text);
  await kv.removeItem(SAVE_KEYS.runTemp);
}

/** 하루 시작: 지금 본 저장을 백업으로 옮긴 뒤 새로 저장한다 (백업은 이때만 바뀐다) */
export async function saveCheckpoint(kv: KeyValueStore, run: RunState, savedAt: string, content?: Pick<ContentDB, "items" | "traits" | "events" | "enemies" | "jobs">): Promise<void> {
  const prev = await kv.getItem(SAVE_KEYS.run);
  if (prev && decodeSave(prev, content)) await kv.setItem(SAVE_KEYS.runBackup, prev);
  await saveRun(kv, run, savedAt);
}

export interface Loaded {
  run: RunState;
  /** 본 저장이 깨져서 임시본이나 백업에서 되살렸다 */
  recovered: boolean;
}

/** 본 저장 → (쓰다 끊긴) 임시본 → 전날 아침 백업 순서로 처음 멀쩡한 것을 읽는다 */
export async function loadRun(kv: KeyValueStore, content?: Pick<ContentDB, "items" | "traits" | "events" | "enemies" | "jobs">): Promise<Loaded | null> {
  const order = [[SAVE_KEYS.run, false], [SAVE_KEYS.runTemp, true], [SAVE_KEYS.runBackup, true]] as const;
  for (const [key, recovered] of order) {
    const raw = await kv.getItem(key);
    const run = raw ? decodeSave(raw, content) : null;
    if (run) return { run, recovered };
  }
  return null;
}

/** 회차가 끝나면 진행 저장을 지운다 (기록은 6주차 metaStore가 먼저 남긴다) */
export async function clearRun(kv: KeyValueStore): Promise<void> {
  for (const key of [SAVE_KEYS.run, SAVE_KEYS.runTemp, SAVE_KEYS.runBackup]) await kv.removeItem(key);
}
