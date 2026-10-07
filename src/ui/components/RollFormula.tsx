import { StyleSheet, Text, type TextStyle } from "react-native";
import type { CheckResult } from "@/core/types";
import { rollFormula, rollTerms } from "@/ui/rollText";

/**
 * 굴림 계산식: 9(D20) + 1(근력) + 2(농사) = 12
 * 괄호 안 설명은 숫자보다 작고 흐리게 그린다. style은 숫자 쪽 글자 모양.
 */
export function RollFormula({ r, style, noteStyle, totalStyle }: { r: CheckResult; style: TextStyle; noteStyle?: TextStyle; totalStyle?: TextStyle }) {
  return (
    <Text style={style} accessibilityLabel={rollFormula(r)}>
      {rollTerms(r).map((t, i) => (
        <Text key={i}>
          {t.sign ? ` ${t.sign} ` : ""}
          {t.value}
          <Text style={[styles.note, noteStyle]}>({t.label})</Text>
        </Text>
      ))}
      {" = "}
      <Text style={totalStyle}>{r.total}</Text>
    </Text>
  );
}

/** 큰 글씨 뒤에 작은 괄호 설명: 70%(D20 / 7↑), 목표 10(2 넘김) */
export function WithNote({ main, note, style, noteStyle }: { main: string; note?: string; style: TextStyle; noteStyle?: TextStyle }) {
  return (
    <Text style={style}>
      {main}
      {note ? <Text style={[styles.note, noteStyle]}>({note})</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, lineHeight: 16 },
});
