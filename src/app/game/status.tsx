import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SKILL_IDS, SKILL_LABEL, SKILL_USE_NOTE, STAT_GROWTH_NOTE, STAT_IDS, STAT_LABEL, WOUND_LABEL } from "@/core/labels";
import { SKILL_MAX_RANK, SKILL_XP_TO_NEXT, STAT_GROWTH_USES, maxHp } from "@/core/types";
import { CONTENT } from "@/data";
import { useShownRun } from "@/store/gameStore";
import { Section } from "@/ui/components/Controls";
import { colors, hairline, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

/** 상태 모달: 능력치(성장까지 남은 사용 횟수), 숙련 XP, 흔적. 한 줄은 [이름 · 막대 · 진행 · 레벨] 순서로, 레벨은 맨 오른쪽. */
export default function StatusScreen() {
  const insets = useSafeAreaInsets();
  // 주사위가 구르는 동안 열어도 결과가 먼저 보이지 않게, 화면에 그려진 상태를 쓴다
  const run = useShownRun();
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
        <Figure label="명성" value={String(p.fame)} />
        <Figure label="빚" value={String(r.debt)} />
      </View>

      <Section title="능력치" hint={STAT_GROWTH_NOTE}>
        {STAT_IDS.map((s) => (
          <Row key={s} label={STAT_LABEL[s]} value={`${p.stats[s]}레벨`}
            progress={Math.min(1, p.statUses[s] / STAT_GROWTH_USES)} note={`${p.statUses[s]}/${STAT_GROWTH_USES}`} />
        ))}
      </Section>

      <Section title="숙련" hint={SKILL_USE_NOTE}>
        {SKILL_IDS.map((s) => {
          const sk = p.skills[s];
          const maxed = sk.rank >= SKILL_MAX_RANK;
          const need = maxed ? 0 : SKILL_XP_TO_NEXT[sk.rank];
          return (
            <Row key={s} label={SKILL_LABEL[s]} value={`${sk.rank}레벨`}
              progress={maxed ? 1 : sk.xp / need}
              note={maxed ? "달인" : `${sk.xp}/${need}`} />
          );
        })}
      </Section>

      <Section title="흔적">
        {p.traits.length === 0
          ? <Text style={styles.dim}>아직 없다.</Text>
          : p.traits.map((t) => (
            <View key={t} style={styles.traitRow}>
              <Text style={styles.trait}>「{CONTENT.traits[t]?.name ?? t}」</Text>
              <Text style={styles.dim}>{CONTENT.traits[t]?.description}</Text>
            </View>
          ))}
      </Section>
    </ScrollView>
  );
}

/** 한 줄: "근력 2레벨(4/15)" 다음에 막대. 괄호 안 진행은 작고 흐리게 */
function Row({ label, value, progress, note }: { label: string; value: string; progress: number; note: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.name}>
        {label} <Text style={styles.value}>{value}</Text><Text style={styles.note}>({note})</Text>
      </Text>
      <View style={styles.track}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.xxl },
  head: { gap: 2 },
  title: { ...type.title, color: colors.text },
  dim: { ...type.caption, color: colors.textDim },
  figures: { flexDirection: "row", paddingVertical: space.lg, borderTopWidth: hairline, borderBottomWidth: hairline, borderColor: colors.border },
  figure: { flex: 1, gap: 2 },
  figureValue: { ...type.caption, color: colors.text, textAlign: "center" },
  traitRow: { gap: 2 },
  figureLabel: { ...type.number, fontVariant: undefined, color: colors.text, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 32 },
  // 막대가 줄마다 같은 곳에서 시작하도록 글자 칸 폭은 고정 ("말솜씨 -1레벨(0/15)"가 들어가는 폭)
  // 이름과 레벨은 같은 색, 같은 굵기 ("근력 2레벨"이 한 덩어리로 읽히게)
  name: { ...type.bodyStrong, color: colors.text, width: 148 },
  value: { ...type.bodyStrong, color: colors.text, fontVariant: ["tabular-nums"] },
  track: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.accent },
  note: { ...type.caption, color: colors.textFaint, fontVariant: ["tabular-nums"] },
  trait: { ...type.body, color: colors.text },
});
