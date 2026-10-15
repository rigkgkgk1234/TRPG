import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, hairline, motion, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

export interface RowAction {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** 되돌릴 수 없는 일 (버리기) */
  danger?: boolean;
  /** 펼친 상태 (수량 고르기가 열려 있다) */
  selected?: boolean;
}

/**
 * 가방·가게 목록 한 줄: 이름(과 수량) / 성능·상태("|"로 나눈다) / 오른쪽에 작은 버튼들.
 * warn이 있으면 둘째 줄을 경고색으로 (망가짐 등). below는 줄 아래에 펼치는 것 (수량 고르기).
 */
export function ItemRow({ title, meta, warn, price, actions, dim, below }: {
  title: string;
  /** 빈 장비 칸처럼 물건이 없는 줄: 제목을 흐리게 */
  dim?: boolean;
  meta?: string[];
  warn?: string | null;
  /** 오른쪽 위 값 표시 ("은화 25", 평판으로 바뀐 값은 PriceTag) */
  price?: ReactNode;
  actions: RowAction[];
  below?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.body}>
          <View style={styles.head}>
            <Text style={[styles.title, dim && { color: colors.textDim }]}>{title}</Text>
            {price != null ? <Text style={styles.price}>{price}</Text> : null}
          </View>
          {(meta?.length || warn) ? (
            <View style={styles.meta}>
              {/* 칸 사이에 "|"를 넣는다. 줄이 바뀌어도 구분선이 줄 앞에 오지 않게 앞 칸에 붙인다 */}
              {[...(warn ? [warn] : []), ...(meta ?? [])].map((m, i, all) => (
                <Text key={m} style={[styles.metaText, i === 0 && warn ? { color: colors.fail } : null]}>
                  {m}
                  {i < all.length - 1 ? <Text style={styles.metaSep}>{"  |"}</Text> : null}
                </Text>
              ))}
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
              accessibilityState={{ disabled: a.disabled, selected: a.selected }}
              hitSlop={4}
              style={({ pressed }) => [styles.button, a.danger && styles.danger, a.selected && styles.selected, a.disabled && styles.disabled, pressed && styles.pressed]}
            >
              <Text style={[styles.buttonText, a.danger && { color: colors.fail }, a.selected && { color: colors.accentText }]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  body: { flex: 1, gap: 2 },
  head: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  title: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  price: { ...type.label, color: colors.textDim, fontVariant: ["tabular-nums"] },
  meta: { flexDirection: "row", flexWrap: "wrap", columnGap: space.sm },
  metaText: { ...type.caption, color: colors.textFaint },
  metaSep: { color: colors.textFaint },
  actions: { flexDirection: "row", gap: space.xs },
  button: {
    minHeight: 36,
    minWidth: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  danger: { backgroundColor: colors.badBg, borderColor: colors.fail },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  disabled: { opacity: 0.35 },
  pressed: { transform: [{ scale: motion.press }] },
  buttonText: { ...type.label, color: colors.text },
});
