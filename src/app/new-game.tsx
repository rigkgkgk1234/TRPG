import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatSigned, SKILL_LABEL, STAT_IDS, STAT_LABEL } from "@/core/labels";
import { maxHp, type JobDef, type JobId, type SkillId } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { colors, font, radius, space, TOUCH_MIN } from "@/ui/theme";

const NAME_MAX = 8;
const MVP_JOBS = Object.values(CONTENT.jobs).filter((j): j is JobDef => !!j?.mvp);

/** 이름 입력 + 직업 선택. 카드 스와이프는 8주차 다듬기에서, 지금은 세로 목록. */
export default function NewGameScreen() {
  const insets = useSafeAreaInsets();
  const startNew = useGame((s) => s.startNew);
  const [name, setName] = useState("");
  const [job, setJob] = useState<JobId>("farmer");

  const start = () => {
    startNew(job, name);
    router.replace("/game");
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>이름</Text>
        <TextInput
          value={name}
          onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
          placeholder="보리울 주민의 이름"
          placeholderTextColor={colors.textDim}
          style={styles.input}
          returnKeyType="done"
          maxLength={NAME_MAX}
        />

        <Text style={styles.label}>직업</Text>
        {MVP_JOBS.map((j) => (
          <JobCard key={j.id} job={j} selected={job === j.id} onPress={() => setJob(j.id)} />
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <ActionButton primary label="첫날을 시작한다" onPress={start} />
      </View>
    </KeyboardAvoidingView>
  );
}

function JobCard({ job, selected, onPress }: { job: JobDef; selected: boolean; onPress: () => void }) {
  const skills = (Object.entries(job.startSkills) as [SkillId, number][])
    .map(([s, r]) => `${SKILL_LABEL[s]} ${r}`).join(" · ");
  const items = job.startItems.map((it) => CONTENT.items[it.itemId]?.name ?? it.itemId).join(", ");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.card, selected && styles.cardSelected]}
    >
      <Text style={styles.cardTitle}>{job.name}</Text>
      <Text style={styles.cardLine}>
        {STAT_IDS.map((s) => `${STAT_LABEL[s]} ${formatSigned(job.stats[s])}`).join("  ")}
      </Text>
      <Text style={styles.cardLine}>숙련 {skills} · HP {maxHp(job.stats)}</Text>
      <Text style={styles.cardDim}>은화 {job.silver} · 식량 {job.food} · 평판 {job.reputation} · {items}</Text>
      <Text style={styles.cardDim}>일: {job.work.label} (DC {job.work.check.dc}, 은화 {job.work.baseSilver}+)</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md },
  label: { color: colors.textDim, fontSize: font.sm },
  input: {
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: font.lg,
  },
  card: {
    padding: space.lg,
    gap: space.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  cardTitle: { color: colors.text, fontSize: font.lg, fontWeight: "700" },
  cardLine: { color: colors.text, fontSize: font.sm },
  cardDim: { color: colors.textDim, fontSize: font.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
