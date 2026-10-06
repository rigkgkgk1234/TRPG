import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatSigned } from "@/core/labels";
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
