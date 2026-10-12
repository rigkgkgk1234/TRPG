import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
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
  onPress: () => void;
}

/** 허브·저녁 화면의 큰 버튼. 잠긴 버튼도 사유는 읽을 수 있게 흐리게만 한다. 누르면 살짝 눌린다. */
export function ActionButton({ label, icon: IconC, iconColor, badge, badgeNote, badgeBelow, fill, center, large, detail, disabled, selected, primary, warn, raised, tight, compact, onPress }: ActionButtonProps) {
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
        disabled && styles.disabled,
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

/**
 * 칸 위쪽 경계의 "+" 눈금. 교차점은 늘 격자 가운데 세로줄 위에 있다.
 * - 왼쪽 칸(left 없음): 위 경계의 오른쪽 끝에 가로 팔
 * - 오른쪽 칸(left): 위 경계의 왼쪽 끝에 가로 팔 + 세로 팔(위아래)
 * - 두 칸 폭(split): 위 경계 가운데에 가로 팔 둘 + 세로 팔(위아래). 세 갈래로 만나는 곳도 "+"가 된다
 */
function Lines({ top, left, split }: { top?: boolean; left?: boolean; split?: boolean }) {
  if (!top) return null;
  if (split) {
    return (
      <>
        <View pointerEvents="none" style={[styles.tickH, { right: "50%" }]} />
        <View pointerEvents="none" style={[styles.tickH, { left: "50%" }]} />
        <View pointerEvents="none" style={[styles.tickCross, { left: "50%" }]} />
      </>
    );
  }
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
      {children}
      <Lines top={lineTop} left={lineLeft} />
    </View>
  );
}

/** 버튼을 위아래로 쌓는다: 맞닿는 경계 가운데에 "+". backLast면 마지막("뒤로") 위에는 선을 긋지 않는다 */
export function ButtonStack({ children, backLast }: { children: ReactNode; backLast?: boolean }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((child, i) => (
        <View key={i}>
          {child}
          <Lines top={i > 0 && !(backLast && i === items.length - 1)} split />
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
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", flexDirection: "column" },
  // 교차점의 가로 팔
  tickH: { position: "absolute", top: 0, width: LINE_TICK, height: hairline, backgroundColor: colors.borderStrong },
  // 교차점의 세로 팔: 위 경계를 사이에 두고 위아래로 LINE_TICK씩
  tickCross: { position: "absolute", top: -LINE_TICK, width: hairline, height: LINE_TICK * 2, backgroundColor: colors.borderStrong },
});
