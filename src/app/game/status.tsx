import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatSigned, SKILL_IDS, SKILL_LABEL, STAT_IDS, STAT_LABEL, WOUND_LABEL } from "@/core/labels";
import { SKILL_MAX_RANK, SKILL_XP_CAP_PER_DAY, SKILL_XP_TO_NEXT, STAT_GROWTH_USES, maxHp } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { Section } from "@/ui/components/Controls";
import { colors, radius, space, type } from "@/ui/theme";

/** 상태 모달: 능력치(성장까지 남은 사용 횟수), 숙련 XP, 흔적. 2주차에는 읽기 전용. */
export default function StatusScreen() {
  const insets = useSafeAreaInsets();
  const run = useGame((s) => s.run);
  if (!run) return null;
  const { player: p, resources: r } = run;
  const job = CONTENT.jobs[p.job];

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.head}>
        <Text style={styles.title}>{p.name}</Text>
        <Text style={styles.dim}>{job?.name}</Text>
      </View>
      <View style={styles.figures}>
        <Figure label="HP" value={`${p.hp}/${maxHp(p.stats)}`} />
        <Figure label="부상" value={WOUND_LABEL[p.wound.level]} />
        <Figure label="평판" value={String(p.reputation)} />
        <Figure label="빚" value={String(r.debt)} />
      </View>

      <Section title="능력치" hint={`판정에 ${STAT_GROWTH_USES}번 쓰면 성장 굴림`}>
        {STAT_IDS.map((s) => (
          <Row key={s} label={STAT_LABEL[s]} value={formatSigned(p.stats[s])}
            progress={Math.min(1, p.statUses[s] / STAT_GROWTH_USES)} note={`${p.statUses[s]}/${STAT_GROWTH_USES}`} />
        ))}
      </Section>

      <Section title="숙련" hint={`숙련마다 하루에 경험 ${SKILL_XP_CAP_PER_DAY}까지`}>
        {SKILL_IDS.map((s) => {
          const sk = p.skills[s];
          const maxed = sk.rank >= SKILL_MAX_RANK;
          const need = maxed ? 0 : SKILL_XP_TO_NEXT[sk.rank];
          const today = p.skillXpToday[s] ?? 0;
          return (
            <Row key={s} label={SKILL_LABEL[s]} value={`${sk.rank}등급`}
              progress={maxed ? 1 : sk.xp / need}
              note={maxed ? "달인" : `${sk.xp}/${need}${today ? `, 오늘 +${today}` : ""}`} />
          );
        })}
      </Section>

      <Section title="흔적">
        {p.traits.length === 0
          ? <Text style={styles.dim}>아직 없다.</Text>
          : p.traits.map((t) => (
            <Text key={t} style={styles.trait}>
              {CONTENT.traits[t]?.name ?? t}{"  "}<Text style={styles.dim}>{CONTENT.traits[t]?.description}</Text>
            </Text>
          ))}
      </Section>
    </ScrollView>
  );
}

function Row({ label, value, progress, note }: { label: string; value: string; progress: number; note: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
      <Text style={styles.note}>{note}</Text>
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
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.xxl },
  head: { gap: 2 },
  title: { ...type.title, color: colors.text },
  dim: { ...type.caption, color: colors.textDim },
  figures: { flexDirection: "row", padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface },
  figure: { flex: 1, gap: 2 },
  figureValue: { ...type.number, color: colors.text },
  figureLabel: { ...type.caption, color: colors.textFaint },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 32 },
  label: { ...type.body, color: colors.text, width: 56 },
  value: { ...type.bodyStrong, color: colors.text, width: 44, fontVariant: ["tabular-nums"] },
  track: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.accent },
  note: { ...type.caption, color: colors.textFaint, minWidth: 84, textAlign: "right", fontVariant: ["tabular-nums"] },
  trait: { ...type.body, color: colors.text },
});
