import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, space, TOUCH_MIN } from "@/ui/theme";

interface ActionButtonProps {
  label: string;
  /** 두 번째 줄: 확률·비용 또는 잠김 사유 */
  detail?: string;
  disabled?: boolean;
  selected?: boolean;
  primary?: boolean;
  onPress: () => void;
}

/** 허브·저녁 화면의 큰 버튼. 잠긴 버튼도 누를 수는 없지만 사유는 읽을 수 있게 흐리게만 한다. */
export function ActionButton({ label, detail, disabled, selected, primary, onPress }: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      accessibilityHint={detail}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, primary && styles.primaryLabel]} numberOfLines={1}>{label}</Text>
      {detail ? <Text style={[styles.detail, primary && styles.primaryDetail]} numberOfLines={1}>{detail}</Text> : null}
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
    minHeight: TOUCH_MIN + 8,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    gap: 2,
  },
  primary: { backgroundColor: colors.accent, borderColor: colors.accent, alignItems: "center" },
  selected: { borderColor: colors.accent },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
  label: { color: colors.text, fontSize: font.md, fontWeight: "600" },
  primaryLabel: { color: colors.accentText, fontSize: font.lg, fontWeight: "700" },
  detail: { color: colors.textDim, fontSize: font.sm },
  primaryDetail: { color: colors.accentText },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cell: { width: "48.5%" },
});
