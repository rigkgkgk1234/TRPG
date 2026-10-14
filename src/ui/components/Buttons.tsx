import { Children, cloneElement, isValidElement, useId, useState, type ReactElement, type ReactNode } from "react";
import { Image, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg";
import type { Icon } from "@/ui/icons";
import { WithNote } from "@/ui/components/RollFormula";
import { colors, hairline, icon as iconToken, motion, radius, space, TOUCH_MIN, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

interface ActionButtonProps {
  label: string;
  icon?: Icon;
  /** 아이콘 색을 바꿀 때 (위험 표시 등) */
  iconColor?: string;
  /** 이름 오른쪽의 짧은 강조 (성공 확률 등) */
  badge?: string;
  /** 배지 뒤 괄호 안에 작게 붙는 설명 ("D20 / 7↑") */
  badgeNote?: string;
  /** 좁은 칸(2열 격자)에서는 배지를 이름 아래 줄에 둔다 */
  badgeBelow?: boolean;
  /** 격자 칸을 꽉 채운다 (같은 줄의 버튼끼리 높이가 같아지게) */
  fill?: boolean;
  /** 글자를 가운데로 (가운데 정렬인 주 버튼과 나란히 둘 때) */
  center?: boolean;
  /** 설명 줄 없이 이름만 둘 때: 아이콘·이름을 키우고 칸의 세로 가운데에 둔다 */
  large?: boolean;
  /** 두 번째 줄: 비용·보상 또는 잠김 사유. 배열이면 항목 단위로만 줄을 바꾼다 */
  detail?: string | string[];
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
  /** 위아래 여백을 줄인다 (고르기 패널 선택지) */
  tight?: boolean;
  /** 낮은 버튼: 위아래 여백을 줄이고 최소 높이를 터치 최소치로 (고르기 패널의 "뒤로") */
  compact?: boolean;
  /** 주황으로 칠한다: 놓치면 손해인 행동 (식량이 모자랄 때 사기) */
  warn?: boolean;
  /** 눌렀을 때의 밝은 바탕을 늘 깔아 둔다 (고르기 패널의 "뒤로") */
  raised?: boolean;
  /** 오른쪽 아래 구석의 작은 글씨 (들어가는 조건) */
  cornerNote?: string;
  onPress: () => void;
}

/** 허브·저녁 화면의 큰 버튼. 잠긴 버튼도 사유는 읽을 수 있게 흐리게만 한다. 누르면 살짝 눌린다. */
export function ActionButton({ label, icon: IconC, iconColor, badge, badgeNote, badgeBelow, fill, center, large, detail, disabled, selected, primary, warn, raised, cornerNote, tight, compact, onPress }: ActionButtonProps) {
  const filled = primary || warn;
  const fg = primary ? colors.accentText : warn ? colors.partialText : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      accessibilityHint={Array.isArray(detail) ? detail.join(", ") : detail}
      style={({ pressed }) => [
        styles.button,
        fill && styles.fill,
        fill && (primary || center || large) && styles.fillCenter,
        primary && styles.primary,
        (tight || compact) && styles.tight,
        compact && styles.compact,
        warn && styles.warn,
        raised && styles.raised,
        selected && styles.selected,
        disabled && (filled ? styles.disabledFilled : styles.disabled),
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.sideRow}>
        <View style={styles.main}>
          <View style={[styles.labelRow, (primary || center) && styles.center]}>
            {IconC && <IconC size={large ? iconToken.md + 2 : iconToken.md} weight={iconToken.weight} color={iconColor ?? (filled ? fg : selected ? colors.accent : colors.textDim)} />}
            <Text style={[styles.label, large && styles.labelLarge, { color: fg }]} numberOfLines={2}>{label}</Text>
          </View>
          {badge && badgeBelow ? <WithNote main={badge} note={badgeNote} style={styles.badge} noteStyle={styles.badgeNote} /> : null}
          {Array.isArray(detail) ? (
            <View style={styles.detailRow}>
              {detail.map((d) => <Text key={d} style={[styles.detail, filled && { color: fg }]}>{d}</Text>)}
            </View>
          ) : detail ? (
            <Text style={[styles.detail, filled && { color: fg }]} numberOfLines={2}>{detail}</Text>
          ) : null}
        </View>
        {/* 넓은 버튼의 확률은 오른쪽에, 이름·설명 줄 전체의 세로 가운데에 */}
        {badge && !badgeBelow ? <WithNote main={badge} note={badgeNote} style={styles.badgeSide} noteStyle={styles.badgeSideNote} /> : null}
      </View>
      {cornerNote ? <Text style={[styles.cornerNote, filled && { color: fg }]} numberOfLines={1}>{cornerNote}</Text> : null}
    </Pressable>
  );
}

type CellProps = { minHeight?: number; lineTop?: boolean; lineLeft?: boolean; children: ReactNode };

/**
 * 2열 격자. 버튼에는 상자가 없고, 칸끼리 맞닿는 경계에만 가는 선을 긋는다 (네 칸이면 가운데 "+").
 * 선은 안쪽 교차점에만 "+"로 긋고 가장자리와 경계 가운데는 비운다. 모든 칸은 반 폭이다: 홀수 개면 마지막 줄 오른쪽이 빈 칸으로 남고, 선은 그 칸에도 긋는다.
 * 배열 자식은 펼쳐서 센다.
 */
export function ButtonGrid({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  // 홀수 개면 마지막 줄 오른쪽에 빈 칸을 하나 두어 경계선("+")은 다른 줄과 똑같이 긋는다
  if (items.length % 2 === 1) items.push(<GridCell key="__empty">{null}</GridCell>);
  const cells = items.map((child, i) =>
    isValidElement(child) ? cloneElement(child as ReactElement<CellProps>, { lineTop: i >= 2, lineLeft: i % 2 === 1 }) : child);
  return <View style={styles.grid}>{cells}</View>;
}

/** "+" 눈금 팔 길이: 선은 격자 안쪽의 교차점에만 "+"로 긋고, 나머지 경계와 가장자리는 비워 둔다 */
const LINE_TICK = 11;
/** 선에서 이만큼은 버튼 바탕(누름·고름·뒤로)이 들어오지 않게 칸 안쪽을 비운다 */
const LINE_CLEAR = 5;

/**
 * 칸 위쪽 경계의 "+" 눈금. 교차점은 늘 격자 가운데 세로줄 위에 있다.
 * - 왼쪽 칸(left 없음): 위 경계의 오른쪽 끝에 가로 팔
 * - 오른쪽 칸(left): 위 경계의 왼쪽 끝에 가로 팔 + 세로 팔(위아래)
 */
function Lines({ top, left }: { top?: boolean; left?: boolean }) {
  if (!top) return null;
  return left ? (
    <>
      <View pointerEvents="none" style={[styles.tickH, { left: 0 }]} />
      <View pointerEvents="none" style={[styles.tickCross, { left: 0 }]} />
    </>
  ) : (
    <View pointerEvents="none" style={[styles.tickH, { right: 0 }]} />
  );
}

/** 격자 한 칸 (반 폭). minHeight: 칸의 최소 높이 (fill 버튼이 그만큼 커진다). 선은 ButtonGrid가 정한다 */
export function GridCell({ minHeight, lineTop, lineLeft, children }: CellProps) {
  return (
    <View style={[styles.cell, minHeight !== undefined && { minHeight }]}>
      {children != null && <EdgeGlow />}
      {children}
      <Lines top={lineTop} left={lineLeft} />
    </View>
  );
}

/** 빛은 버튼 칸보다 GLOW_BEYOND만큼 넓게 그려 행동 칸 바탕까지 번지게 한다 */
const GLOW_BEYOND = 13;
/** 버튼 가장자리에서 GLOW_AT만큼 들어온 곳부터 가운데까지 같은 밝기로 채우고, 거기서 바깥으로 GLOW_OUT만큼 가며 사라진다 (버튼 밖 GLOW_BEYOND까지) */
const GLOW_AT = 10;
const GLOW_OUT = GLOW_AT + GLOW_BEYOND;
/** 가장 밝은 곳의 불투명도 */
const GLOW_OPACITY = 0.2;

/** 그림 가장자리에서 가운데까지 거리(m) 위의 그라디언트 멈춤점 [비율, 불투명도] */
function glowStops(m: number): [number, number][] {
  const at = Math.min(GLOW_BEYOND + GLOW_AT, m / 2);
  const out = Math.max(0, at - GLOW_OUT);
  // 직선으로 올리면 시작과 끝에서 밝기가 꺾여 줄이 보이므로 S자 곡선(smoothstep)을 여러 점으로 나눠 그린다
  const ramp = Array.from({ length: GLOW_STEPS + 1 }, (_, k): [number, number] => {
    const t = k / GLOW_STEPS;
    return [(out + (at - out) * t) / m, GLOW_OPACITY * t * t * (3 - 2 * t)];
  });
  return [[0, 0], ...ramp, [1, GLOW_OPACITY]];
}

/** S자 곡선을 나누는 점 수 */
const GLOW_STEPS = 8;

/**
 * 디더링 점 무늬: 밝게 하는 점과 어둡게 하는 점이 평균 0이 되게 섞인 아주 옅은 무늬.
 * 빛과 바탕의 차이가 화면 밝기 몇 단계뿐이라 그라디언트가 계단(네모난 줄)으로 보이는 것을 흩뜨린다.
 */
const NOISE = require("../../../assets/textures/noise.png");

/**
 * 버튼 바탕 아래에 까는 옅은 빛. 안쪽은 고르게 채우고 가장자리 쪽만 바깥으로 흐려진다.
 * 칸을 모서리에서 가운데로 나눈 네 조각(위·아래는 사다리꼴, 좌우는 삼각형)에 변마다 그라디언트를 하나씩 칠해 겹치지 않게 한다.
 */
function EdgeGlow() {
  const id = `glow${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (!size || size.w !== w || size.h !== h) setSize({ w, h });
  };
  const sides = size ? glowSides(size.w, size.h) : [];
  return (
    <View pointerEvents="none" style={styles.glow} onLayout={onLayout}>
      {size && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            {sides.map((sd) => (
              <LinearGradient key={sd.key} id={`${id}${sd.key}`} gradientUnits="userSpaceOnUse" x1={sd.from[0]} y1={sd.from[1]} x2={sd.to[0]} y2={sd.to[1]}>
                {glowStops(sd.m).map(([at, a], k) => <Stop key={k} offset={at} stopColor={colors.edgeGlow} stopOpacity={a} />)}
              </LinearGradient>
            ))}
          </Defs>
          {sides.map((sd) => <Polygon key={sd.key} points={sd.points} fill={`url(#${id}${sd.key})`} />)}
        </Svg>
      )}
      {size && <Image source={NOISE} resizeMode="repeat" style={StyleSheet.absoluteFill} />}
    </View>
  );
}

/** 네 조각: 꼭짓점과 그라디언트 방향(변 → 가운데). 짧은 쪽 절반(m)까지 번진다 */
function glowSides(w: number, h: number) {
  const m = Math.min(w, h) / 2;
  const p = (...xy: number[][]) => xy.map(([x, y]) => `${x},${y}`).join(" ");
  return [
    { key: "t", m, points: p([0, 0], [w, 0], [w - m, m], [m, m]), from: [0, 0], to: [0, m] },
    { key: "b", m, points: p([0, h], [w, h], [w - m, h - m], [m, h - m]), from: [0, h], to: [0, h - m] },
    { key: "l", m, points: p([0, 0], [m, m], [m, h - m], [0, h]), from: [0, 0], to: [m, 0] },
    { key: "r", m, points: p([w, 0], [w - m, m], [w - m, h - m], [w, h]), from: [w, 0], to: [w - m, 0] },
  ];
}

/**
 * 버튼을 위아래로 쌓는다. 한 줄을 다 쓰는 긴 버튼이라 "+"는 긋지 않는다.
 * divided: 버튼 사이에 가로선을 긋는다 (이벤트 선택지). 고르기 패널의 "뒤로" 위에는 긋지 않는다.
 */
export function ButtonStack({ children, divided }: { children: ReactNode; divided?: boolean }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, i) => (
        <View key={i} style={styles.stackItem}>
          {child}
          {/* 선은 눌린 버튼의 폭만큼만: 양쪽 LINE_CLEAR 안쪽을 눌림 비율(motion.press)로 한 번 더 줄인다 */}
          {divided && i > 0 ? <View pointerEvents="none" style={styles.divider} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_MIN + 12,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
    borderRadius: radius.md,
    backgroundColor: "transparent",
    justifyContent: "center",
    gap: space.xs,
  },
  fill: { flexGrow: 1, justifyContent: "flex-start" },
  fillCenter: { justifyContent: "center" },
  primary: { backgroundColor: colors.accent, minHeight: TOUCH_MIN + 4 },
  warn: { backgroundColor: colors.partial },
  raised: { backgroundColor: colors.surfaceRaised },
  selected: { backgroundColor: colors.accentSoft },
  tight: { paddingVertical: space.sm },
  compact: { minHeight: TOUCH_MIN },
  disabled: { opacity: 0.38 },
  // 칠한 버튼(들어간다 등)은 잠겨도 안의 글씨(조건)를 읽을 수 있게 덜 흐린다
  disabledFilled: { opacity: 0.6 },
  pressed: { transform: [{ scale: motion.press }], backgroundColor: colors.surfaceRaised },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  center: { justifyContent: "center" },
  label: { ...type.bodyStrong, flexShrink: 1 },
  labelLarge: { fontSize: 17, lineHeight: 24 },
  sideRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  main: { flex: 1, gap: space.xs },
  badge: { ...type.label, color: colors.accent, fontVariant: ["tabular-nums"] },
  // 훈련 창의 확률과 같은 크기: 큰 글씨 16, 괄호 12
  badgeSide: { ...type.bodyStrong, color: colors.accent, fontVariant: ["tabular-nums"] },
  badgeSideNote: { fontSize: 12 },
  badgeNote: { fontSize: 11 },
  detailRow: { flexDirection: "row", flexWrap: "wrap", columnGap: space.sm },
  detail: { ...type.caption, color: colors.textDim },
  cornerNote: { ...type.caption, fontSize: 12, lineHeight: 16, color: colors.textDim, position: "absolute", right: space.md, bottom: space.xs },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", flexDirection: "column", padding: LINE_CLEAR },
  // 선을 비워 둔 만큼(LINE_CLEAR) 들어와서 버튼이 차지하는 자리에만 깐다
  // 버튼 자리(LINE_CLEAR 안쪽)보다 GLOW_BEYOND만큼 넓게 깔아 흐려지는 끝이 칸 밖 바탕까지 이어진다
  glow: { position: "absolute", top: LINE_CLEAR - GLOW_BEYOND, right: LINE_CLEAR - GLOW_BEYOND, bottom: LINE_CLEAR - GLOW_BEYOND, left: LINE_CLEAR - GLOW_BEYOND },
  stackItem: { padding: LINE_CLEAR },
  divider: { position: "absolute", top: 0, left: LINE_CLEAR, right: LINE_CLEAR, height: hairline, backgroundColor: colors.borderStrong, transform: [{ scaleX: motion.press }] },
  // 교차점의 가로 팔
  tickH: { position: "absolute", top: 0, width: LINE_TICK, height: hairline, backgroundColor: colors.borderStrong },
  // 교차점의 세로 팔: 위 경계를 사이에 두고 위아래로 LINE_TICK씩
  tickCross: { position: "absolute", top: -LINE_TICK, width: hairline, height: LINE_TICK * 2, backgroundColor: colors.borderStrong },
});
