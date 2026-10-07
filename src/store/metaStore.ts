import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { addRecord, emptyMeta, loadMeta, saveMeta } from "@/core/save/meta";
import type { MetaSave, RunRecord } from "@/core/types";

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
  hydrate: async () => set({ meta: await loadMeta(AsyncStorage) }),
  record: async (r) => {
    const meta = addRecord(get().meta, r);
    set({ meta });
    await saveMeta(AsyncStorage, meta);
  },
}));
