import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ENDING_LABEL, SKILL_IDS, SKILL_LABEL } from "@/core/labels";
import type { RunState } from "@/core/types";
import { ActionButton } from "@/ui/components/Buttons";
import { colors, radius, space, type } from "@/ui/theme";

/** 임시 엔딩 머리. 6주차에 /ending 화면(묘비문·흔적·기록 저장)으로 옮긴다. */
export function EndingHeader({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xxl }]}>
      <Text style={styles.kicker}>{run.time.day}일차 · {run.player.name}</Text>
      <Text style={styles.title}>{ENDING_LABEL[run.ending!]}</Text>
    </View>
  );
}

export function EndingPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const best = [...SKILL_IDS].sort((a, b) => run.player.skills[b].rank - run.player.skills[a].rank)[0];
  const st = run.stats;

  // 끝난 회차는 스토어에 남겨 둔다 (타이틀의 "이어하기"는 끝나지 않은 회차만 보인다). 새 게임이 덮어쓴다.
  const toTitle = () => router.dismissTo("/");

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.stats}>
        <Figure label="판정" value={`${st.checksRolled}회`} />
        <Figure label="대성공" value={String(st.crits)} />
        <Figure label="대실패" value={String(st.fumbles)} />
      </View>
      <View style={styles.stats}>
        <Figure label="번 은화" value={String(st.silverEarned)} />
        <Figure label="남은 은화" value={String(run.resources.silver)} />
        <Figure label="빚" value={String(run.resources.debt)} />
      </View>
      <Text style={styles.line}>가장 높은 솜씨는 {SKILL_LABEL[best]} {run.player.skills[best].rank}등급</Text>
      <ActionButton primary label="타이틀로" onPress={toTitle} />
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  kicker: { ...type.label, color: colors.textFaint },
  title: { ...type.display, color: colors.crit },
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg + 4,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  stats: { flexDirection: "row", gap: space.sm },
  figure: { flex: 1, gap: 2 },
  figureValue: { ...type.number, color: colors.text },
  figureLabel: { ...type.caption, color: colors.textFaint },
  line: { ...type.body, color: colors.textDim },
});
