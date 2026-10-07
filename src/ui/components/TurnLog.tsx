import { memo, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { OUTCOME_LABEL } from "@/core/labels";
import { useGame, type LogGroup } from "@/store/gameStore";
import { TurnCard } from "@/ui/components/TurnCard";
import { changesLine, OUTCOME_COLOR, summarizeTurn } from "@/ui/turnSummary";
import { useReducedMotion } from "@/ui/useReducedMotion";
import { RollFormula } from "@/ui/components/RollFormula";
import { colors, space, type } from "@/ui/theme";

/**
 * 게임 화면 가운데: 방금 한 일은 큰 결과 카드로, 그 전 일들은 짧은 요약으로 아래에 쌓는다.
 * 연출 중인 묶음이면 카드가 주사위부터 굴린다 ("동작 줄이기"가 켜져 있으면 바로 보여 준다).
 */
export function TurnLog({ intro }: { intro?: { title: string; body: string } }) {
  const log = useGame((s) => s.log);
  const playingId = useGame((s) => s.playing?.id);
  const finishPlaying = useGame((s) => s.finishPlaying);
  const reduced = useReducedMotion();
  const scroll = useRef<ScrollView>(null);

  const latest = log.at(-1);
  const older = log.slice(0, -1).reverse();

  // 새 결과가 오면 맨 위(최신 카드)로
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [latest?.id]);

  const playing = latest !== undefined && latest.id === playingId;
  return (
    <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.content}>
      {latest ? (
        <TurnCard
          key={latest.id}
          summary={summarizeTurn(latest)}
          animate={playing && !reduced}
          onDone={playing ? finishPlaying : undefined}
        />
      ) : intro ? (
        <View style={styles.intro}>
          <Text style={styles.introTitle}>{intro.title}</Text>
          <Text lineBreakStrategyIOS="hangul-word" style={styles.introBody}>{intro.body}</Text>
        </View>
      ) : null}

      {older.length > 0 && (
        <View style={styles.history}>
          <Text style={styles.historyTitle}>지난 기록</Text>
          {older.map((g) => <HistoryRow key={g.id} group={g} />)}
        </View>
      )}
    </ScrollView>
  );
}

/** 지난 묶음은 바뀌지 않으므로 새 묶음이 들어와도 다시 계산하지 않는다. */
const HistoryRow = memo(function HistoryRow({ group }: { group: LogGroup }) {
  const s = summarizeTurn(group);
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowTitle}>{s.title}</Text>
        {s.roll && (
          <Text style={[styles.rowOutcome, { color: OUTCOME_COLOR[s.roll.outcome] }]}>{OUTCOME_LABEL[s.roll.outcome]}</Text>
        )}
        <Text style={styles.rowWhen}>{s.when}</Text>
      </View>
      {s.roll && (
        <Text style={styles.rowRoll}>
          <RollFormula r={s.roll} style={styles.rowRoll} noteStyle={styles.rowRollNote} />
          {" / "}목표 {s.roll.spec.dc}
        </Text>
      )}
      <Text lineBreakStrategyIOS="hangul-word" style={styles.rowText}>{changesLine(s)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: space.lg, gap: space.xxl },
  intro: { gap: space.sm, paddingTop: space.xl, paddingRight: space.xl },
  introTitle: { ...type.display, fontSize: 28, lineHeight: 36, color: colors.text },
  introBody: { ...type.body, color: colors.textDim },
  history: { gap: space.lg, paddingHorizontal: space.xs },
  historyTitle: { ...type.label, color: colors.textFaint },
  row: { gap: 2 },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  rowTitle: { ...type.bodyStrong, color: colors.textDim, flexShrink: 1 },
  rowOutcome: { ...type.label },
  rowWhen: { ...type.caption, color: colors.textFaint, marginLeft: "auto" },
  rowText: { ...type.caption, color: colors.textFaint },
  rowRoll: { ...type.caption, color: colors.textDim, fontVariant: ["tabular-nums"] },
  rowRollNote: { fontSize: 11, color: colors.textFaint },
});
