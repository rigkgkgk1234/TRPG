import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ENDING_LABEL, JOB_LABEL, SKILL_LABEL } from "@/core/labels";
import { epitaph } from "@/core/story/ending";
import type { EndingId } from "@/core/types";
import { CONTENT } from "@/data";
import { useMeta } from "@/store/metaStore";
import { Section } from "@/ui/components/Controls";
import { colors, radius, space, type } from "@/ui/theme";

const ENDINGS: EndingId[] = ["shield_of_village", "flee_together", "rowen_spearman", "survivor", "debtor", "death"];

/** 기록: 본 엔딩, 모은 흔적, 지난 회차(묘비문). 다음 회차를 강하게 만들지는 않는다. (SYSTEM_SPEC 7-3) */
export default function RecordsScreen() {
  const insets = useSafeAreaInsets();
  const meta = useMeta((s) => s.meta);
  const traits = Object.values(CONTENT.traits);

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <Section title="엔딩" hint={`${ENDINGS.length}개 중 ${meta.endingsSeen.length}개를 보았다. 지금까지 ${meta.totalRuns}회차를 마쳤다.`}>
        <View style={styles.grid}>
          {ENDINGS.map((id) => {
            const seen = meta.endingsSeen.includes(id);
            return (
              <View key={id} style={[styles.tile, !seen && styles.unseen]}>
                <Text style={[styles.tileText, seen && { color: colors.crit }]}>{seen ? ENDING_LABEL[id] : "아직 모른다"}</Text>
              </View>
            );
          })}
        </View>
      </Section>

      <Section title="흔적" hint={`${traits.length}개 중 ${meta.traitsSeen.length}개를 얻어 보았다.`}>
        {traits.map((t) => {
          const seen = meta.traitsSeen.includes(t.id);
          return (
            <Text key={t.id} style={styles.line}>
              {seen ? `「${t.name}」` : "「?」"}
              <Text style={styles.dim}>{seen ? `  ${t.description}` : "  아직 얻지 못했다"}</Text>
            </Text>
          );
        })}
      </Section>

      <Section title="지난 회차">
        {meta.history.length === 0 ? (
          <Text style={styles.dim}>아직 끝낸 회차가 없다.</Text>
        ) : (
          <View>
            {meta.history.map((r) => (
              <View key={r.runId} style={styles.row}>
                <View style={styles.rowHead}>
                  <Text style={styles.rowTitle}>{r.ending === "abandoned" ? "포기" : ENDING_LABEL[r.ending]}</Text>
                  <Text style={styles.dim}>{JOB_LABEL[r.job]}, {r.daysSurvived}일차</Text>
                </View>
                {r.death && <Text style={styles.line}>{epitaph(r)}</Text>}
                {r.bestSkill && <Text style={styles.dim}>가장 많이 익힌 숙련: {SKILL_LABEL[r.bestSkill.skill]} {r.bestSkill.rank}등급</Text>}
              </View>
            ))}
          </View>
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.xxl },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: { width: "48.5%", minHeight: 56, justifyContent: "center", padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface },
  unseen: { opacity: 0.5 },
  tileText: { ...type.bodyStrong, color: colors.textDim },
  line: { ...type.body, color: colors.text },
  dim: { ...type.caption, color: colors.textDim },
  row: { gap: 2, paddingVertical: space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  rowTitle: { ...type.bodyStrong, color: colors.text },
});
