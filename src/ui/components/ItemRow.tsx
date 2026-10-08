import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, motion, radius, space, type } from "@/ui/theme";

export interface RowAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 되돌릴 수 없는 일 (버리기) */
  danger?: boolean;
}

/**
 * 가방·가게 목록 한 줄: 이름(과 수량) / 성능·상태 / 오른쪽에 작은 버튼들.
 * warn이 있으면 둘째 줄을 경고색으로 (망가짐 등).
 */
export function ItemRow({ title, meta, warn, price, actions, dim }: {
  title: string;
  /** 빈 장비 칸처럼 물건이 없는 줄: 제목을 흐리게 */
  dim?: boolean;
  meta?: string[];
  warn?: string | null;
  /** 오른쪽 위 값 표시 ("은화 25") */
  price?: string;
  actions: RowAction[];
}) {
  return (
    <View style={styles.row}>
      <View style={styles.body}>
        <View style={styles.head}>
          <Text style={[styles.title, dim && { color: colors.textDim }]}>{title}</Text>
          {price ? <Text style={styles.price}>{price}</Text> : null}
        </View>
        {(meta?.length || warn) ? (
          <View style={styles.meta}>
            {warn ? <Text style={[styles.metaText, { color: colors.fail }]}>{warn}</Text> : null}
            {meta?.map((m) => <Text key={m} style={styles.metaText}>{m}</Text>)}
          </View>
        ) : null}
      </View>
      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.onPress}
            disabled={a.disabled}
            accessibilityRole="button"
            accessibilityLabel={`${title} ${a.label}`}
            accessibilityState={{ disabled: a.disabled }}
            hitSlop={4}
            style={({ pressed }) => [styles.button, a.danger && styles.danger, a.disabled && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={[styles.buttonText, a.danger && { color: colors.fail }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  body: { flex: 1, gap: 2 },
  head: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  title: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  price: { ...type.label, color: colors.textDim, fontVariant: ["tabular-nums"] },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: space.sm },
  metaText: { ...type.caption, color: colors.textFaint },
  actions: { flexDirection: "row", gap: space.xs },
  button: {
    minHeight: 36,
    minWidth: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  danger: { backgroundColor: colors.badBg },
  disabled: { opacity: 0.35 },
  pressed: { transform: [{ scale: motion.press }] },
  buttonText: { ...type.label, color: colors.text },
});
