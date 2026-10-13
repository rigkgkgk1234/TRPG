import { useEffect, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import type { CheckResult } from "@/core/types";
import { OUTCOME_COLOR } from "@/ui/turnSummary";
import { colors, fonts, motion } from "@/ui/theme";
import { Text } from "@/ui/Text";

/** 웹에는 네이티브 애니메이션 모듈이 없어 경고가 난다 */
export const NATIVE_DRIVER = Platform.OS !== "web";

const FACE_INTERVAL = 60;

/**
 * D20 주사위: 정이십면체를 정면에서 본 모양(육각형 테두리 안에 앞면 삼각형과 둘레 아홉 면). rolling 동안 가짜 눈을 돌리며 흔들리고, 멈추면 실제 눈으로 튀어 오른다.
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
  const lit = settled && kept;
  const size = small ? DIE_SMALL : DIE;
  return (
    <Animated.View
      accessibilityLabel={pending ? "굴릴 차례를 기다리는 주사위" : rolling ? "주사위를 굴리는 중" : `주사위 ${value}`}
      style={[
        { width: size, height: size },
        { transform: [{ rotate }, { scale: pop }] },
        settled && !kept && styles.discarded,
        pending && styles.discarded,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        {/* 둘레 여섯 면은 어둡게, 앞면과 맞닿은 세 면은 조금 밝게, 앞면은 결과 색으로 칠해 입체로 보이게 한다 */}
        {RIM_FACES.map((f, i) => <Polygon key={`r${i}`} points={f} fill={colors.surface} stroke={lit ? color : colors.borderStrong} strokeWidth={EDGE} strokeLinejoin="round" />)}
        {SIDE_FACES.map((f, i) => <Polygon key={`s${i}`} points={f} fill={colors.surfaceRaised} stroke={lit ? color : colors.borderStrong} strokeWidth={EDGE} strokeLinejoin="round" />)}
        <Polygon points={FRONT_FACE} fill={lit ? tint(color) : colors.surfaceRaised} stroke={lit ? color : colors.borderStrong} strokeWidth={EDGE} strokeLinejoin="round" />
      </Svg>
      {/* 숫자는 앞면 삼각형의 무게중심에 맞춘다 */}
      <View style={[StyleSheet.absoluteFill, styles.faceBox, { paddingTop: size * FACE_DROP }]}>
        <Text style={[styles.face, small && styles.faceSmall, { color: rolling || pending ? colors.textDim : color }]}>{pending ? "?" : rolling ? fakeFace : value}</Text>
      </View>
    </Animated.View>
  );
}

/** 주사위 한 변 길이 (보통·작게) */
const DIE = 76;
const DIE_SMALL = 52;
/** 모서리 선 굵기 (viewBox 100 기준) */
const EDGE = 1.5;

/*
 * 정이십면체를 꼭짓점 쪽에서 본 모양 (viewBox 0~100): 꼭짓점이 위를 향한 육각형 테두리와 가운데 앞면 삼각형.
 * 앞면 꼭짓점 하나가 육각형 꼭짓점 세 개와 이어져 앞면 둘레에 면 아홉 개가 생긴다.
 */
const HEX = { top: [50, 3], ur: [91, 26.5], lr: [91, 73.5], bottom: [50, 97], ll: [9, 73.5], ul: [9, 26.5] } as const;
const TRI = { top: [50, 20], bl: [21, 70], br: [79, 70] } as const;
const pts = (...ps: readonly (readonly [number, number])[]) => ps.map(([x, y]) => `${x},${y}`).join(" ");
const FRONT_FACE = pts(TRI.top, TRI.br, TRI.bl);
const SIDE_FACES = [pts(TRI.top, HEX.ul, TRI.bl), pts(TRI.top, TRI.br, HEX.ur), pts(TRI.bl, TRI.br, HEX.bottom)];
const RIM_FACES = [
  pts(HEX.top, TRI.top, HEX.ul), pts(HEX.top, HEX.ur, TRI.top),
  pts(HEX.ul, TRI.bl, HEX.ll), pts(HEX.ll, TRI.bl, HEX.bottom),
  pts(HEX.ur, HEX.lr, TRI.br), pts(HEX.lr, HEX.bottom, TRI.br),
];
/** 앞면 무게중심이 가운데(50)보다 아래로 내려간 만큼 (비율) */
const FACE_DROP = ((TRI.top[1] + TRI.bl[1] + TRI.br[1]) / 3 - 50) / 100 * 2;

const randomFace = () => 1 + Math.floor(Math.random() * 20);

/** 의미 색(#rrggbb)을 옅은 바탕으로 */
const tint = (hex: string) => `${hex}1f`;

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 8 },
  faceBox: { alignItems: "center", justifyContent: "center" },
  faceSmall: { fontSize: 14, lineHeight: 18 },
  discarded: { opacity: 0.4 },
  face: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 24, fontVariant: ["tabular-nums"] },
});
