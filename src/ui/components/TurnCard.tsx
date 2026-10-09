import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { OUTCOME_LABEL } from "@/core/labels";
import type { CheckResult } from "@/core/types";
import { DiceRoll, NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { BandaidsIcon, TrendUpIcon, WarningIcon, type Icon } from "@/ui/icons";
import { OUTCOME_COLOR, OUTCOME_TONE, signed, TONE_COLOR, type Change, type Line, type Tone, type TurnSummary } from "@/ui/turnSummary";
import { RollFormula } from "@/ui/components/RollFormula";
import { rollModeNote } from "@/ui/rollText";
import { colors, icon, motion, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

const TONE_BG: Record<Tone, string> = { good: colors.goodBg, bad: colors.badBg, crit: colors.critBg, neutral: colors.neutralBg };
const MARK_ICON: Record<NonNullable<Line["mark"]>, Icon> = { levelUp: TrendUpIcon, wound: WarningIcon, heal: BandaidsIcon };

/** 결과 카드가 차례로 드러내는 한 박자 */
type Beat = { kind: "roll" } | { kind: "offRoll" } | { kind: "changes" } | { kind: "event"; i: number };

/**
 * 방금 한 일의 결과 카드. 위에서 아래로 "무엇을 → 굴림 → 결과 → 바뀐 것 → 일어난 일" 순서로 읽힌다.
 * animate면 주사위를 굴린 뒤 한 줄씩 드러내고, 다 보이면 onDone. 카드를 누르면 바로 끝까지 보여 준다.
 * 두 손 무기면 주사위 두 개(오른손·왼손)를 나란히 두고, 오른손 굴림과 그 피해가 나온 뒤에 왼손 주사위를 굴린다.
 */
export function TurnCard({ summary, animate, onDone }: { summary: TurnSummary; animate: boolean; onDone?: () => void }) {
  const { roll, offRoll, changes, events, notices } = summary;
  const offAt = offRoll ? Math.min(summary.offRollAt ?? 0, events.length) : events.length;
  const beats: Beat[] = [
    ...(roll ? [{ kind: "roll" } as const] : []),
    ...(offRoll ? events.slice(0, offAt).map((_, i) => ({ kind: "event", i }) as const) : []),
    ...(offRoll ? [{ kind: "offRoll" } as const] : []),
    ...(changes.length > 0 && !summary.changesLast ? [{ kind: "changes" } as const] : []),
    ...events.slice(offRoll ? offAt : 0).map((_, j) => ({ kind: "event", i: (offRoll ? offAt : 0) + j }) as const),
    // 전투는 내 공격 → 상대 공격이 다 나온 뒤에 HP 같은 변화를 보여 준다
    ...(changes.length > 0 && summary.changesLast ? [{ kind: "changes" } as const] : []),
  ];
  const steps = beats.length;
  const [rolling, setRolling] = useState(animate && !!roll);
  const [offRolling, setOffRolling] = useState(false);
  const [offPending, setOffPending] = useState(animate && !!offRoll);
  const [shown, setShown] = useState(animate ? 0 : steps);
  const done = !rolling && !offRolling && shown >= steps;

  useEffect(() => {
    if (!animate) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    beats.forEach((b, i) => {
      if (b.kind === "roll") {
        t += motion.dice;
        timers.push(setTimeout(() => setRolling(false), t));
        t += motion.settle;
      } else if (b.kind === "offRoll") {
        t += motion.stagger;
        timers.push(setTimeout(() => { setOffPending(false); setOffRolling(true); }, t));
        t += motion.dice;
        timers.push(setTimeout(() => setOffRolling(false), t));
        t += motion.settle;
      } else {
        t += motion.stagger;
      }
      timers.push(setTimeout(() => setShown(i + 1), t));
    });
    return () => timers.forEach(clearTimeout);
    // beats는 summary에서 정해지므로 steps로 충분하다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, roll, offRoll, steps]);

  const doneRef = useRef(false);
  useEffect(() => {
    if (!done || doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [done, onDone]);

  const skip = () => {
    setRolling(false);
    setOffRolling(false);
    setOffPending(false);
    setShown(steps);
  };

  const visible = (b: Beat) => beats.indexOf(b) < shown;
  const eventBeats = (from: number, to: number) => beats.filter((b): b is Extract<Beat, { kind: "event" }> => b.kind === "event" && b.i >= from && b.i < to);
  const renderEvents = (list: Extract<Beat, { kind: "event" }>[]) => list.some(visible) && (
    <View style={styles.events}>
      {list.map((b) => visible(b) && (
        <FadeIn key={b.i} animate={animate}>
          <EventLine line={events[b.i]} />
        </FadeIn>
      ))}
    </View>
  );
  const changesBeat = beats.find((b) => b.kind === "changes");
  const chips = changesBeat && visible(changesBeat) && (
    <FadeIn animate={animate} style={styles.chips}>
      {changes.map((c) => <ChangeChip key={c.key} change={c} />)}
    </FadeIn>
  );

  return (
    <Pressable onPress={skip} disabled={done} accessibilityHint={done ? undefined : "눌러서 결과 바로 보기"} style={styles.card}>
      <View>
        <Text style={styles.when}>{summary.when}</Text>
        <Text style={styles.title}>{summary.title}</Text>
      </View>

      {roll && !offRoll && (
        <View style={styles.rollRow}>
          <DiceRoll result={roll} rolling={rolling} />
          <View style={styles.rollText}>
            {rolling
              ? <Text style={styles.rolling}>굴리는 중</Text>
              : visible(beats[0]) && <FadeIn animate={animate}><RollResult r={roll} /></FadeIn>}
          </View>
        </View>
      )}

      {roll && offRoll && (
        <>
          {/* 오른손·왼손을 나란히: 칸마다 주사위 → 이름 → 결과. 공격 글은 그 아래에 일어난 순서대로 */}
          <View style={styles.dualRow}>
            <View style={styles.handCol}>
              <DiceRoll result={roll} rolling={rolling} />
              <Text style={styles.handLabel}>오른손</Text>
              {rolling
                ? <Text style={styles.rolling}>굴리는 중</Text>
                : visible(beats[0]) && <FadeIn animate={animate}><RollResult r={roll} compact /></FadeIn>}
            </View>
            <View style={styles.handCol}>
              <DiceRoll result={offRoll} rolling={offRolling} pending={offPending} />
              <Text style={styles.handLabel}>왼손</Text>
              {offRolling
                ? <Text style={styles.rolling}>굴리는 중</Text>
                : beats.some((b) => b.kind === "offRoll" && visible(b)) && <FadeIn animate={animate}><RollResult r={offRoll} compact /></FadeIn>}
            </View>
          </View>
          {renderEvents(eventBeats(0, offAt))}
        </>
      )}

      {!summary.changesLast && chips}

      {renderEvents(eventBeats(offRoll ? offAt : 0, events.length))}

      {summary.changesLast && chips}

      {notices.map((n) => <Text key={n} style={styles.notice}>{n}</Text>)}
    </Pressable>
  );
}

/** 판정 결과: 성패, 계산식(9(D20) + 1(근력) = 합계), 목표, 유리·불리면 어느 주사위를 썼는지. compact: 두 손 무기처럼 반 폭에 놓일 때 (작은 글씨) */
function RollResult({ r, compact }: { r: CheckResult; compact?: boolean }) {
  const note = rollModeNote(r);
  const color = OUTCOME_COLOR[r.outcome];
  return (
    <View style={styles.rollResult}>
      <View style={styles.outcomeRow}>
        <View style={[styles.badge, { backgroundColor: TONE_BG[OUTCOME_TONE[r.outcome]] }]}>
          <Text style={[styles.badgeText, { color }]}>{OUTCOME_LABEL[r.outcome]}</Text>
        </View>
        {r.xpGained > 0 && <Text style={styles.xp}>경험 +{r.xpGained}</Text>}
      </View>
      <RollFormula r={r} style={compact ? styles.mathCompact : styles.math} noteStyle={styles.mathNote} totalStyle={styles.mathTotal} />
      <Text style={compact ? styles.dcCompact : styles.dc}>목표 {r.spec.dc}</Text>
      {note && <Text style={styles.small}>{note}</Text>}
    </View>
  );
}

function EventLine({ line }: { line: Line }) {
  const MarkIcon = line.mark ? MARK_ICON[line.mark] : null;
  const color = TONE_COLOR[line.tone];
  return (
    <View style={styles.eventRow}>
      {MarkIcon && <MarkIcon size={icon.sm} weight={icon.weight} color={color} style={styles.eventIcon} />}
      <Text style={[styles.event, { color }]}>{line.text}</Text>
    </View>
  );
}

function ChangeChip({ change: c }: { change: Change }) {
  return (
    <View style={[styles.chip, { backgroundColor: TONE_BG[c.tone] }]}>
      <Text style={styles.chipLabel}>{c.label}</Text>
      <Text style={[styles.chipValue, { color: TONE_COLOR[c.tone] }]}>{signed(c.delta)}</Text>
    </View>
  );
}

/** 처음 그려질 때 살짝 떠오르며 나타난다 */
export function FadeIn({ animate, style, children }: { animate: boolean; style?: object; children: React.ReactNode }) {
  const [v] = useState(() => new Animated.Value(animate ? 0 : 1));
  useEffect(() => {
    if (animate) Animated.timing(v, { toValue: 1, duration: motion.fade, useNativeDriver: NATIVE_DRIVER }).start();
  }, [animate, v]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [6, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  // 상자 없이 여백과 왼쪽 가는 줄로만 묶는다 (지난 기록과 같은 바탕 위에 놓인 장부 한 장)
  card: {
    paddingVertical: space.xs,
    paddingLeft: space.lg,
    gap: space.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  when: { ...type.overline, color: colors.textFaint },
  title: { ...type.title, color: colors.text },
  rollRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  rollText: { flex: 1, minHeight: 64, justifyContent: "center" },
  rolling: { ...type.body, color: colors.textDim },
  dualRow: { flexDirection: "row", gap: space.md },
  handCol: { flex: 1, gap: space.sm },
  handLabel: { ...type.caption, color: colors.textFaint },
  rollResult: { gap: space.xs },
  outcomeRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badge: { paddingHorizontal: space.md, paddingVertical: 2, borderRadius: radius.sm },
  badgeText: { ...type.heading },
  xp: { ...type.label, color: colors.textDim },
  math: { ...type.body, color: colors.text, fontVariant: ["tabular-nums"] },
  mathTotal: { ...type.bodyStrong },
  /** 괄호 안 설명: 숫자보다 작고 흐리게 */
  mathNote: { fontSize: 12, color: colors.textDim },
  dc: { ...type.body, color: colors.textFaint },
  mathCompact: { ...type.caption, fontSize: 14, lineHeight: 20, color: colors.text, fontVariant: ["tabular-nums"] },
  dcCompact: { ...type.caption, color: colors.textFaint },
  small: { ...type.caption, color: colors.textFaint },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: space.xs + 2, paddingHorizontal: space.md, paddingVertical: space.xs + 2, borderRadius: radius.sm },
  chipLabel: { ...type.label, color: colors.textDim },
  chipValue: { ...type.number, fontSize: 16, lineHeight: 20 },
  events: { gap: space.sm },
  eventRow: { flexDirection: "row", gap: space.sm },
  eventIcon: { marginTop: 4 },
  event: { ...type.body, flex: 1 },
  notice: { ...type.body, color: colors.textDim },
});
