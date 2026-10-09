import { useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import type { CheckResult } from "@/core/types";
import { OUTCOME_COLOR } from "@/ui/turnSummary";
import { colors, fonts, motion, radius } from "@/ui/theme";
import { Text } from "@/ui/Text";

/** 웹에는 네이티브 애니메이션 모듈이 없어 경고가 난다 */
export const NATIVE_DRIVER = Platform.OS !== "web";

const FACE_INTERVAL = 60;

/**
 * D20 주사위. rolling 동안 가짜 눈을 돌리며 흔들리고, 멈추면 실제 눈으로 튀어 오른다.
 * 연출용 Math.random()은 게임 결과와 무관하다 (결과는 이미 result에 확정). (ARCHITECTURE 8주차)
 * 유리/불리면 두 개를 굴리고 버린 쪽은 흐리게 둔다.
 */
export function DiceRoll({ result, rolling, pending = false, small = false }: { result: CheckResult; rolling: boolean; pending?: boolean; small?: boolean }) {
  const keptIndex = result.dice.indexOf(result.kept);
  return (
    <View style={styles.row}>
      {result.dice.map((value, i) => (
        <Die key={i} value={value} rolling={rolling} pending={pending} small={small} kept={i === keptIndex}
          color={i === keptIndex ? OUTCOME_COLOR[result.outcome] : colors.textFaint} />
      ))}
    </View>
  );
}

/** pending: 아직 굴릴 차례가 아니다 (두 손 무기의 왼손 주사위). "?"로 흐리게 기다린다 */
function Die({ value, rolling, pending, small, kept, color }: { value: number; rolling: boolean; pending: boolean; small: boolean; kept: boolean; color: string }) {
  const [fakeFace, setFakeFace] = useState(randomFace);
  const [spin] = useState(() => new Animated.Value(0));
  const [pop] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (pending) return;
    if (!rolling) {
      spin.stopAnimation();
      spin.setValue(0);
      if (kept) {
        pop.setValue(1.25);
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 170, useNativeDriver: NATIVE_DRIVER }).start();
      }
      return;
    }
    const timer = setInterval(() => setFakeFace(randomFace()), FACE_INTERVAL);
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: motion.dice, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start();
    return () => clearInterval(timer);
  }, [rolling, pending, kept, spin, pop]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "540deg"] });
  const settled = !rolling && !pending;
  return (
    <Animated.View
      accessibilityLabel={pending ? "굴릴 차례를 기다리는 주사위" : rolling ? "주사위를 굴리는 중" : `주사위 ${value}`}
      style={[
        styles.die,
        small && styles.dieSmall,
        settled && kept && { backgroundColor: tint(color), borderColor: color },
        { transform: [{ rotate }, { scale: pop }] },
        settled && !kept && styles.discarded,
        pending && styles.discarded,
      ]}
    >
      <Text style={[styles.face, small && styles.faceSmall, { color: rolling || pending ? colors.textDim : color }]}>{pending ? "?" : rolling ? fakeFace : value}</Text>
    </Animated.View>
  );
}

const randomFace = () => 1 + Math.floor(Math.random() * 20);

/** 의미 색(#rrggbb)을 옅은 바탕으로 */
const tint = (hex: string) => `${hex}1f`;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  die: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  dieSmall: { width: 44, height: 44 },
  faceSmall: { fontSize: 20, lineHeight: 24 },
  discarded: { opacity: 0.4 },
  face: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, fontVariant: ["tabular-nums"] },
});
