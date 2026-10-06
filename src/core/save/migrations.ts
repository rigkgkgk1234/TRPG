import type { Migration } from "../types";

/**
 * 저장 파일 버전 올리기: MIGRATIONS[n]은 버전 n 파일을 n+1로 바꾼다. (SYSTEM_SPEC 7-4)
 * RunState 모양을 바꾸면 SAVE_VERSION을 올리고 여기에 변환을 하나 더한다. 지금은 버전 1뿐이다.
 */
export const MIGRATIONS: Record<number, Migration> = {};
