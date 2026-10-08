import { ENDING_LABEL } from "../labels";
import { SAVE_KEYS, SAVE_VERSION, type MetaSave, type RunRecord } from "../types";
import { seal, unseal } from "./seal";
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

interface MetaFile { version: number; data: MetaSave }

/** 기록도 진행 저장처럼 봉인한다 (본 엔딩을 고쳐 넣지 못하게) */
export async function saveMeta(kv: KeyValueStore, meta: MetaSave): Promise<void> {
  const file: MetaFile = { version: SAVE_VERSION, data: meta };
  await kv.setItem(SAVE_KEYS.meta, seal(JSON.stringify(file)));
}

/** 없거나 깨졌거나 조작됐으면 빈 기록 (기록이 깨졌다고 게임을 못 하게 하지는 않는다) */
export async function loadMeta(kv: KeyValueStore): Promise<MetaSave> {
  try {
    const raw = await kv.getItem(SAVE_KEYS.meta);
    const text = raw ? unseal(raw) : null;
    if (!text) return emptyMeta();
    const file = JSON.parse(text) as MetaFile;
    if (file.version !== SAVE_VERSION || !plausibleMeta(file.data)) return emptyMeta();
    return { ...emptyMeta(), ...file.data };
  } catch {
    return emptyMeta();
  }
}

/** 본 엔딩은 실제 엔딩 ID이고, 기록에 남은 회차에서 본 것이어야 한다 */
function plausibleMeta(m: MetaSave): boolean {
  if (!Array.isArray(m.endingsSeen) || !Array.isArray(m.history)) return false;
  if (!m.endingsSeen.every((e) => Object.hasOwn(ENDING_LABEL, e))) return false;
  if (!Number.isInteger(m.totalRuns) || m.totalRuns < m.history.length) return false;
  // 기록은 최근 HISTORY_MAX판만 남으므로, 기록이 꽉 차지 않았다면 본 엔딩은 모두 기록 안에 있어야 한다
  if (m.history.length < HISTORY_MAX && !m.endingsSeen.every((e) => m.history.some((h) => h.ending === e))) return false;
  return true;
}
