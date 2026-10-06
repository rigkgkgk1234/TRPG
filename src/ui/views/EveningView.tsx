import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FeedOrder } from "@/core/commands";
import { FOOD_PER_DAY, previewEvening } from "@/core/day/evening";
import { FOOD_PRICE, type RunState } from "@/core/types";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { Chip, ChipRow } from "@/ui/components/Controls";
import { FeedLog } from "@/ui/components/FeedLog";
import { colors, font, radius, space } from "@/ui/theme";

/** 저녁: 정산을 미리 알려 주고, 모자란 식량을 사거나 먹일 순서를 정한 뒤 잠자리에 든다. */
export function EveningView({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const log = useGame((s) => s.log);
  const [order, setOrder] = useState<FeedOrder>("selfFirst");

  const p = previewEvening(run);
  const { food, silver } = run.resources;
  const shortBy = Math.max(0, FOOD_PER_DAY - food);
  const canBuy = Math.min(shortBy, Math.floor(silver / FOOD_PRICE));

  const notes: { text: string; tone: "warn" | "bad" | "info" }[] = [];
  if (run.time.collapsedToday) notes.push({ text: "탈진했다. 오늘 밤은 피로가 6까지만 풀리고, 내일 오전은 누워 있어야 한다.", tone: "warn" });
  if (p.foodShort) notes.push({ text: `식량이 ${shortBy} 모자란다. 누군가는 굶는다.`, tone: "warn" });
  if (p.taxDue) {
    notes.push(p.taxShort
      ? { text: `오늘은 세금날(은화 ${p.taxDue}). 은화가 모자라 빚과 평판 손실이 생긴다.`, tone: "bad" }
      : { text: `오늘은 세금날(은화 ${p.taxDue})이다.`, tone: "info" });
  }
  if (p.debtEnding) notes.push({ text: "빚이 너무 많다. 이대로 세금날을 맞으면 끝이다.", tone: "bad" });
  if (p.lastDay) notes.push({ text: "서른 번째 밤이다.", tone: "info" });

  return (
    <View style={styles.root}>
      <FeedLog log={log} empty="" />

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
        <Text style={styles.title}>{run.time.day}일차 저녁</Text>
        <Text style={styles.line}>저녁 식사: 식량 {FOOD_PER_DAY} (본인 1 · 가족 1) — 가진 식량 {food}</Text>
        {notes.map((n) => (
          <Text key={n.text} style={[styles.note, styles[n.tone]]}>{n.text}</Text>
        ))}

        {p.foodShort && (
          <>
            {canBuy > 0 && (
              <ActionButton
                label={`식량 ${canBuy} 사기`}
                detail={`은화 ${canBuy * FOOD_PRICE} · 가진 은화 ${silver}`}
                onPress={() => send({ type: "shop", op: "buyFood", qty: canBuy })}
              />
            )}
            <Text style={styles.line}>누구부터 먹일까?</Text>
            <ChipRow>
              <Chip label="내가 먼저" selected={order === "selfFirst"} onPress={() => setOrder("selfFirst")} />
              <Chip label="가족 먼저" selected={order === "familyFirst"} onPress={() => setOrder("familyFirst")} />
            </ChipRow>
          </>
        )}

        {run.resources.debt > 0 && silver > 0 && (
          <ActionButton
            label="빚 갚기"
            detail={`가진 만큼 (최대 ${Math.min(silver, run.resources.debt)}) · 남은 빚 ${run.resources.debt}`}
            onPress={() => send({ type: "shop", op: "payDebt", qty: run.resources.debt })}
          />
        )}

        <ActionButton primary label="잠자리에 든다" onPress={() => send({ type: "endDay", order })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  title: { color: colors.text, fontSize: font.xl, fontWeight: "700" },
  line: { color: colors.text, fontSize: font.md },
  note: { fontSize: font.md },
  info: { color: colors.textDim },
  warn: { color: colors.partial },
  bad: { color: colors.fail },
});
