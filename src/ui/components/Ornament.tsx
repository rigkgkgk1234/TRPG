import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors, hairline } from "@/ui/theme";

/*
 * 판타지 테두리 장식. Kenney Fantasy UI Borders(CC0)의 벡터에서 쓸 조각의 path만 옮겼다.
 * 원본은 2단위가 픽셀 하나인 격자라, 화면 크기는 단위 배율(unit)을 곱해 정한다.
 */

/**
 * 틀 모양. path는 가운데가 0인 -24~24 조각이다.
 * edge: 변(굵기 2)이 조각 가장자리에서 들어온 거리, inner: 안쪽 바탕이 시작하는 거리, notch: 모서리에서 안쪽 바탕을 깎는 거리
 */
const FRAMES = {
  /** panel_border_012: 모서리에 작은 네모 매듭 */
  knot: {
    path: "M-18 24L-18 18-24 18-24 24ZM-20 20L-20 22-22 22-22 20ZM-24-24L-24-18-18-18-18-24ZM-22-20L-22-22-20-22-20-20ZM24 24L24 18 18 18 18 24ZM22 20L22 22 20 22 20 20ZM18-24L18-18 24-18 24-24ZM20-20L20-22 22-22 22-20ZM16-16L16-24-16-24-16-16-24-16-24 16-16 16-16 24 16 24 16 16 24 16 24-16 16-16ZM14-22L14-14 22-14 22 14 14 14 14 22-14 22-14 14-22 14-22-14-14-14-14-22 14-22Z",
    edge: 0, inner: 2, notch: 8,
  },
  /** panel_border_000: 모서리 바깥에 꺾쇠가 붙고 변이 안쪽으로 들어온 틀 */
  tick: {
    path: "M-20 20L-20 24-18 24-18 18-24 18-24 20ZM-24-20L-24-18-18-18-18-24-20-24-20-20ZM24 20L24 18 18 18 18 24 20 24 20 20ZM14-22L14-20-14-20-14-22-16-22-16-16-22-16-22-14-20-14-20 14-22 14-22 16-16 16-16 22-14 22-14 20 14 20 14 22 16 22 16 16 22 16 22 14 20 14 20-14 22-14 22-16 16-16 16-22ZM14-14L18-14 18 14 14 14 14 18-14 18-14 14-18 14-18-14-14-14-14-18 14-18ZM20-20L20-24 18-24 18-18 24-18 24-20Z",
    edge: 4, inner: 6, notch: 10,
  },
} as const;

export type FrameShape = keyof typeof FRAMES;

/** 두 줄 선의 오른쪽 끝 모양. 두 줄 선이 y -3~-1, 1~3을 지나 x 22에서 시작한다 (원본은 -48부터) */
const RULE_ENDS = {
  /** divider_005: 매듭 */
  knot: "M42 1L42 7 40 7 40 3 36 3 36 1 28 1 28 3 26 3 26 1 22 1 22 3 24 3 24 5 30 5 30 3 34 3 34 5 38 5 38 9 44 9 44 3 48 3 48 1ZM24-5L24-3 22-3 22-1 26-1 26-3 28-3 28-1 36-1 36-3 40-3 40-7 42-7 42-1 48-1 48-3 44-3 44-9 38-9 38-5 34-5 34-3 30-3 30-5Z",
  /** divider_002: 짧은 세로 막대로 닫는다 */
  bar: "M48 5L48 1 22 1 22 3 46 3 46 5ZM46-5L46-3 22-3 22-1 48-1 48-5Z",
} as const;

export type RuleEnd = keyof typeof RULE_ENDS;

/** 가운데가 빈 작은 네모 매듭 (틀 모서리의 매듭과 같은 모양, 0~6) */
const KNOT_PATH = "M0 0H6V6H0ZM2 2V4H4V2Z";

export type Corner = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

/** 모서리 장식 하나: 틀 조각에서 그 모서리만 잘라 보인다. arm: 모서리에서 뻗는 선의 길이(원본 단위) */
export function OrnamentCorner({ corner, shape = "knot", unit = 1, arm = 18, color = colors.accent, style }: { corner: Corner; shape?: FrameShape; unit?: number; arm?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const x = corner === "topLeft" || corner === "bottomLeft" ? -24 : 24 - arm;
  const y = corner === "topLeft" || corner === "topRight" ? -24 : 24 - arm;
  const size = arm * unit;
  return (
    <Svg pointerEvents="none" width={size} height={size} viewBox={`${x} ${y} ${arm} ${arm}`} style={style}>
      <Path d={FRAMES[shape].path} fill={color} />
    </Svg>
  );
}

/** 두 줄 선 (divider와 같은 간격) */
export function OrnamentRule({ unit = 0.75, color = colors.borderStrong, style }: { unit?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const line = { height: 2 * unit, backgroundColor: color };
  return (
    <View pointerEvents="none" style={[{ gap: 2 * unit, paddingVertical: 1 }, style]}>
      <View style={line} />
      <View style={line} />
    </View>
  );
}

/**
 * 네 모서리에 장식이 붙은 틀. fill이 있으면 틀 안쪽을 칠하므로 감싼 내용보다 먼저(맨 앞 자식으로) 둔다.
 * 모서리는 조각을 잘라 쓰고, 그 사이 변은 같은 굵기의 선으로 잇는다.
 */
export function OrnamentFrame({ shape = "knot", unit = 0.75, arm = 16, color = colors.accent, fill, inset = 0 }: { shape?: FrameShape; unit?: number; arm?: number; color?: string; fill?: string; inset?: number }) {
  const f = FRAMES[shape];
  const t = 2 * unit;
  const a = arm * unit;
  const e = f.edge * unit;
  const i = f.inner * unit;
  const n = f.notch * unit;
  const corner = (c: Corner, pos: ViewStyle) => <OrnamentCorner corner={c} shape={shape} unit={unit} arm={arm} color={color} style={[styles.abs, pos]} />;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { margin: -inset }]}>
      {/* 모서리 홈 바깥은 칠하지 않게 가운데 띠와 좌우 띠 셋으로 나눠 칠한다 (겹치지 않아 반투명 색도 고르다) */}
      {fill && (
        <>
          <View style={[styles.abs, { top: i, bottom: i, left: n, right: n, backgroundColor: fill }]} />
          <View style={[styles.abs, { top: n, bottom: n, left: i, width: n - i, backgroundColor: fill }]} />
          <View style={[styles.abs, { top: n, bottom: n, right: i, width: n - i, backgroundColor: fill }]} />
        </>
      )}
      {corner("topLeft", { top: 0, left: 0 })}
      {corner("topRight", { top: 0, right: 0 })}
      {corner("bottomLeft", { bottom: 0, left: 0 })}
      {corner("bottomRight", { bottom: 0, right: 0 })}
      <View style={[styles.abs, { top: e, left: a, right: a, height: t, backgroundColor: color }]} />
      <View style={[styles.abs, { bottom: e, left: a, right: a, height: t, backgroundColor: color }]} />
      <View style={[styles.abs, { left: e, top: a, bottom: a, width: t, backgroundColor: color }]} />
      <View style={[styles.abs, { right: e, top: a, bottom: a, width: t, backgroundColor: color }]} />
    </View>
  );
}

/** 두 줄 선 끝에 장식(end)이 달린 선. 장식은 오른쪽, flip이면 왼쪽 */
export function KnotRule({ end = "knot", unit = 0.75, color = colors.borderStrong, flip = false, style }: { end?: RuleEnd; unit?: number; color?: string; flip?: boolean; style?: StyleProp<ViewStyle> }) {
  // 늘어나는 두 줄도 끝 장식과 같은 SVG로 그려야 이어지는 곳의 굵기·밝기가 같다
  return (
    <View pointerEvents="none" style={[styles.knotRule, flip && styles.reverse, style]}>
      <Svg height={18 * unit} style={styles.grow}>
        <Rect x="0" y={6 * unit} width="100%" height={2 * unit} fill={color} />
        <Rect x="0" y={10 * unit} width="100%" height={2 * unit} fill={color} />
      </Svg>
      <Svg width={Math.round(26 * unit)} height={18 * unit} viewBox="22 -9 26 18" preserveAspectRatio="none" style={flip ? [styles.mirror, styles.overlapRight] : styles.overlapLeft}>
        <Path d={RULE_ENDS[end]} fill={color} />
      </Svg>
    </View>
  );
}

/** 글 양옆으로 장식 선이 뻗는 제목 줄 (장식이 글 쪽을 향한다) */
export function OrnamentTitle({ children, end, unit, color, style }: { children: ReactNode; end?: RuleEnd; unit?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.titleRow, style]}>
      <KnotRule end={end} unit={unit} color={color} style={styles.grow} />
      {children}
      <KnotRule end={end} unit={unit} color={color} flip style={styles.grow} />
    </View>
  );
}

/** 가운데 작은 매듭이 있는 가는 선 */
export function KnotDivider({ unit = 1, color = colors.borderFaint, style }: { unit?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View pointerEvents="none" style={[styles.knotRow, style]}>
      <View style={[styles.line, { backgroundColor: color }]} />
      <Svg width={6 * unit} height={6 * unit} viewBox="0 0 6 6">
        <Path d={KNOT_PATH} fill={color} fillRule="evenodd" />
      </Svg>
      <View style={[styles.line, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  grow: { flex: 1 },
  knotRule: { flexDirection: "row", alignItems: "center" },
  reverse: { flexDirection: "row-reverse" },
  mirror: { transform: [{ scaleX: -1 }] },
  // 끝 장식을 늘어나는 선 위로 1 겹쳐 이음매에 금이 보이지 않게 한다
  overlapLeft: { marginLeft: -1 },
  overlapRight: { marginRight: -1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  knotRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  line: { flex: 1, height: hairline },
});
