import { router, type Href } from "expo-router";

/**
 * 화면 이동은 한 번만: 버튼을 빠르게 두 번 누르면 같은 화면이 두 겹 쌓이므로,
 * 이동을 한 번 하고 나면 잠깐 동안 다음 이동을 무시한다.
 */
const LOCK_MS = 700;
let lockedUntil = 0;

/** 잠겨 있지 않으면 fn을 실행하고 잠근다. @returns 실행했으면 true */
export function once(fn: () => void): boolean {
  const now = Date.now();
  if (now < lockedUntil) return false;
  lockedUntil = now + LOCK_MS;
  fn();
  return true;
}

export const pushOnce = (href: Href) => once(() => router.push(href));
export const replaceOnce = (href: Href) => once(() => router.replace(href));
