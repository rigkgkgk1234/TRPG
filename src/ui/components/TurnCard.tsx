import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import type { CombatFx } from "@/core/commands";
import { OUTCOME_LABEL } from "@/core/labels";
import type { CheckResult } from "@/core/types";
import { useGame } from "@/store/gameStore";
import { DiceRoll, NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { BandaidsIcon, TrendUpIcon, WarningIcon, type Icon } from "@/ui/icons";
import { OUTCOME_COLOR, OUTCOME_TONE, signed, TONE_COLOR, type Change, type Line, type Tone, type TurnSummary } from "@/ui/turnSummary";
import { RollFormula } from "@/ui/components/RollFormula";
import { rollModeNote } from "@/ui/rollText";
import { colors, icon, motion, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

const TONE_BG: Record<Tone, string> = { good: colors.goodBg, bad: colors.badBg, crit: colors.critBg, neutral: colors.neutralBg };
const MARK_ICON: Record<NonNullable<Line["mark"]>, Icon> = { levelUp: TrendUpIcon, wound: WarningIcon, heal: BandaidsIcon };

/** 전투 연출이 붙은 박자 앞에 두는 틈 (앞 연출이 끝날 시간, ms) */
const FX_GAP = 260;

/** 결과 카드가 차례로 드러내는 한 박자 */
type Beat = { kind: "roll" } | { kind: "offRoll" } | { kind: "changes" } | { kind: "event"; i: number };

/**
 * 방금 한 일의 결과 카드. 위에서 아래로 "무엇을 → 굴림 → 결과 → 바뀐 것 → 일어난 일" 순서로 읽힌다.
 * animate면 주사위를 굴린 뒤 한 줄씩 드러내고, 다 보이면 onDone. 카드를 누르면 바로 끝까지 보여 준다.
 * 두 손 무기면 주사위 두 개(오른손·왼손)를 나란히 두고, 오른손 굴림과 그 피해가 나온 뒤에 왼손 주사위를 굴린다.
 */
/** dense: 전투 중처럼 결과 칸이 낮을 때. 날짜 줄을 빼고 주사위·글자를 줄여 한 화면에 담는다 */
export function TurnCard({ summary, animate, dense = false, onDone }: { summary: TurnSummary; animate: boolean; dense?: boolean; onDone?: () => void }) {
  const { roll, offRoll, changes, events, notices } = summary;
  const offAt = offRoll ? Math.min(summary.offRollAt ?? 0, events.length) : events.length;
  // 왼손 공격 글: 왼손 굴림 뒤부터 상대가 한 일이 나오기 전까지
  const firstFoe = events.findIndex((e, i) => i >= offAt && e.foe);
  const offEnd = offRoll ? (firstFoe < 0 ? events.length : firstFoe) : offAt;
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

  // 박자마다 재생할 전투 연출: 굴림 결과가 드러날 때 내 공격, 글 줄이 드러날 때 상대 공격
  const fxOf = (b: Beat): CombatFx[] =>
    b.kind === "roll" ? summary.rollFx ?? [] : b.kind === "offRoll" ? summary.offRollFx ?? [] : b.kind === "event" ? summary.lineFx?.[b.i] ?? [] : [];
  const skipped = useRef(false);

  useEffect(() => {
    if (!animate) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    beats.forEach((b, i) => {
      const fx = fxOf(b);
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
        // 상대 공격처럼 연출이 붙은 줄은 앞 연출이 끝날 틈을 둔다
        t += motion.stagger + (fx.length > 0 ? FX_GAP : 0);
      }
      timers.push(setTimeout(() => {
        setShown(i + 1);
        if (!skipped.current) fx.forEach((f) => useGame.getState().playFx(f));
      }, t));
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
    skipped.current = true;
    setRolling(false);
    setOffRolling(false);
    setOffPending(false);
    setShown(steps);
  };

  const visible = (b: Beat) => beats.indexOf(b) < shown;
  const eventBeats = (from: number, to: number) => beats.filter((b): b is Extract<Beat, { kind: "event" }> => b.kind === "event" && b.i >= from && b.i < to);
  const renderEvents = (list: Extract<Beat, { kind: "event" }>[]) => list.some(visible) && (
    <View style={[styles.events, dense && styles.eventsDense]}>
      {list.map((b) => visible(b) && (
        <FadeIn key={b.i} animate={animate}>
          <EventLine line={events[b.i]} dense={dense} />
        </FadeIn>
      ))}
    </View>
  );
  const changesBeat = beats.find((b) => b.kind === "changes");
  const chips = changesBeat && visible(changesBeat) && (
    <FadeIn animate={animate} style={styles.chips}>
      {changes.map((c) => <ChangeChip key={c.key} change={c} dense={dense} />)}
    </FadeIn>
  );

  return (
    <Pressable onPress={skip} disabled={done} accessibilityHint={done ? undefined : "눌러서 결과 바로 보기"} style={[styles.card, dense && styles.cardDense]}>
      {dense ? (
        // 좁은 칸: 바뀐 것(HP 등)은 제목 줄 오른쪽에 둬서 한 줄을 아낀다
        <View style={styles.titleRow}>
          <Text style={styles.titleDense}>{summary.title}</Text>
          {chips}
        </View>
      ) : (
        <View>
          <Text style={styles.when}>{summary.when}</Text>
          <Text style={styles.title}>{summary.title}</Text>
        </View>
      )}

      {roll && !offRoll && (
        <View style={styles.rollRow}>
          <DiceRoll result={roll} rolling={rolling} small={dense} />
          <View style={[styles.rollText, dense && styles.rollTextDense]}>
            {rolling
              ? <Text style={styles.rolling}>굴리는 중</Text>
              : visible(beats[0]) && <FadeIn animate={animate}><RollResult r={roll} dense={dense} /></FadeIn>}
          </View>
        </View>
      )}

      {roll && offRoll && (
        // 오른손·왼손을 나란히: 칸마다 주사위 → 결과 → 그 손의 공격 글. 상대가 한 일과 바뀐 것은 그 아래에
        <View style={styles.dualRow}>
          <View style={styles.handCol}>
            <DiceRoll result={roll} rolling={rolling} small={dense} />
            {!dense && <Text style={styles.handLabel}>오른손</Text>}
            {rolling
              ? <Text style={styles.rolling}>{dense ? "오른손 굴리는 중" : "굴리는 중"}</Text>
              : visible(beats[0]) && <FadeIn animate={animate}><RollResult r={roll} compact dense={dense} hand={dense ? "오른손" : undefined} /></FadeIn>}
            {renderEvents(eventBeats(0, offAt))}
          </View>
          <View style={styles.handCol}>
            <DiceRoll result={offRoll} rolling={offRolling} pending={offPending} small={dense} />
            {!dense && <Text style={styles.handLabel}>왼손</Text>}
            {offRolling
              ? <Text style={styles.rolling}>{dense ? "왼손 굴리는 중" : "굴리는 중"}</Text>
              : beats.some((b) => b.kind === "offRoll" && visible(b)) && <FadeIn animate={animate}><RollResult r={offRoll} compact dense={dense} hand={dense ? "왼손" : undefined} /></FadeIn>}
            {renderEvents(eventBeats(offAt, offEnd))}
          </View>
        </View>
      )}

      {!dense && !summary.changesLast && chips}

      {renderEvents(eventBeats(offRoll ? offEnd : 0, events.length))}

      {!dense && summary.changesLast && chips}

      {notices.map((n) => <Text key={n} style={styles.notice}>{n}</Text>)}
    </Pressable>
  );
}

/** 판정 결과: 성패, 계산식(9(D20) + 1(근력) = 합계), 목표, 유리·불리면 어느 주사위를 썼는지. compact: 두 손 무기처럼 반 폭에 놓일 때 (작은 글씨) */
function RollResult({ r, compact, dense, hand }: { r: CheckResult; compact?: boolean; dense?: boolean; hand?: string }) {
  const note = rollModeNote(r);
  const color = OUTCOME_COLOR[r.outcome];
  if (dense) {
    // 한 줄: [성공] 목표 11 경험 +2 / 아래 작은 계산식. 유리·불리는 흐린 주사위로 보이므로 설명은 뺀다.
    // 반 폭(두 손)이면 계산식 대신 "합계 12 / 목표 11" 한 줄 (계산식은 지난 기록을 눌러 보던 것처럼 넓은 화면에서)
    return (
      <View style={styles.rollResultDense}>
        <View style={styles.outcomeRow}>
          {hand && <Text style={styles.handTag}>{hand}</Text>}
          <View style={[styles.badgeDense, { backgroundColor: TONE_BG[OUTCOME_TONE[r.outcome]] }]}>
            <Text style={[styles.badgeTextDense, { color }]}>{OUTCOME_LABEL[r.outcome]}</Text>
          </View>
          {!compact && <Text style={styles.dcCompact}>목표 {r.spec.dc}</Text>}
          {r.xpGained > 0 && <Text style={styles.xp}>경험 +{r.xpGained}</Text>}
        </View>
        {compact
          ? <Text style={styles.mathDense}>합계 <Text style={styles.mathTotal}>{r.total}</Text> / 목표 {r.spec.dc}</Text>
          : <RollFormula r={r} style={styles.mathDense} noteStyle={styles.mathNote} totalStyle={styles.mathTotal} />}
      </View>
    );
  }
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

function EventLine({ line, dense }: { line: Line; dense?: boolean }) {
  const MarkIcon = line.mark ? MARK_ICON[line.mark] : null;
  const color = TONE_COLOR[line.tone];
  return (
    <View style={styles.eventRow}>
      {MarkIcon && <MarkIcon size={icon.sm} weight={icon.weight} color={color} style={styles.eventIcon} />}
      <Text style={[dense ? styles.eventDense : styles.event, { color }]}>{line.text}</Text>
    </View>
  );
}

function ChangeChip({ change: c, dense }: { change: Change; dense?: boolean }) {
  return (
    <View style={[styles.chip, dense && styles.chipDense, { backgroundColor: TONE_BG[c.tone] }]}>
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
  cardDense: { gap: space.xs + 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  titleDense: { ...type.heading, color: colors.text, flexShrink: 1, marginRight: "auto" },
  rollTextDense: { minHeight: 44 },
  rollResultDense: { gap: 2 },
  badgeDense: { paddingHorizontal: space.sm, paddingVertical: 1, borderRadius: radius.sm },
  badgeTextDense: { ...type.label },
  mathDense: { ...type.caption, color: colors.text, fontVariant: ["tabular-nums"] },
  eventsDense: { gap: 2 },
  eventDense: { ...type.caption, fontSize: 14, lineHeight: 20, flex: 1 },
  chipDense: { paddingVertical: 2, paddingHorizontal: space.sm },
  when: { ...type.overline, color: colors.textFaint },
  title: { ...type.title, color: colors.text },
  rollRow: { flexDirection: "row", alignItems: "center", gap: space.lg },
  rollText: { flex: 1, minHeight: 64, justifyContent: "center" },
  rolling: { ...type.body, color: colors.textDim },
  dualRow: { flexDirection: "row", gap: space.md },
  handCol: { flex: 1, gap: space.sm },
  handTag: { ...type.label, color: colors.textDim },
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
