import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ENDING_LABEL, SKILL_IDS, SKILL_LABEL } from "@/core/labels";
import { endingText, epitaph } from "@/core/story/ending";
import type { RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useMeta } from "@/store/metaStore";
import { ActionButton } from "@/ui/components/Buttons";
import { colors, hairline, space, type } from "@/ui/theme";
import { once, pushOnce } from "@/ui/navigate";

/**
 * 엔딩 머리. 엔딩도 라우터로 옮기지 않고 게임 화면 안에서 보여 준다:
 * 위쪽 결과 카드에 마지막 장면(습격·죽음)이 남아 있어 무엇 때문에 끝났는지 이어서 읽힌다.
 */
export function EndingHeader({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + space.xxl }]}>
      <Text style={styles.kicker}>{run.player.name}의 {run.time.day}일</Text>
      <Text style={styles.title}>{ENDING_LABEL[run.ending!]}</Text>
    </View>
  );
}

export function EndingPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const best = [...SKILL_IDS].sort((a, b) => run.player.skills[b].rank - run.player.skills[a].rank)[0];
  const st = run.stats;
  // 묘비문은 사망 원인을 아는 기록(마지막 명령 직전 상태로 만든 것)에서 읽는다
  const record = useMeta((s) => s.meta.history.find((h) => h.runId === run.runId));
  const grave = record ? epitaph(record, run.player.name) : "";
  const traits = run.player.traits.map((t) => CONTENT.traits[t]?.name ?? t);

  // 끝난 회차는 스토어에 남겨 둔다 (타이틀의 "이어하기"는 끝나지 않은 회차만 보인다). 새 게임이 덮어쓴다.
  const toTitle = () => once(() => router.dismissTo("/"));

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      <Text lineBreakStrategyIOS="hangul-word" style={styles.story}>{endingText(run)}</Text>
      {grave ? <Text lineBreakStrategyIOS="hangul-word" style={styles.grave}>{grave}</Text> : null}
      <View style={styles.stats}>
        <Figure label="판정" value={`${st.checksRolled}회`} />
        <Figure label="대성공" value={String(st.crits)} />
        <Figure label="대실패" value={String(st.fumbles)} />
      </View>
      <View style={styles.stats}>
        <Figure label="벌어들인 은화" value={String(st.silverEarned)} />
        <Figure label="남은 은화" value={String(run.resources.silver)} />
        <Figure label="빚" value={String(run.resources.debt)} />
      </View>
      <View style={styles.lines}>
        <Text style={styles.line}>가장 많이 익힌 숙련: {SKILL_LABEL[best]} {run.player.skills[best].rank}레벨</Text>
        {st.lowestHp && <Text style={styles.line}>가장 위험했던 순간: {st.lowestHp.day}일차, HP {st.lowestHp.hp}</Text>}
        <Text style={styles.line}>남긴 흔적: {traits.length ? traits.map((t) => `「${t}」`).join(", ") : "없음"}</Text>
      </View>
      <View style={styles.buttons}>
        <View style={styles.cell}><ActionButton fill center label="기록 보기" onPress={() => pushOnce("/records")} /></View>
        <View style={styles.cell}><ActionButton fill primary label="처음 화면으로" onPress={toTitle} /></View>
      </View>
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
    borderTopWidth: hairline,
    borderColor: colors.borderStrong,
  },
  stats: { flexDirection: "row", gap: space.sm },
  figure: { flex: 1, gap: 2 },
  figureValue: { ...type.number, color: colors.text },
  figureLabel: { ...type.caption, color: colors.textFaint },
  line: { ...type.body, color: colors.textDim },
  lines: { gap: 2 },
  story: { ...type.body, color: colors.text },
  grave: { ...type.bodyStrong, color: colors.textDim },
  buttons: { flexDirection: "row", gap: space.sm },
  cell: { flex: 1, flexDirection: "column" },
});
