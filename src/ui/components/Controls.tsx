import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatSigned } from "@/core/labels";
import { colors, font, radius, space } from "@/ui/theme";

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
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
      style={[styles.stepButton, disabled && styles.disabled]}
    >
      <Text style={styles.stepButtonText}>{text}</Text>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: font.sm },
  chipTextSelected: { color: colors.accentText, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: colors.text, fontSize: font.md },
  stepper: { flexDirection: "row", alignItems: "center", gap: space.md },
  stepButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  stepButtonText: { color: colors.text, fontSize: font.lg },
  stepValue: { color: colors.text, fontSize: font.lg, minWidth: 32, textAlign: "center", fontVariant: ["tabular-nums"] },
  disabled: { opacity: 0.3 },
  section: { gap: space.sm },
  sectionTitle: { color: colors.textDim, fontSize: font.sm },
});
