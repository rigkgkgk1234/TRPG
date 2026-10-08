import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { OUTCOME_LABEL } from "@/core/labels";
import type { CheckResult } from "@/core/types";
import { DiceRoll, NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { BandaidsIcon, TrendUpIcon, WarningIcon, type Icon } from "@/ui/icons";
import { OUTCOME_COLOR, OUTCOME_TONE, signed, TONE_COLOR, type Change, type Line, type Tone, type TurnSummary } from "@/ui/turnSummary";
import { RollFormula } from "@/ui/components/RollFormula";
import { rollModeNote } from "@/ui/rollText";
import { colors, icon, motion, radius, space, type } from "@/ui/theme";

const TONE_BG: Record<Tone, string> = { good: colors.goodBg, bad: colors.badBg, crit: colors.critBg, neutral: colors.neutralBg };
const MARK_ICON: Record<NonNullable<Line["mark"]>, Icon> = { levelUp: TrendUpIcon, wound: WarningIcon, heal: BandaidsIcon };

/**
 * 방금 한 일의 결과 카드. 위에서 아래로 "무엇을 → 굴림 → 결과 → 바뀐 것 → 일어난 일" 순서로 읽힌다.
 * animate면 주사위를 굴린 뒤 한 줄씩 드러내고, 다 보이면 onDone. 카드를 누르면 바로 끝까지 보여 준다.
 */
export function TurnCard({ summary, animate, onDone }: { summary: TurnSummary; animate: boolean; onDone?: () => void }) {
  const { roll, changes, events, notices } = summary;
  // 드러낼 단계: [판정 결과] [자원 변화] [사건 하나씩]
  const steps = (roll ? 1 : 0) + (changes.length > 0 ? 1 : 0) + events.length;
  const [rolling, setRolling] = useState(animate && !!roll);
  const [shown, setShown] = useState(animate ? 0 : steps);
  const done = !rolling && shown >= steps;

  useEffect(() => {
    if (!animate) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = roll ? motion.dice : 0;
    if (roll) timers.push(setTimeout(() => setRolling(false), t));
    for (let i = 1; i <= steps; i++) {
      t += i === 1 && roll ? motion.settle : motion.stagger;
      timers.push(setTimeout(() => setShown(i), t));
    }
    return () => timers.forEach(clearTimeout);
  }, [animate, roll, steps]);

  const doneRef = useRef(false);
  useEffect(() => {
    if (!done || doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [done, onDone]);

  const skip = () => {
    setRolling(false);
    setShown(steps);
  };

  const rollStep = roll ? 1 : 0;
  const changesStep = rollStep + (changes.length > 0 ? 1 : 0);

  return (
    <Pressable onPress={skip} disabled={done} accessibilityHint={done ? undefined : "눌러서 결과 바로 보기"} style={styles.card}>
      <View>
        <Text style={styles.when}>{summary.when}</Text>
        <Text style={styles.title}>{summary.title}</Text>
      </View>

      {roll && (
        <View style={styles.rollRow}>
          <DiceRoll result={roll} rolling={rolling} />
          <View style={styles.rollText}>
            {rolling
              ? <Text style={styles.rolling}>굴리는 중</Text>
              : shown >= rollStep && <FadeIn animate={animate}><RollResult r={roll} /></FadeIn>}
          </View>
        </View>
      )}

      {changes.length > 0 && shown >= changesStep && (
        <FadeIn animate={animate} style={styles.chips}>
          {changes.map((c) => <ChangeChip key={c.key} change={c} />)}
        </FadeIn>
      )}

      {events.some((_, i) => shown >= changesStep + i + 1) && (
        <View style={styles.events}>
          {events.map((e, i) => shown >= changesStep + i + 1 && (
            <FadeIn key={i} animate={animate}>
              <EventLine line={e} />
            </FadeIn>
          ))}
        </View>
      )}

      {notices.map((n) => <Text key={n} style={styles.notice}>{n}</Text>)}
    </Pressable>
  );
}

/** 판정 결과: 성패, 계산식(9(D20) + 1(근력) = 합계), 목표, 유리·불리면 어느 주사위를 썼는지 */
function RollResult({ r }: { r: CheckResult }) {
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
      <RollFormula r={r} style={styles.math} noteStyle={styles.mathNote} totalStyle={styles.mathTotal} />
      <Text style={styles.dc}>목표 {r.spec.dc}</Text>
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
      <Text lineBreakStrategyIOS="hangul-word" style={[styles.event, { color }]}>{line.text}</Text>
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
