import { StyleSheet } from "react-native";
import { colors } from "@/ui/theme";
import { Text } from "@/ui/Text";

/**
 * 가게 값 표시. 평판 보정(과 직업 할인)으로 값이 바뀌었으면 원래 값에 줄을 긋고 흐리게 둔 뒤 "→ 바뀐 값"을 잇는다.
 * 올랐으면 빨강, 내렸으면 초록. 바뀌지 않았으면 값만 쓴다.
 */
export function PriceTag({ base, price, prefix = "은화 " }: { base: number; price: number; prefix?: string }) {
  if (base === price) return <Text style={styles.text}>{prefix}{price}</Text>;
  return (
    <Text style={styles.text}>
      {prefix}
      <Text style={styles.old}>{base}</Text>
      {" → "}
      <Text style={{ color: price > base ? colors.fail : colors.success }}>{price}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  text: { fontVariant: ["tabular-nums"] },
  old: { color: colors.textFaint, textDecorationLine: "line-through" },
});
