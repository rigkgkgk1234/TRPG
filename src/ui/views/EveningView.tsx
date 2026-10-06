import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { FeedOrder } from "@/core/commands";
import { FOOD_PER_DAY, previewEvening } from "@/core/day/evening";
import { FOOD_PRICE, type RunState } from "@/core/types";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { Chip, ChipRow } from "@/ui/components/Controls";
import { BasketIcon, HandCoinsIcon, MoonStarsIcon, WarningIcon } from "@/ui/icons";
import { colors, icon, radius, space, type } from "@/ui/theme";

/** 저녁 패널: 정산을 미리 알려 주고, 모자란 식량을 사거나 먹일 순서를 정한 뒤 잠자리에 든다. */
export function EveningPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const [order, setOrder] = useState<FeedOrder>("selfFirst");

  const p = previewEvening(run);
  const { food, silver } = run.resources;
  const shortBy = Math.max(0, FOOD_PER_DAY - food);
  const canBuy = Math.min(shortBy, Math.floor(silver / FOOD_PRICE));

  const notes: { text: string; tone: "warn" | "bad" | "info" }[] = [];
  if (run.time.collapsedToday) notes.push({ text: "탈진했다. 오늘 밤 피로는 6까지만 풀리고, 내일 오전은 누워 지낸다.", tone: "warn" });
  if (p.foodShort) notes.push({ text: `식량이 ${shortBy} 모자라 누군가는 굶는다.`, tone: "warn" });
  if (p.taxDue) {
    notes.push(p.taxShort
      ? { text: `오늘은 납세일인데 세금(은화 ${p.taxDue}닢)을 낼 은화가 모자라다. 모자란 만큼 빚이 생기고 평판이 떨어진다.`, tone: "bad" }
      : { text: `오늘은 납세일이다. 잠들기 전에 세금으로 은화 ${p.taxDue}닢을 낸다.`, tone: "info" });
  }
  if (p.debtEnding) notes.push({ text: "빚이 너무 많다. 이대로 납세일을 맞으면 끝이다.", tone: "bad" });
  if (p.lastDay) notes.push({ text: "서른 번째 밤이다.", tone: "info" });

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{run.time.day}일차 저녁</Text>
        <Text style={[styles.meal, p.foodShort && { color: colors.partial }]}>저녁거리 {food}/{FOOD_PER_DAY}</Text>
      </View>
      {notes.length > 0 && (
        <View style={styles.notes}>
          {notes.map((n) => (
            <View key={n.text} style={styles.noteRow}>
              {n.tone !== "info" && <WarningIcon size={icon.sm} weight={icon.weight} color={TONE[n.tone]} style={styles.noteIcon} />}
              <Text lineBreakStrategyIOS="hangul-word" style={[styles.note, { color: TONE[n.tone] }]}>{n.text}</Text>
            </View>
          ))}
        </View>
      )}

      {p.foodShort && (
        <View style={styles.row}>
          {canBuy > 0 && (
            <View style={styles.cell}>
              <ActionButton
                icon={BasketIcon}
                label={`식량 ${canBuy} 사기`}
                detail={[`은화 -${canBuy * FOOD_PRICE}`, `가진 은화 ${silver}`]}
                onPress={() => send({ type: "shop", op: "buyFood", qty: canBuy })}
              />
            </View>
          )}
          <View style={styles.cell}>
            <Text style={styles.small}>누구부터 먹일까?</Text>
            <ChipRow>
              <Chip label="나" selected={order === "selfFirst"} onPress={() => setOrder("selfFirst")} />
              <Chip label="가족" selected={order === "familyFirst"} onPress={() => setOrder("familyFirst")} />
            </ChipRow>
          </View>
        </View>
      )}

      {run.resources.debt > 0 && silver > 0 && (
        <ActionButton
          icon={HandCoinsIcon}
          label="빚 갚기"
          detail={[`가진 만큼 (최대 ${Math.min(silver, run.resources.debt)})`, `남은 빚 ${run.resources.debt}`]}
          onPress={() => send({ type: "shop", op: "payDebt", qty: run.resources.debt })}
        />
      )}

      <ActionButton primary icon={MoonStarsIcon} label="잠자리에 든다" onPress={() => send({ type: "endDay", order })} />
    </View>
  );
}

const TONE = { info: colors.textDim, warn: colors.partial, bad: colors.fail } as const;

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg + 4,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  titleRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  title: { ...type.title, color: colors.text },
  meal: { ...type.label, color: colors.textDim, fontVariant: ["tabular-nums"] },
  notes: { gap: space.xs },
  noteRow: { flexDirection: "row", gap: space.sm },
  noteIcon: { marginTop: 4 },
  note: { ...type.body, flex: 1 },
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  cell: { flex: 1, gap: space.xs },
  small: { ...type.caption, color: colors.textDim },
});
