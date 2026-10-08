import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildCheckContext, previewCheck } from "@/core/check/modifiers";
import { skillXpRoomToday } from "@/core/check/progress";
import { actionStatus, jobOf, type ActionStatus, LESSON_SKILLS, LESSON_XP, MVP_ACTIONS, REST_HP, SOLO_TRAINING_DC } from "@/core/day/actions";
import { dangerTierForDay, DEEP_FATIGUE, EXPLORE_CARDS, EXPLORE_REGIONS } from "@/core/events/explore";
import { possibleEvents } from "@/core/events/selector";
import { josa, REGION_LABEL, SKILL_IDS, SKILL_LABEL } from "@/core/labels";
import { SKILL_STAT, type CheckSpec, type DailyActionDef, type RegionId, type RunState, type SkillId } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { InfoDialog } from "@/ui/components/InfoDialog";
import { TownRow } from "@/ui/components/TownRow";
import { PickCell, PickGrid } from "@/ui/components/Controls";
import { ACTION_ICON, JOB_ICON, REGION_ICON } from "@/ui/gameIcons";
import { REGION_INFO } from "@/ui/placeInfo";
import { chanceBadgeProps } from "@/ui/rollText";
import { colors, radius, space, type } from "@/ui/theme";

type Training = "trainSolo" | "trainLesson";
/** 누르면 바로 실행하지 않고 아래 고르기 줄을 여는 행동 */
type Picking = Training | "explore";

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
  const [picking, setPicking] = useState<Picking | null>(null);
  /** 갈 곳을 고르면 바로 가지 않고 가운데 창에서 한 번 더 확인한다 */
  const [confirm, setConfirm] = useState<RegionId | null>(null);

  const choose = (def: DailyActionDef) => {
    if (isPicking(def.id)) {
      setPicking(picking === def.id ? null : def.id);
      return;
    }
    setPicking(null);
    send({ type: "chooseAction", action: def.id });
  };

  const train = (skill: SkillId) => {
    if (picking !== "trainSolo" && picking !== "trainLesson") return;
    send({ type: "chooseAction", action: picking, skill });
    setPicking(null);
  };

  const go = () => {
    if (!confirm) return;
    send({ type: "chooseAction", action: "explore", region: confirm });
    setConfirm(null);
    setPicking(null);
  };

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      {picking === "explore" ? (
        <RegionPicker run={run} onPick={setConfirm} />
      ) : picking ? (
        <TrainingPicker run={run} kind={picking} onPick={train} />
      ) : null}
      <ButtonGrid>
        {HUB_ACTIONS.map((def) => {
          const status = isPicking(def.id) ? pickingStatus(run, def.id) : actionStatus(run, CONTENT, def.id);
          return (
            <GridCell key={def.id}>
              <ActionButton
                fill
                icon={def.id === "work" ? JOB_ICON[run.player.job] : ACTION_ICON[def.id]}
                label={def.id === "work" ? jobOf(CONTENT, run).work.label : def.label}
                {...(status.available && def.id === "work" ? workBadge(run, jobOf(CONTENT, run).work.check) : {})}
                badgeBelow
                detail={status.available ? actionDetail(run, def) : status.reason}
                disabled={!status.available}
                selected={picking === def.id}
                onPress={() => choose(def)}
              />
            </GridCell>
          );
        })}
      </ButtonGrid>
      <TownRow run={run} />
      <RestButton run={run} onPress={() => choose(REST)} />
      {confirm && <ExploreDialog run={run} region={confirm} onConfirm={go} onClose={() => setConfirm(null)} />}
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

function TrainingPicker({ run, kind, onPick }: { run: RunState; kind: Training; onPick: (s: SkillId) => void }) {
  const skills = kind === "trainLesson" ? LESSON_SKILLS : SKILL_IDS;
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>
        {kind === "trainLesson" ? `레나에게 무엇을 배울까? 경험 +${LESSON_XP}` : `무엇을 연습할까? 목표 ${SOLO_TRAINING_DC}`}
      </Text>
      <PickGrid>
        {skills.map((skill) => {
          const status = actionStatus(run, CONTENT, kind, { skill });
          const badge = status.available && kind === "trainSolo" ? workBadge(run, { stat: SKILL_STAT[skill], skill, dc: SOLO_TRAINING_DC }) : {};
          return (
            <PickCell
              key={skill}
              label={`${SKILL_LABEL[skill]} ${run.player.skills[skill].rank}`}
              {...badge}
              reason={status.available ? undefined : status.reason}
              disabled={!status.available}
              onPress={() => onPick(skill)}
            />
          );
        })}
      </PickGrid>
    </View>
  );
}

/** 갈 곳 고르기. 고를 수 없는 곳도 눌러서 안내는 볼 수 있다 (안내 창의 확인 버튼이 잠긴다) */
function RegionPicker({ run, onPick }: { run: RunState; onPick: (r: RegionId) => void }) {
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>어디로 갈까?</Text>
      <PickGrid>
        {EXPLORE_REGIONS.map((region) => {
          const status = actionStatus(run, CONTENT, "explore", { region });
          return (
            <PickCell
              key={region}
              label={REGION_LABEL[region]}
              reason={status.available ? undefined : status.reason}
              onPress={() => onPick(region)}
            />
          );
        })}
      </PickGrid>
    </View>
  );
}

/** 행동 버튼의 두 번째 줄: 비용·보상·피로 (항목 단위로 줄을 바꾼다) */
function actionDetail(run: RunState, def: DailyActionDef): string[] {
  switch (def.id) {
    case "work": {
      const w = jobOf(CONTENT, run).work;
      return [`은화 ${w.baseSilver}~${w.baseSilver + w.bonusSilver * 2}`, `피로 +${w.fatigue}`];
    }
    case "trainSolo": return ["숙련 고르기", `피로 +${def.fatigue}`];
    case "explore": return [`카드 ${EXPLORE_CARDS}~${EXPLORE_CARDS + 1}장`, `피로 +${def.fatigue}~${def.fatigue + DEEP_FATIGUE}`];
    case "trainLesson": return [`은화 -${def.silverCost}`, `경험 +${LESSON_XP}`, `피로 +${def.fatigue}`];
    case "rest": return [`피로 ${def.fatigue}`, `HP +${REST_HP}`];
    default: return [];
  }
}

/**
 * 훈련·탐험 버튼은 숙련·지역을 고르기 전에 그려진다: 고를 수 있는 것이 하나라도 있으면 열고,
 * 없으면 대표 사유를 보여 준다. 훈련은 오늘 경험을 더 쌓을 수 있는 숙련의 사유(은화·부상 등), 그것도 없으면 하루 상한.
 */
function pickingStatus(run: RunState, kind: Picking): ActionStatus {
  if (kind === "explore") {
    const statuses = EXPLORE_REGIONS.map((region) => actionStatus(run, CONTENT, "explore", { region }));
    return statuses.find((s) => s.available) ?? statuses[0];
  }
  const skills = kind === "trainLesson" ? LESSON_SKILLS : SKILL_IDS;
  if (skills.some((skill) => actionStatus(run, CONTENT, kind, { skill }).available)) return { available: true };
  const withRoom = skills.find((s) => skillXpRoomToday(run.player, s) > 0);
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
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  picker: { gap: space.md, paddingBottom: space.md },
  pickerTitle: { ...type.label, color: colors.textDim },
});
