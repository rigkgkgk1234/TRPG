import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildCheckContext, previewCheck } from "@/core/check/modifiers";
import { formatSigned, MODE_LABEL, OUTCOME_LABEL, SKILL_IDS, SKILL_LABEL, STAT_IDS, STAT_LABEL, WOUND_LABEL } from "@/core/labels";
import {
  createRng,
  rollCheck,
  STAT_HARD_CAP,
  STAT_MIN,
  SKILL_MAX_RANK,
  type CheckOutcome,
  type CheckResult,
  type CheckSpec,
  type RollMode,
  type WoundLevel,
} from "@/core/types";
import { Chip, ChipRow, Section, Stepper } from "@/ui/components/Controls";
import { DEV_CONTENT, devSubject, type DevCheckInput } from "@/ui/dev/devSubject";
import { colors, fonts, motion, radius, space, TOUCH_MIN, type } from "@/ui/theme";
import { OUTCOME_COLOR } from "@/ui/turnSummary";

const DCS = [8, 10, 12, 14, 16, 20];
const WOUNDS: WoundLevel[] = ["none", "light", "serious"];
const HISTORY_MAX = 8;


/** 1주차 결과물: 능력치·숙련·DC·상태를 바꿔 가며 D20 판정과 성공 확률을 확인하는 개발용 화면 */
export default function DiceTestScreen() {
  const insets = useSafeAreaInsets();
  const [input, setInput] = useState<DevCheckInput>({
    stat: "agi", statValue: 2, skill: "bow", skillRank: 2,
    fatigued: false, hungry: false, wound: "none", chainShirt: false,
  });
  const [dc, setDc] = useState(12);
  const [intel, setIntel] = useState(false);
  const [allowPartial, setAllowPartial] = useState(false);
  const [history, setHistory] = useState<CheckResult[]>([]);

  // 화면이 살아 있는 동안 하나의 RNG를 이어서 쓴다 (실제 게임에서는 RunState.rng)
  const [{ seed, rng }] = useState(() => {
    const s = Date.now() % 2147483647;
    return { seed: s, rng: createRng({ seed: s, state: s }) };
  });

  const set = <K extends keyof DevCheckInput>(key: K, value: DevCheckInput[K]) => setInput((prev) => ({ ...prev, [key]: value }));

  const spec: CheckSpec = { stat: input.stat, skill: input.skill ?? undefined, dc, allowPartial };
  const ctx = buildCheckContext(devSubject(input), spec, DEV_CONTENT, { advantage: intel ? ["사전 정보"] : [] });
  const { mode, modifierTotal: total, chance } = previewCheck(spec, ctx);

  const roll = () => setHistory((prev) => [rollCheck(spec, ctx, rng), ...prev].slice(0, HISTORY_MAX));
  const last = history[0];

  return (
    <View style={styles.root}>
      <View style={styles.resultBox}>
        {last ? (
          <>
            <Text style={[styles.dice, { color: OUTCOME_COLOR[last.outcome] }]}>{last.kept}</Text>
            {last.dice.length > 1 && (
              <Text style={styles.dim}>{MODE_LABEL[last.mode]}: {last.dice.join(", ")} 중 {last.kept}</Text>
            )}
            <Text style={styles.breakdown}>
              {last.kept} {formatMods(last)} = {last.total}  vs DC {last.spec.dc}
            </Text>
            <Text style={[styles.outcome, { color: OUTCOME_COLOR[last.outcome] }]}>
              {OUTCOME_LABEL[last.outcome]} · 경험 +{last.xpGained}
            </Text>
          </>
        ) : (
          <Text style={styles.dim}>아래에서 조건을 고르고 굴려 보세요</Text>
        )}
        {history.length > 1 && (
          <Text style={styles.history}>
            최근: {history.slice(1).map((r) => `${r.kept}${shortOutcome(r.outcome)}`).join("  ")}
          </Text>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Section title="능력치">
          <ChipRow>
            {STAT_IDS.map((s) => (
              <Chip key={s} label={STAT_LABEL[s]} selected={input.stat === s} onPress={() => set("stat", s)} />
            ))}
          </ChipRow>
          <Stepper label={`${STAT_LABEL[input.stat]} 수치`} value={input.statValue} min={STAT_MIN} max={STAT_HARD_CAP} signed onChange={(v) => set("statValue", v)} />
        </Section>

        <Section title="숙련">
          <ChipRow>
            <Chip label="없음" selected={input.skill === null} onPress={() => set("skill", null)} />
            {SKILL_IDS.map((s) => (
              <Chip key={s} label={SKILL_LABEL[s]} selected={input.skill === s} onPress={() => set("skill", s)} />
            ))}
          </ChipRow>
          {input.skill && (
            <Stepper label={`${SKILL_LABEL[input.skill]} 레벨`} value={input.skillRank} min={0} max={SKILL_MAX_RANK} onChange={(v) => set("skillRank", v)} />
          )}
        </Section>

        <Section title="난이도 (DC)">
          <ChipRow>
            {DCS.map((v) => <Chip key={v} label={String(v)} selected={dc === v} onPress={() => setDc(v)} />)}
          </ChipRow>
        </Section>

        <Section title="부상">
          <ChipRow>
            {WOUNDS.map((w) => <Chip key={w} label={WOUND_LABEL[w]} selected={input.wound === w} onPress={() => set("wound", w)} />)}
          </ChipRow>
        </Section>

        <Section title="상태 · 상황">
          <ChipRow>
            <Chip label="지친 상태 (피로 8)" selected={input.fatigued} onPress={() => set("fatigued", !input.fatigued)} />
            <Chip label="굶주림 2" selected={input.hungry} onPress={() => set("hungry", !input.hungry)} />
            <Chip label="사슬 갑옷" selected={input.chainShirt} onPress={() => set("chainShirt", !input.chainShirt)} />
            <Chip label="사전 정보 (유리함)" selected={intel} onPress={() => setIntel(!intel)} />
            <Chip label="부분 성공 허용" selected={allowPartial} onPress={() => setAllowPartial(!allowPartial)} />
          </ChipRow>
        </Section>

        <Text style={styles.seed}>시드 {seed}</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <Text style={styles.summary}>
          보정 {formatSigned(total)} ({ctx.modifiers.map((m) => `${m.label} ${formatSigned(m.value)}`).join(" / ")})
        </Text>
        <Text style={styles.summary}>
          {modeSummary(mode, ctx.advantageSources, ctx.disadvantageSources)}
        </Text>
        <Pressable onPress={roll} accessibilityRole="button" style={({ pressed }) => [styles.rollButton, pressed && styles.pressed]}>
          <Text style={styles.rollText}>D20 굴리기 · 성공 확률 {Math.round(chance * 100)}%</Text>
        </Pressable>
      </View>
    </View>
  );
}

function modeSummary(mode: RollMode, adv: string[], dis: string[]): string {
  if (adv.length > 0 && dis.length > 0) return `일반 (유리함 ${adv.join(", ")} ↔ 불리함 ${dis.join(", ")} 상쇄)`;
  if (mode === "normal") return "일반";
  return `${MODE_LABEL[mode]} (${(mode === "advantage" ? adv : dis).join(", ")})`;
}

function formatMods(r: CheckResult): string {
  // 수식 표기라 0도 "+ 0"으로 쓴다 (formatSigned와 목적이 다름)
  return r.modifiers.map((m) => (m.value >= 0 ? `+ ${m.value}` : `− ${-m.value}`)).join(" ");
}

function shortOutcome(o: CheckOutcome): string {
  return { critSuccess: "★", success: "○", partial: "△", fail: "×", critFail: "☠" }[o];
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  resultBox: {
    minHeight: 190,
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
    gap: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dice: { fontFamily: fonts.bold, fontSize: 64, lineHeight: 72, fontVariant: ["tabular-nums"] },
  breakdown: { ...type.body, color: colors.text, fontVariant: ["tabular-nums"] },
  outcome: { ...type.heading },
  dim: { ...type.caption, color: colors.textDim },
  history: { ...type.caption, color: colors.textDim, marginTop: space.sm },
  scroll: { flex: 1 },
  scrollContent: { padding: space.lg, gap: space.xl },
  seed: { ...type.caption, color: colors.textFaint, textAlign: "center" },
  footer: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.xs,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  summary: { ...type.caption, color: colors.textDim },
  rollButton: {
    minHeight: TOUCH_MIN + 8,
    marginTop: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { transform: [{ scale: motion.press }] },
  rollText: { ...type.bodyStrong, color: colors.accentText },
});
