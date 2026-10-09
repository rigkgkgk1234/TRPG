import type { Migration } from "../types";

/**
 * 저장 파일 버전 올리기: MIGRATIONS[n]은 버전 n 파일을 n+1로 바꾼다. (SYSTEM_SPEC 7-4)
 * RunState 모양을 바꾸면 SAVE_VERSION을 올리고 여기에 변환을 하나 더한다.
 */
export const MIGRATIONS: Record<number, Migration> = {
  // 3: 명성(fame) 추가 → 0에서 시작
  2: (old) => {
    const file = old as { version: number; data?: { player?: Record<string, unknown> } };
    if (file.data?.player && typeof file.data.player.fame !== "number") file.data.player.fame = 0;
    return { ...file, version: 3 };
  },
  // 4: HP 2배 (플레이어 최대 HP 16 + 체력×4, 적 HP 2배) → 지금 HP와 싸우던 적 HP도 2배
  3: (old) => {
    type Hp = { hp?: number; maxHp?: number };
    const file = old as { version: number; data?: { player?: Hp; combat?: { enemies?: Hp[] } | null; stats?: { lowestHp?: Hp | null } } };
    const double = (o: Hp | null | undefined, keys: ("hp" | "maxHp")[]) => {
      if (o) for (const k of keys) if (typeof o[k] === "number") o[k] = o[k] * 2;
    };
    double(file.data?.player, ["hp"]);
    for (const e of file.data?.combat?.enemies ?? []) double(e, ["hp", "maxHp"]);
    double(file.data?.stats?.lowestHp, ["hp"]);
    return { ...file, version: 4 };
  },
  // 5: 장비 칸 6개 (방패 칸 → 왼손, 머리·하체·발 추가)
  4: (old) => {
    const file = old as { version: number; data?: { inventory?: { equipment?: Record<string, unknown> } } };
    const eq = file.data?.inventory?.equipment;
    if (eq) {
      file.data!.inventory!.equipment = {
        weapon: eq.weapon ?? null, offHand: eq.shield ?? null, head: null, armor: eq.armor ?? null, legs: null, feet: null,
      };
    }
    return { ...file, version: 5 };
  },
};
