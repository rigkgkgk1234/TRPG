import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildCheckContext, previewCheck } from "@/core/check/modifiers";
import { skillXpRoomToday } from "@/core/check/progress";
import { actionStatus, EXERCISE_USES, jobOf, type ActionStatus, LESSON_SKILLS, LESSON_XP, MVP_ACTIONS, REST_HP, SOLO_TRAINING_DC } from "@/core/day/actions";
import { dangerTierForDay, DEEP_FATIGUE, EXPLORE_CARDS, EXPLORE_REGIONS } from "@/core/events/explore";
import { possibleEvents } from "@/core/events/selector";
import { EXERCISE_LABEL, EXERCISE_STATS, josa, REGION_LABEL, SKILL_LABEL, STAT_LABEL } from "@/core/labels";
import { SKILL_MAX_RANK, SKILL_STAT, SKILL_XP_CAP_PER_DAY, SKILL_XP_TO_NEXT, STAT_GROWTH_USES, type CheckSpec, type DailyActionDef, type RegionId, type RunState, type SkillId, type StatId } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { DialogFrame, DialogHead, DialogSectionTitle, InfoDialog } from "@/ui/components/InfoDialog";
import { TownRow } from "@/ui/components/TownRow";
import { PickCell, PickGrid } from "@/ui/components/Controls";
import { ACTION_ICON, JOB_ICON, REGION_ICON } from "@/ui/gameIcons";
import { REGION_INFO } from "@/ui/placeInfo";
import { chanceBadgeProps } from "@/ui/rollText";
import { colors, hairline, space, type } from "@/ui/theme";

/** 누르면 바로 실행하지 않고 아래 고르기 줄을 여는 행동 */
type Picking = "trainSolo" | "trainLesson" | "explore";

const isPicking = (id: string): id is Picking => id === "trainSolo" || id === "trainLesson" || id === "explore";

/**
 * 허브 격자의 행동. 마을 볼일은 "마을" 창에서 고르고(가게와 한곳에), 휴식은 맨 아래 한 줄을 따로 쓴다.
 * 순서: [일][훈련] [교습][탐험] / [가방][마을] / [휴식]
 */
const HUB_ACTIONS = MVP_ACTIONS.filter((a) => a.id !== "village" && a.id !== "rest");
const REST = MVP_ACTIONS.find((a) => a.id === "rest")!;

/** 오전·오후 행동을 고르는 아래 패널. 버튼은 엄지가 닿는 아래쪽에 모은다. */
export function HubPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  /** 누르면 바로 하지 않고 가운데 창을 여는 행동 (훈련·교습·탐험) */
  const [open, setOpen] = useState<Picking | null>(null);
  /** 탐험 창에서 고른 곳: 그곳 안내 창을 거쳐야 간다 */
  const [region, setRegion] = useState<RegionId | null>(null);
  const close = () => {
    setOpen(null);
    setRegion(null);
  };

  const choose = (def: DailyActionDef) => {
    if (isPicking(def.id)) setOpen(def.id);
    else send({ type: "chooseAction", action: def.id });
  };

  const lesson = (skill: SkillId) => {
    send({ type: "chooseAction", action: "trainLesson", skill });
    close();
  };

  const exercise = (stat: StatId) => {
    send({ type: "chooseAction", action: "trainSolo", stat });
    close();
  };

  const go = () => {
    if (!region) return;
    send({ type: "chooseAction", action: "explore", region });
    close();
  };

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      <ButtonGrid>
        {HUB_ACTIONS.map((def) => {
          const status = isPicking(def.id) ? pickingStatus(run, def.id) : actionStatus(run, CONTENT, def.id);
          // 일만 확률·보수를 적고, 창을 여는 훈련·교습·탐험은 이름만 크게 (잠기면 사유는 보인다)
          const plain = def.id !== "work";
          return (
            <GridCell key={def.id}>
              <ActionButton
                fill
                icon={def.id === "work" ? JOB_ICON[run.player.job] : ACTION_ICON[def.id]}
                label={def.id === "work" ? jobOf(CONTENT, run).work.label : def.label}
                {...(status.available && def.id === "work" ? workBadge(run, jobOf(CONTENT, run).work.check) : {})}
                badgeBelow
                large={plain}
                detail={!status.available ? status.reason : plain ? undefined : actionDetail(run, def)}
                disabled={!status.available}
                selected={open === def.id}
                onPress={() => choose(def)}
              />
            </GridCell>
          );
        })}
      </ButtonGrid>
      <TownRow run={run} />
      <RestButton run={run} onPress={() => choose(REST)} />
      {open === "explore" && (region
        ? <ExploreDialog run={run} region={region} onConfirm={go} onClose={() => setRegion(null)} />
        : <RegionDialog run={run} onPick={setRegion} onClose={close} />)}
      {open === "trainSolo" && <ExerciseDialog run={run} onPick={exercise} onClose={close} />}
      {open === "trainLesson" && <LessonDialog run={run} onPick={lesson} onClose={close} />}
    </View>
  );
}

function RestButton({ run, onPress }: { run: RunState; onPress: () => void }) {
  const status = actionStatus(run, CONTENT, "rest");
  return (
    <ActionButton
      icon={ACTION_ICON.rest}
      label={REST.label}
      detail={status.available ? actionDetail(run, REST) : status.reason}
      disabled={!status.available}
      onPress={onPress}
    />
  );
}

/** 갈 곳 안내 창: 어떤 곳인지, 무엇을 얻고 무엇을 조심할지, 지금 나올 수 있는 일이 몇 가지인지 */
function ExploreDialog({ run, region, onConfirm, onClose }: { run: RunState; region: RegionId; onConfirm: () => void; onClose: () => void }) {
  const info = REGION_INFO[region];
  const status = actionStatus(run, CONTENT, "explore", { region });
  const tier = dangerTierForDay(run.time.day);
  const def = MVP_ACTIONS.find((a) => a.id === "explore")!;
  return (
    <InfoDialog
      visible
      icon={REGION_ICON[region]}
      title={REGION_LABEL[region]}
      subtitle={`위험 등급 ${tier}/3, 더 깊이 들어가면 ${Math.min(3, tier + 1)}`}
      body={info?.summary ?? ""}
      facts={[`카드 ${EXPLORE_CARDS}장, 원하면 1장 더`, `피로 +${def.fatigue}~${def.fatigue + DEEP_FATIGUE}`, `지금 나올 수 있는 일 ${possibleEvents(run, CONTENT, "explore", region).length}가지`]}
      sections={info ? [{ title: "얻을 수 있는 것", items: info.gains }, { title: "조심할 것", items: info.risks }] : []}
      confirmLabel={`${josa(REGION_LABEL[region], "으로/로")} 간다`}
      lockedReason={status.available ? null : status.reason}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

/**
 * 혼자 훈련 창: 운동마다 한 줄 (어느 능력치를 단련하는지, 성장까지 남은 판정 횟수, 성공 확률).
 * 운동을 누르면 바로 한다.
 */
function ExerciseDialog({ run, onPick, onClose }: { run: RunState; onPick: (s: StatId) => void; onClose: () => void }) {
  const def = MVP_ACTIONS.find((a) => a.id === "trainSolo")!;
  return (
    <DialogFrame visible onClose={onClose} actions={<ActionButton center label="닫기" onPress={onClose} />}>
      <DialogHead
        icon={ACTION_ICON.trainSolo}
        title={def.label}
        subtitle={`판정 목표 ${SOLO_TRAINING_DC}, 피로 +${def.fatigue}. 성공하면 성장 +${EXERCISE_USES.success}, 실패해도 +${EXERCISE_USES.other} (대성공 +${EXERCISE_USES.critSuccess})`}
      />
      <View style={styles.dialogSection}>
        <View style={styles.dialogSectionHead}>
          <DialogSectionTitle>할 운동</DialogSectionTitle>
          <Text style={styles.dialogNote}>{STAT_GROWTH_USES}번 채우면 그날 저녁에 1레벨 오른다</Text>
        </View>
        <PickGrid>
          {EXERCISE_STATS.map((stat) => {
            const status = actionStatus(run, CONTENT, "trainSolo", { stat });
            return (
              <PickCell
                key={stat}
                wide
                label={EXERCISE_LABEL[stat]}
                sub={exerciseLine(run, stat)}
                {...(status.available ? workBadge(run, { stat, dc: SOLO_TRAINING_DC }) : {})}
                reason={status.available ? undefined : status.reason}
                disabled={!status.available}
                onPress={() => onPick(stat)}
              />
            );
          })}
        </PickGrid>
      </View>
    </DialogFrame>
  );
}

/**
 * 교습 창: 레나가 가르치는 숙련마다 한 줄 (어떤 능력치로 굴리는지, 현재 레벨, 다음 레벨까지의 경험).
 * 숙련을 누르면 바로 배운다.
 */
function LessonDialog({ run, onPick, onClose }: { run: RunState; onPick: (s: SkillId) => void; onClose: () => void }) {
  const def = MVP_ACTIONS.find((a) => a.id === "trainLesson")!;
  return (
    <DialogFrame visible onClose={onClose} actions={<ActionButton center label="닫기" onPress={onClose} />}>
      <DialogHead
        icon={ACTION_ICON.trainLesson}
        title={def.label}
        subtitle={`은화 ${def.silverCost}을 내고 판정 없이 성장 +${LESSON_XP}, 피로 +${def.fatigue}`}
      />
      <View style={styles.dialogSection}>
        <View style={styles.dialogSectionHead}>
          <DialogSectionTitle>레나가 가르치는 숙련</DialogSectionTitle>
          <Text style={styles.dialogNote}>하루 경험 {SKILL_XP_CAP_PER_DAY}까지</Text>
        </View>
        <PickGrid>
          {LESSON_SKILLS.map((skill) => {
            const status = actionStatus(run, CONTENT, "trainLesson", { skill });
            return (
              <PickCell
                key={skill}
                wide
                label={`${SKILL_LABEL[skill]} 훈련`}
                sub={skillLine(run, skill)}
                reason={status.available ? undefined : status.reason}
                disabled={!status.available}
                onPress={() => onPick(skill)}
              />
            );
          })}
        </PickGrid>
      </View>
    </DialogFrame>
  );
}

/** "근력 판정, 현재 1레벨" / "성장까지 2/6 (+3)" 두 줄: 교습 한 번에 실제로 오르는 만큼 (하루 상한 반영). 가장 높은 레벨이면 "달인" */
function skillLine(run: RunState, skill: SkillId): string {
  const { rank, xp } = run.player.skills[skill];
  const gain = Math.min(LESSON_XP, skillXpRoomToday(run.player, skill));
  const progress = rank >= SKILL_MAX_RANK ? "달인" : `성장까지 ${xp}/${SKILL_XP_TO_NEXT[rank]}${gain > 0 ? ` (+${gain})` : ""}`;
  return `${STAT_LABEL[SKILL_STAT[skill]]} 판정, 현재 ${rank}레벨\n${progress}`;
}

/** "민첩 판정, 현재 2레벨" / "성장까지 4/15 (성공 +5)": 성공하면 쌓이는 만큼 (성장 기준 15를 넘지 않게) */
function exerciseLine(run: RunState, stat: StatId): string {
  const uses = Math.min(run.player.statUses[stat], STAT_GROWTH_USES);
  const gain = Math.min(EXERCISE_USES.success, STAT_GROWTH_USES - uses);
  return `${STAT_LABEL[stat]} 판정, 현재 ${run.player.stats[stat]}레벨\n성장까지 ${uses}/${STAT_GROWTH_USES}${gain > 0 ? ` (성공 +${gain})` : ""}`;
}

/** 탐험 창: 갈 곳마다 한 줄. 누르면 그곳 안내 창으로 바뀌고, 고를 수 없는 곳도 안내는 볼 수 있다 */
function RegionDialog({ run, onPick, onClose }: { run: RunState; onPick: (r: RegionId) => void; onClose: () => void }) {
  const def = MVP_ACTIONS.find((a) => a.id === "explore")!;
  return (
    <DialogFrame visible onClose={onClose} actions={<ActionButton center label="닫기" onPress={onClose} />}>
      <DialogHead
        icon={ACTION_ICON.explore}
        title={def.label}
        subtitle={`카드 ${EXPLORE_CARDS}장을 보고, 원하면 1장 더. 피로 +${def.fatigue}~${def.fatigue + DEEP_FATIGUE}`}
      />
      <View style={styles.dialogSection}>
        <View style={styles.dialogSectionHead}>
          <DialogSectionTitle>갈 곳</DialogSectionTitle>
          <Text style={styles.dialogNote}>오늘 위험 등급 {dangerTierForDay(run.time.day)}/3</Text>
        </View>
        <PickGrid>
          {EXPLORE_REGIONS.map((r) => {
            const status = actionStatus(run, CONTENT, "explore", { region: r });
            return (
              <PickCell
                key={r}
                wide
                label={REGION_LABEL[r]}
                sub={REGION_INFO[r]?.tagline}
                reason={status.available ? undefined : status.reason}
                onPress={() => onPick(r)}
              />
            );
          })}
        </PickGrid>
      </View>
    </DialogFrame>
  );
}

/** 행동 버튼의 두 번째 줄: 비용·보상·피로 (항목 단위로 줄을 바꾼다) */
function actionDetail(run: RunState, def: DailyActionDef): string[] {
  switch (def.id) {
    case "work": {
      const w = jobOf(CONTENT, run).work;
      return [`은화 ${w.baseSilver}~${w.baseSilver + w.bonusSilver * 2}`, `피로 +${w.fatigue}`];
    }
    case "rest": return [`피로 ${def.fatigue}`, `HP +${REST_HP}`];
    default: return [];
  }
}

/**
 * 훈련·교습·탐험 버튼은 운동·숙련·지역을 고르기 전에 그려진다: 고를 수 있는 것이 하나라도 있으면 열고,
 * 없으면 대표 사유를 보여 준다. 교습은 오늘 경험을 더 쌓을 수 있는 숙련의 사유(은화·부상 등), 그것도 없으면 하루 상한.
 */
function pickingStatus(run: RunState, kind: Picking): ActionStatus {
  if (kind === "explore") {
    const statuses = EXPLORE_REGIONS.map((region) => actionStatus(run, CONTENT, "explore", { region }));
    return statuses.find((s) => s.available) ?? statuses[0];
  }
  if (kind === "trainSolo") {
    const statuses = EXERCISE_STATS.map((stat) => actionStatus(run, CONTENT, "trainSolo", { stat }));
    // 모두 같은 사유(부상 등)면 그 사유를, 운동마다 다르면(상한·성장 대기) 한데 묶어 말한다
    const reasons = new Set(statuses.map((s) => (s.available ? "" : s.reason)));
    return statuses.find((s) => s.available) ?? (reasons.size === 1 ? statuses[0] : { available: false, reason: "지금은 더 단련할 게 없다" });
  }
  if (LESSON_SKILLS.some((skill) => actionStatus(run, CONTENT, kind, { skill }).available)) return { available: true };
  const withRoom = LESSON_SKILLS.find((s) => skillXpRoomToday(run.player, s) > 0);
  return withRoom ? actionStatus(run, CONTENT, kind, { skill: withRoom }) : { available: false, reason: "오늘은 더 익힐 수 없다" };
}

/** 버튼 배지: "60%" 뒤에 작게 "(D20 / 9↑)" */
function workBadge(run: RunState, spec: CheckSpec) {
  const p = previewCheck(spec, buildCheckContext(run, spec, CONTENT));
  return chanceBadgeProps(p.chance, p.need);
}


const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderColor: colors.borderStrong,
  },
  dialogSection: { gap: space.sm },
  dialogSectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  dialogNote: { ...type.caption, color: colors.textFaint },
});
