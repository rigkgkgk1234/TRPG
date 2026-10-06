import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Icon } from "@/ui/icons";
import { colors, icon as iconToken, motion, radius, space, TOUCH_MIN, type } from "@/ui/theme";

interface ActionButtonProps {
  label: string;
  icon?: Icon;
  /** 아이콘 색을 바꿀 때 (위험 표시 등) */
  iconColor?: string;
  /** 이름 오른쪽의 짧은 강조 (성공 확률 등) */
  badge?: string;
  /** 두 번째 줄: 비용·보상 또는 잠김 사유. 배열이면 항목 단위로만 줄을 바꾼다 */
  detail?: string | string[];
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
  onPress: () => void;
}

/** 허브·저녁 화면의 큰 버튼. 잠긴 버튼도 사유는 읽을 수 있게 흐리게만 한다. 누르면 살짝 눌린다. */
export function ActionButton({ label, icon: IconC, iconColor, badge, detail, disabled, selected, primary, onPress }: ActionButtonProps) {
  const fg = primary ? colors.accentText : colors.text;
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
        primary && styles.primary,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.labelRow, primary && styles.center]}>
        {IconC && <IconC size={iconToken.md} weight={iconToken.weight} color={iconColor ?? (primary ? fg : selected ? colors.accent : colors.textDim)} />}
        <Text style={[styles.label, { color: fg }]} numberOfLines={2} lineBreakStrategyIOS="hangul-word">{label}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      {Array.isArray(detail) ? (
        <View style={styles.detailRow}>
          {detail.map((d) => <Text key={d} style={[styles.detail, primary && { color: fg }]}>{d}</Text>)}
        </View>
      ) : detail ? (
        <Text style={[styles.detail, primary && { color: fg }]} numberOfLines={2}>{detail}</Text>
      ) : null}
    </Pressable>
  );
}

/** 2열 격자. 자식 수가 홀수여도 마지막 칸이 반 폭을 유지한다. */
export function ButtonGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function GridCell({ children }: { children: React.ReactNode }) {
  return <View style={styles.cell}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: TOUCH_MIN + 12,
    paddingHorizontal: space.md,
    paddingVertical: space.md - 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
    justifyContent: "center",
    gap: space.xs,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent, minHeight: TOUCH_MIN + 4 },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  disabled: { opacity: 0.38 },
  pressed: { transform: [{ scale: motion.press }] },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  center: { justifyContent: "center" },
  label: { ...type.bodyStrong, flexShrink: 1 },
  badge: { ...type.label, marginLeft: "auto", color: colors.accent, fontVariant: ["tabular-nums"] },
  detailRow: { flexDirection: "row", flexWrap: "wrap", columnGap: space.sm },
  detail: { ...type.caption, color: colors.textDim },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "48.5%" },
});
