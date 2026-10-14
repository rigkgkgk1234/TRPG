import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { Platform } from "react-native";

/**
 * 효과음. 소리마다 비슷한 파일 여러 개를 두고 칠 때마다 하나를 골라 같은 소리가 되풀이되지 않게 한다.
 * 파일은 Kenney Casino Audio(CC0)를 앞뒤를 잘라 모노 m4a로 바꾼 것이다 (assets/sounds).
 */
const SOURCES = {
  /** 손 안에서 주사위를 흔드는 소리 (0.7초, 끝을 줄였다) */
  diceShake: [
    require("../../assets/sounds/dice-shake-1.m4a"),
    require("../../assets/sounds/dice-shake-2.m4a"),
    require("../../assets/sounds/dice-shake-3.m4a"),
  ],
  /** 주사위 하나가 떨어지는 소리. 첫 부딪힘이 파일 맨 앞에 오게 잘랐다 */
  dieLand: [
    require("../../assets/sounds/die-land-1.m4a"),
    require("../../assets/sounds/die-land-2.m4a"),
    require("../../assets/sounds/die-land-3.m4a"),
    require("../../assets/sounds/die-land-4.m4a"),
  ],
  /** 주사위 둘(유리·불리)이 떨어지는 소리 */
  diceLand: [
    require("../../assets/sounds/dice-land-1.m4a"),
    require("../../assets/sounds/dice-land-2.m4a"),
    require("../../assets/sounds/dice-land-3.m4a"),
  ],
} as const;

export type SoundName = keyof typeof SOURCES;

const VOLUME: Record<SoundName, number> = { diceShake: 0.55, dieLand: 0.9, diceLand: 0.9 };

const last: Partial<Record<SoundName, number>> = {};

/**
 * 듣던 음악은 끊지 않는다. 아이폰은 무음 스위치를 따르고, 안드로이드는 미디어 음량만 따른다
 * (안드로이드에서 끄면 진동 모드일 때 미디어 음량이 켜져 있어도 소리가 나지 않는다).
 * 첫 소리가 모드보다 먼저 가지 않게, 파일을 받느라 늦지 않게 앱이 뜰 때 미리 정하고 불러 둔다.
 */
const players = new Map<number, AudioPlayer>();
try {
  setAudioModeAsync({ playsInSilentMode: Platform.OS !== "ios", interruptionMode: "mixWithOthers" }).catch(() => {});
  for (const list of Object.values(SOURCES)) for (const source of list) players.set(source, createAudioPlayer(source));
} catch {
  // 소리가 안 나도 게임은 그대로 간다
}

export function playSound(name: SoundName): void {
  try {
    const list = SOURCES[name];
    // 바로 전에 친 파일은 빼고 고른다
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === last[name]) i = (i + 1) % list.length;
    last[name] = i;
    const p = players.get(list[i]);
    if (!p) return;
    p.volume = VOLUME[name];
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // 소리가 안 나도 게임은 그대로 간다
  }
}

/** 울리고 있는 소리를 멈춘다 (주사위가 멈추면 흔드는 소리도 끊는다) */
export function stopSound(name: SoundName): void {
  for (const source of SOURCES[name]) {
    const p = players.get(source);
    if (p?.playing) p.pause();
  }
}
