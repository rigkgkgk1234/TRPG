import { checksum, SAVE_KEYS, SAVE_VERSION, type MetaSave, type RunRecord } from "../types";
import type { KeyValueStore } from "./serialize";

/** 회차 기록은 최근 이만큼만 남긴다 */
export const HISTORY_MAX = 50;

export function emptyMeta(): MetaSave {
  return {
    version: SAVE_VERSION,
    endingsSeen: [],
    traitsSeen: [],
    history: [],
    totalRuns: 0,
    settings: { diceAnimation: true, fontScale: 1, textSpeed: "normal", haptics: true },
  };
}

/**
 * 끝난(또는 포기한) 회차를 기록에 더한다. 기록은 다음 회차를 강하게 만들지 않는다: 도감·통계만. (SYSTEM_SPEC 7-3)
 */
export function addRecord(meta: MetaSave, r: RunRecord): MetaSave {
  const seen = new Set(meta.endingsSeen);
  if (r.ending !== "abandoned") seen.add(r.ending);
  return {
    ...meta,
    endingsSeen: [...seen],
    traitsSeen: [...new Set([...meta.traitsSeen, ...r.traits])],
    history: [r, ...meta.history.filter((h) => h.runId !== r.runId)].slice(0, HISTORY_MAX),
    totalRuns: meta.totalRuns + (meta.history.some((h) => h.runId === r.runId) ? 0 : 1),
  };
}

interface MetaFile { version: number; checksum: string; data: MetaSave }

export async function saveMeta(kv: KeyValueStore, meta: MetaSave): Promise<void> {
  const file: MetaFile = { version: SAVE_VERSION, checksum: checksum(JSON.stringify(meta)), data: meta };
  await kv.setItem(SAVE_KEYS.meta, JSON.stringify(file));
}

/** 없거나 깨졌으면 빈 기록 (기록이 깨졌다고 게임을 못 하게 하지는 않는다) */
export async function loadMeta(kv: KeyValueStore): Promise<MetaSave> {
  try {
    const raw = await kv.getItem(SAVE_KEYS.meta);
    if (!raw) return emptyMeta();
    const file = JSON.parse(raw) as MetaFile;
    if (file.version !== SAVE_VERSION || checksum(JSON.stringify(file.data)) !== file.checksum) return emptyMeta();
    return { ...emptyMeta(), ...file.data };
  } catch {
    return emptyMeta();
  }
}
