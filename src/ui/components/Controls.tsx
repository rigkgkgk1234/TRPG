import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatSigned } from "@/core/labels";
import { WithNote } from "@/ui/components/RollFormula";
import { colors, motion, radius, space, type } from "@/ui/theme";

export function Chip({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/**
 * 고르기 줄의 한 칸 (숙련·지역·사람). 2열로 너비를 맞춰 줄이 들쭉날쭉하지 않게 한다.
 * 오른쪽에 확률(괄호 안은 작게), 고를 수 없으면 둘째 줄에 사유.
 */
export function PickCell({ label, sub, badge, badgeNote, reason, disabled, wide, onPress }: {
  /** sub: 이름 아래 작은 설명 (고를 수 있을 때), wide: 한 줄을 다 쓴다 (확률처럼 긴 배지가 있을 때) */
  label: string; sub?: string; badge?: string; badgeNote?: string; reason?: string; disabled?: boolean; wide?: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={reason ? `${label}, ${reason}` : label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.pick, wide && styles.pickWide, (disabled || reason) && styles.pickMuted, pressed && styles.pressed]}
    >
      {/* 이름·설명은 왼쪽에 쌓고, 확률은 칸 높이의 가운데에 */}
      <View style={styles.pickRow}>
        <View style={styles.pickText}>
          <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
          {reason || sub ? <Text style={styles.pickReason} numberOfLines={2} lineBreakStrategyIOS="hangul-word">{reason ?? sub}</Text> : null}
        </View>
        {badge ? <WithNote main={badge} note={badgeNote} style={styles.pickBadge} noteStyle={styles.pickNote} /> : null}
      </View>
    </Pressable>
  );
}

export function PickGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.pickGrid}>{children}</View>;
}

export function Stepper({
  label, value, min, max, onChange, signed = false,
}: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; signed?: boolean }) {
  const shown = signed ? formatSigned(value) : String(value);
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.stepper}>
        <StepButton text="−" disabled={value <= min} onPress={() => onChange(value - 1)} />
        <Text style={styles.stepValue}>{shown}</Text>
        <StepButton text="+" disabled={value >= max} onPress={() => onChange(value + 1)} />
      </View>
    </View>
  );
}

function StepButton({ text, disabled, onPress }: { text: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [styles.stepButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.stepButtonText}>{text}</Text>
    </Pressable>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { ...type.label, color: colors.text, fontVariant: ["tabular-nums"] },
  chipTextSelected: { color: colors.accentText },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  pickGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  // 두 칸씩 채우고 남는 폭은 나눠 가진다: 홀수 개면 마지막 칸이 한 줄을 다 쓴다
  pick: {
    flexBasis: "40%",
    flexGrow: 1,
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  pickWide: { flexBasis: "100%", minHeight: 52 },
  pickMuted: { opacity: 0.45 },
  pickRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  pickText: { flexShrink: 1, gap: 2 },
  // 확률은 줄바꿈하지 않는다 (설명이 길면 설명 쪽이 두 줄이 된다)
  pickBadge: { ...type.bodyStrong, color: colors.accent, fontVariant: ["tabular-nums"], flexShrink: 0 },
  pickNote: { fontSize: 12 },
  pickReason: { ...type.caption, color: colors.textDim },
  pressed: { transform: [{ scale: motion.press }] },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { ...type.body, color: colors.text },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonText: { ...type.heading, color: colors.text },
  stepValue: { ...type.number, color: colors.text, minWidth: 32, textAlign: "center" },
  disabled: { opacity: 0.35 },
  section: { gap: space.md },
  sectionHead: { gap: 2 },
  sectionTitle: { ...type.heading, color: colors.text },
  sectionHint: { ...type.caption, color: colors.textFaint },
});
