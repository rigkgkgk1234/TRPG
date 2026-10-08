import AsyncStorage from "@react-native-async-storage/async-storage";
import * as save from "@/core/save/serialize";
import type { RunState } from "@/core/types";
import { CONTENT } from "@/data";

/** 코어의 저장 규칙에 AsyncStorage(웹은 localStorage)를 붙인 것. 시각은 여기서 읽는다 (코어는 시계를 모른다). */
const kv: save.KeyValueStore = AsyncStorage;
const now = () => new Date().toISOString();

export const saveRun = (run: RunState) => save.saveRun(kv, { ...run, updatedAt: now() }, now());
export const saveCheckpoint = (run: RunState) => save.saveCheckpoint(kv, { ...run, updatedAt: now() }, now(), CONTENT);
/** 봉인과 규칙 검사를 모두 통과한 저장만 불러온다 */
export const loadRun = () => save.loadRun(kv, CONTENT);
export const clearRun = () => save.clearRun(kv);
