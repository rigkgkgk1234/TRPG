import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatSigned, SKILL_IDS, SKILL_LABEL, STAT_IDS, STAT_LABEL, WOUND_LABEL } from "@/core/labels";
import { SKILL_MAX_RANK, SKILL_XP_CAP_PER_DAY, SKILL_XP_TO_NEXT, STAT_GROWTH_USES, maxHp } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { Section } from "@/ui/components/Controls";
import { colors, font, radius, space } from "@/ui/theme";

/** 상태 모달: 능력치(성장까지 남은 사용 횟수), 숙련 XP, 흔적. 2주차에는 읽기 전용. */
export default function StatusScreen() {
  const insets = useSafeAreaInsets();
  const run = useGame((s) => s.run);
  if (!run) return null;
  const { player: p, resources: r } = run;
  const job = CONTENT.jobs[p.job];

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <Text style={styles.title}>{p.name} · {job?.name}</Text>
      <Text style={styles.dim}>
        HP {p.hp}/{maxHp(p.stats)} · 부상 {WOUND_LABEL[p.wound.level]} · 평판 {p.reputation} · 빚 {r.debt}
      </Text>

      <Section title={`능력치 — 판정에 ${STAT_GROWTH_USES}번 쓰면 성장 굴림`}>
        {STAT_IDS.map((s) => (
          <Row key={s} label={STAT_LABEL[s]} value={formatSigned(p.stats[s])}
            progress={Math.min(1, p.statUses[s] / STAT_GROWTH_USES)} note={`${p.statUses[s]}/${STAT_GROWTH_USES}`} />
        ))}
      </Section>

      <Section title={`숙련 — 하루에 숙련마다 경험 ${SKILL_XP_CAP_PER_DAY}까지`}>
        {SKILL_IDS.map((s) => {
          const sk = p.skills[s];
          const maxed = sk.rank >= SKILL_MAX_RANK;
          const need = maxed ? 0 : SKILL_XP_TO_NEXT[sk.rank];
          const today = p.skillXpToday[s] ?? 0;
          return (
            <Row key={s} label={SKILL_LABEL[s]} value={`${sk.rank}등급`}
              progress={maxed ? 1 : sk.xp / need}
              note={maxed ? "달인" : `${sk.xp}/${need}${today ? ` · 오늘 +${today}` : ""}`} />
          );
        })}
      </Section>

      <Section title="흔적">
        {p.traits.length === 0
          ? <Text style={styles.dim}>아직 없다.</Text>
          : p.traits.map((t) => (
            <Text key={t} style={styles.trait}>
              「{CONTENT.traits[t]?.name ?? t}」 <Text style={styles.dim}>{CONTENT.traits[t]?.description}</Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.xl },
  title: { color: colors.text, fontSize: font.xl, fontWeight: "700" },
  dim: { color: colors.textDim, fontSize: font.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 28 },
  label: { color: colors.text, fontSize: font.md, width: 52 },
  value: { color: colors.text, fontSize: font.md, fontWeight: "600", width: 44, fontVariant: ["tabular-nums"] },
  track: { flex: 1, height: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: colors.accent },
  note: { color: colors.textDim, fontSize: font.sm, minWidth: 84, textAlign: "right", fontVariant: ["tabular-nums"] },
  trait: { color: colors.text, fontSize: font.md },
});
