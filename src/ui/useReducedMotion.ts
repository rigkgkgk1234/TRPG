import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** 시스템의 "동작 줄이기"가 켜져 있으면 true. 켜져 있으면 주사위·등장 연출을 건너뛴다. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
