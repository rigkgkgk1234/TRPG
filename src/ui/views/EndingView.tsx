import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ENDING_LABEL, SKILL_IDS, SKILL_LABEL } from "@/core/labels";
import type { RunState } from "@/core/types";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { FeedLog } from "@/ui/components/FeedLog";
import { colors, font, space } from "@/ui/theme";

/** 임시 엔딩 화면. 6주차에 /ending 화면(묘비문·흔적·기록 저장)으로 옮긴다. */
export function EndingView({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const log = useGame((s) => s.log);

  const best = [...SKILL_IDS].sort((a, b) => run.player.skills[b].rank - run.player.skills[a].rank)[0];
  const st = run.stats;

  // 끝난 회차는 스토어에 남겨 둔다 (타이틀의 "이어하기"는 끝나지 않은 회차만 보인다). 새 게임이 덮어쓴다.
  const toTitle = () => router.dismissTo("/");

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{run.time.day}일차 · {run.player.name}</Text>
        <Text style={styles.title}>{ENDING_LABEL[run.ending!]}</Text>
      </View>
      <FeedLog log={log} empty="" />
      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
        <Text style={styles.line}>판정 {st.checksRolled}회 · 대성공 {st.crits} · 대실패 {st.fumbles}</Text>
        <Text style={styles.line}>번 은화 {st.silverEarned} · 남은 은화 {run.resources.silver} · 빚 {run.resources.debt}</Text>
        <Text style={styles.line}>가장 높은 솜씨: {SKILL_LABEL[best]} {run.player.skills[best].rank}등급</Text>
        <ActionButton primary label="타이틀로" onPress={toTitle} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: space.xl, gap: space.xs, alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border },
  kicker: { color: colors.textDim, fontSize: font.sm },
  title: { color: colors.crit, fontSize: 28, fontWeight: "800" },
  panel: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: colors.surface },
  line: { color: colors.text, fontSize: font.md },
});
