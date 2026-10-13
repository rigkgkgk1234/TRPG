import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SKILL_LABEL, STAT_IDS, STAT_LABEL } from "@/core/labels";
import { maxHp, type JobDef, type JobId, type SkillId } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { JOB_ICON } from "@/ui/gameIcons";
import { JOB_PERK } from "@/ui/jobText";
import { colors, fonts, hairline, icon, radius, space, TOUCH_MIN, type } from "@/ui/theme";
import { once } from "@/ui/navigate";
import { Text } from "@/ui/Text";

const NAME_MAX = 8;
const MVP_JOBS = Object.values(CONTENT.jobs).filter((j): j is JobDef => !!j?.mvp);

/** 이름 입력 + 직업 선택. 직업이 많아 세로 목록은 이름·특징 한 줄만 보이고, 고른 카드만 능력치·시작값을 펼친다. */
export default function NewGameScreen() {
  const insets = useSafeAreaInsets();
  const startNew = useGame((s) => s.startNew);
  // 진행 중인 회차가 있으면 새로 시작하는 순간 덮어쓴다 (아이언맨: 슬롯은 하나뿐, SYSTEM_SPEC 7-3)
  const current = useGame((s) => (s.run && !s.run.ending ? `${s.run.player.name}, ${s.run.time.day}일차` : null));
  const [name, setName] = useState("");
  const [job, setJob] = useState<JobId | null>(null);
  const [focused, setFocused] = useState(false);

  // 두 번 누르면 회차가 두 번 만들어지고, 첫 회차가 "포기"로 기록된다 → 한 번만
  const start = () => once(() => {
    if (!job) return;
    startNew(job, name);
    router.replace("/game");
  });

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.label}>이름</Text>
          <TextInput
            value={name}
            onChangeText={(t) => setName(t.slice(0, NAME_MAX))}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="이름 없는 주민"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, focused && styles.inputFocused]}
            returnKeyType="done"
            maxLength={NAME_MAX}
          />
          <Text style={styles.help}>{NAME_MAX}글자까지</Text>
        </View>

        {/* 카드 밖 빈 곳(화면 아래 끝까지)을 누르면 고른 직업을 푼다. 웹에서는 클릭이 위로 올라오므로 이름 칸은 이 밖에 둔다 */}
        <Pressable style={[styles.field, styles.jobField]} onPress={() => setJob(null)} accessible={false}>
          <Text style={styles.label}>직업</Text>
          <View style={styles.jobs}>
            {MVP_JOBS.map((j) => (
              <JobCard key={j.id} job={j} selected={job === j.id} onPress={() => setJob(j.id)} />
            ))}
          </View>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        {current && (
          <Text style={styles.warn}>
            진행 중인 회차({current})가 있다. 새로 시작하면 그 회차는 사라진다.
          </Text>
        )}
        <ActionButton primary label={current ? "포기하고 새로 시작한다" : "첫날을 시작한다"} disabled={!job} onPress={start} />
      </View>
    </KeyboardAvoidingView>
  );
}

function JobCard({ job, selected, onPress }: { job: JobDef; selected: boolean; onPress: () => void }) {
  const JobIcon = JOB_ICON[job.id];
  const skills = (Object.entries(job.startSkills) as [SkillId, number][])
    .map(([s, r]) => `${SKILL_LABEL[s]} ${r}레벨`).join(", ") || "없음";
  const items = job.startItems.map((it) => `${CONTENT.items[it.itemId]?.name ?? it.itemId}${it.qty > 1 ? ` ${it.qty}개` : ""}`).join(", ") || "없음";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.jobIcon, selected && styles.jobIconSelected]}>
          <JobIcon size={icon.md} weight={icon.weight} color={selected ? colors.accentText : colors.textDim} />
        </View>
        <View style={styles.cardHeadText}>
          <Text style={styles.cardTitle}>{job.name}</Text>
          <Text style={styles.cardSub}>{JOB_PERK[job.id]}</Text>
        </View>
      </View>
      {selected ? <JobDetail job={job} skills={skills} items={items} /> : null}
    </Pressable>
  );
}

function JobDetail({ job, skills, items }: { job: JobDef; skills: string; items: string }) {
  return (
    <>

      <View style={styles.statRow}>
        {STAT_IDS.map((s) => (
          <View key={s} style={styles.stat}>
            <Text style={[styles.statValue, job.stats[s] < 0 && { color: colors.fail }, job.stats[s] > 0 && { color: colors.text }]}>
              {job.stats[s]}<Text style={styles.statUnit}>레벨</Text>
            </Text>
            <Text style={styles.statLabel}>{STAT_LABEL[s]}</Text>
          </View>
        ))}
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{maxHp(job.stats)}</Text>
          <Text style={styles.statLabel}>HP</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={styles.metaLine}><Text style={styles.metaKey}>숙련  </Text>{skills}</Text>
        <Text style={styles.metaLine}>
          <Text style={styles.metaKey}>시작  </Text>은화 {job.silver}, 식량 {job.food}, 평판 {job.reputation}
        </Text>
        <Text style={styles.metaLine}><Text style={styles.metaKey}>장비  </Text>{items}</Text>
        <Text style={styles.metaLine}><Text style={styles.metaKey}>일하기  </Text>{job.work.label}, 목표 {job.work.check.dc}</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, padding: space.lg, gap: space.xl, paddingBottom: space.xxl },
  field: { gap: space.sm },
  // 양옆·아래 여백까지 눌리게 바깥 여백을 이 칸 안으로 들인다
  jobField: { flexGrow: 1, marginHorizontal: -space.lg, marginBottom: -space.xxl, paddingHorizontal: space.lg, paddingBottom: space.xxl },
  label: { ...type.label, color: colors.textDim },
  help: { ...type.caption, color: colors.textFaint },
  input: {
    minHeight: TOUCH_MIN + 4,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 18,
  },
  inputFocused: { borderColor: colors.accent },
  jobs: { gap: space.md },
  card: {
    padding: space.lg,
    gap: space.lg,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
  },
  cardSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pressed: { transform: [{ scale: 0.99 }] },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  jobIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  jobIconSelected: { backgroundColor: colors.accent },
  cardHeadText: { flex: 1 },
  cardTitle: { ...type.heading, color: colors.text },
  cardSub: { ...type.caption, color: colors.textDim },
  statRow: { flexDirection: "row" },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  statValue: { ...type.number, fontSize: 17, color: colors.textFaint },
  statLabel: { ...type.caption, color: colors.textFaint },
  statUnit: { fontSize: 11 },
  meta: { gap: space.xs },
  metaLine: { ...type.caption, color: colors.textDim },
  metaKey: { fontFamily: fonts.semibold, color: colors.textFaint },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, backgroundColor: colors.bg },
  warn: { ...type.caption, color: colors.partial },
});
