import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isVisitId, REGION_LABEL, VISIT_LABEL } from "@/core/labels";
import { combatEnemies, scenarioEvents, type ScenarioStart } from "@/core/scenario";
import type { EventCategory, EventDef, JobDef, JobId } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { Chip, ChipRow, Section, Stepper } from "@/ui/components/Controls";
import { once } from "@/ui/navigate";
import { colors, fonts, hairline, radius, space, TOUCH_MIN, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

type StartKind = ScenarioStart["kind"];
const START_LABEL: Record<StartKind, string> = { hub: "하루", evening: "저녁", event: "이벤트", combat: "전투" };
const CATEGORY_LABEL: Record<EventCategory, string> = { explore: "탐험", npc: "마을", morning: "아침", night: "밤", story: "스토리" };

const JOBS = Object.values(CONTENT.jobs).filter((j): j is JobDef => !!j?.mvp);
const SILVER = [0, 10, 30, 60, 100, 200];
const REPUTATION = [0, 4, 9, 15, 20, 30, 60];
const HP = [1, 0.5, 0.25];
/** 목록이 길면 앞에서 이만큼만 그린다 (검색으로 좁힌다) */
const LIST_MAX = 80;

/**
 * 개발용 상황 시험: 직업·날짜·은화·평판·HP를 정하고 하루·저녁·이벤트·전투 중 원하는 화면에서 바로 시작한다.
 * 가게는 "하루"에서 은화를 넉넉히 주고 마을 → 가게로 들어간다.
 * 시험에서 한 일은 저장하지 않고, 고른 상황이 끝나면 시험 끝 패널로 멈춘다. 이어하던 회차는 그대로 남는다.
 */
export default function ScenarioScreen() {
  const insets = useSafeAreaInsets();
  const startScenario = useGame((s) => s.startScenario);
  const exitScenario = useGame((s) => s.exitScenario);
  // 시험을 하다 이 화면으로 돌아오면 그 시험은 버린다 (저장된 원래 회차를 다시 불러온다)
  useFocusEffect(useCallback(() => exitScenario(), [exitScenario]));
  const [kind, setKind] = useState<StartKind>("combat");
  const [job, setJob] = useState<JobId>("farmer");
  const [day, setDay] = useState(5);
  const [silver, setSilver] = useState(30);
  const [reputation, setReputation] = useState(15);
  const [hpRatio, setHpRatio] = useState(1);
  const [eventId, setEventId] = useState<string | null>(null);
  const [category, setCategory] = useState<EventCategory | "all">("all");
  const [query, setQuery] = useState("");

  const needsEvent = kind === "event" || kind === "combat";
  const events = useMemo(() => scenarioEvents(CONTENT, kind === "combat"), [kind]);
  const shown = useMemo(() => {
    const q = query.trim();
    return events.filter((ev) => (category === "all" || ev.category === category) && (!q || ev.title.includes(q) || detailOf(ev).includes(q)));
  }, [events, category, query]);

  const ready = !needsEvent || (eventId !== null && events.some((ev) => ev.id === eventId));
  const start = () => once(() => {
    const scenario: ScenarioStart = kind === "hub" || kind === "evening" ? { kind } : { kind, eventId: eventId! };
    startScenario({ job, day, silver, reputation, hpRatio, start: scenario });
    router.replace("/game");
  });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section title="시작 화면" hint="가게는 하루에서 마을 → 가게로 들어간다.">
          <ChipRow>
            {(Object.keys(START_LABEL) as StartKind[]).map((k) => (
              <Chip key={k} label={START_LABEL[k]} selected={kind === k} onPress={() => { setKind(k); setEventId(null); }} />
            ))}
          </ChipRow>
        </Section>

        <Section title="직업">
          <ChipRow>
            {JOBS.map((j) => <Chip key={j.id} label={j.name} selected={job === j.id} onPress={() => setJob(j.id)} />)}
          </ChipRow>
        </Section>

        <Section title="상태">
          <Stepper label="날짜" value={day} min={1} max={30} onChange={setDay} />
          <Text style={styles.label}>은화</Text>
          <ChipRow>{SILVER.map((v) => <Chip key={v} label={String(v)} selected={silver === v} onPress={() => setSilver(v)} />)}</ChipRow>
          <Text style={styles.label}>평판</Text>
          <ChipRow>{REPUTATION.map((v) => <Chip key={v} label={String(v)} selected={reputation === v} onPress={() => setReputation(v)} />)}</ChipRow>
          <Text style={styles.label}>HP</Text>
          <ChipRow>{HP.map((v) => <Chip key={v} label={`${v * 100}%`} selected={hpRatio === v} onPress={() => setHpRatio(v)} />)}</ChipRow>
        </Section>

        {needsEvent && (
          <Section title={kind === "combat" ? "전투" : "이벤트"} hint={`${shown.length}개${shown.length > LIST_MAX ? `, 앞의 ${LIST_MAX}개만 보인다` : ""}`}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="제목·장소·적 이름으로 찾기"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <ChipRow>
              <Chip label="전체" selected={category === "all"} onPress={() => setCategory("all")} />
              {(Object.keys(CATEGORY_LABEL) as EventCategory[]).map((c) => (
                <Chip key={c} label={CATEGORY_LABEL[c]} selected={category === c} onPress={() => setCategory(c)} />
              ))}
            </ChipRow>
            <View>
              {shown.slice(0, LIST_MAX).map((ev) => (
                <Pressable
                  key={ev.id}
                  onPress={() => setEventId(ev.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: eventId === ev.id }}
                  style={[styles.row, eventId === ev.id && styles.rowSelected]}
                >
                  <Text style={styles.rowTitle}>{ev.title}</Text>
                  <Text style={styles.rowSub}>{detailOf(ev)}</Text>
                </Pressable>
              ))}
            </View>
          </Section>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.md }]}>
        <ActionButton primary label="이 상황으로 시작" disabled={!ready} onPress={start} />
      </View>
    </View>
  );
}

/** 목록 둘째 줄: 종류·장소, 전투면 적 */
function detailOf(ev: EventDef): string {
  const where = ev.region ? REGION_LABEL[ev.region] : ev.npc && isVisitId(ev.npc) ? VISIT_LABEL[ev.npc] : "";
  const enemies = combatEnemies(ev, CONTENT);
  return [CATEGORY_LABEL[ev.category], where, enemies.length > 0 ? enemies.join(", ") : ""].filter(Boolean).join(" · ");
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.xl },
  label: { ...type.label, color: colors.textDim },
  input: {
    minHeight: TOUCH_MIN,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  row: { paddingVertical: space.sm, paddingHorizontal: space.sm, borderBottomWidth: hairline, borderBottomColor: colors.border, gap: 2 },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowSub: { ...type.caption, color: colors.textFaint },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: colors.bg },
});
