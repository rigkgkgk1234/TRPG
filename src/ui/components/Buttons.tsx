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
  /** 주황으로 칠한다: 놓치면 손해인 행동 (식량이 모자랄 때 사기) */
  warn?: boolean;
  onPress: () => void;
}

/** 허브·저녁 화면의 큰 버튼. 잠긴 버튼도 사유는 읽을 수 있게 흐리게만 한다. 누르면 살짝 눌린다. */
export function ActionButton({ label, icon: IconC, iconColor, badge, badgeNote, badgeBelow, fill, center, large, detail, disabled, selected, primary, warn, onPress }: ActionButtonProps) {
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
        warn && styles.warn,
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

/** 2열 격자. 자식 수가 홀수여도 마지막 칸이 반 폭을 유지한다. */
export function ButtonGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** full: 한 줄을 다 쓰는 칸 (홀수 개의 마지막 칸) */
export function GridCell({ full, children }: { full?: boolean; children: React.ReactNode }) {
  return <View style={[styles.cell, full && styles.cellFull]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_MIN + 12,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
    borderRadius: radius.md,
    backgroundColor: "transparent",
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    justifyContent: "center",
    gap: space.xs,
  },
  fill: { flexGrow: 1, justifyContent: "flex-start" },
  fillCenter: { justifyContent: "center" },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent, minHeight: TOUCH_MIN + 4 },
  warn: { backgroundColor: colors.partial, borderColor: colors.partial },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
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
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "48.5%", flexDirection: "column" },
  cellFull: { width: "100%" },
});
