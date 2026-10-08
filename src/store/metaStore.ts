import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { addRecord, emptyMeta, loadMeta, saveMeta } from "@/core/save/meta";
import { checksum, type MetaSave, type RunRecord } from "@/core/types";

/** 실행 중 조작 막기 (gameStore와 같은 방식): 기록을 바꿀 때마다 지문을 남기고, 다음에 바꾸기 전에 맞춰 본다 */
const stamp = (m: MetaSave) => checksum("meta:" + JSON.stringify(m));
let fingerprint = stamp(emptyMeta());

/**
 * 회차 간 기록: 본 엔딩, 흔적 도감, 지난 회차들. 저장 순서를 지켜야 해서(기록 → 진행 저장 삭제, SYSTEM_SPEC 7-3)
 * persist 미들웨어 대신 record()가 저장이 끝날 때까지 기다릴 수 있게 직접 쓴다.
 */
interface MetaStore {
  meta: MetaSave;
  hydrate: () => Promise<void>;
  /** 기록을 더하고 저장이 끝나면 돌아온다 */
  record: (r: RunRecord) => Promise<void>;
}

export const useMeta = create<MetaStore>()((set, get) => ({
  meta: emptyMeta(),
  hydrate: async () => {
    const meta = await loadMeta(AsyncStorage);
    fingerprint = stamp(meta);
    set({ meta });
  },
  record: async (r) => {
    // 메모리에서 기록이 바뀌었으면 그 기록은 버리고 저장된 기록에 더한다
    const base = stamp(get().meta) === fingerprint ? get().meta : await loadMeta(AsyncStorage);
    const meta = addRecord(base, r);
    fingerprint = stamp(meta);
    set({ meta });
    await saveMeta(AsyncStorage, meta);
  },
}));
