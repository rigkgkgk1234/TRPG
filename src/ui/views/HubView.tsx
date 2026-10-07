import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildCheckContext, previewCheck } from "@/core/check/modifiers";
import { skillXpRoomToday } from "@/core/check/progress";
import { actionStatus, jobOf, type ActionStatus, LESSON_SKILLS, LESSON_XP, MVP_ACTIONS, REST_HP, SOLO_TRAINING_DC } from "@/core/day/actions";
import { DEEP_FATIGUE, EXPLORE_CARDS, EXPLORE_REGIONS } from "@/core/events/explore";
import { NPC_IDS, NPC_LABEL, REGION_LABEL, SKILL_IDS, SKILL_LABEL, type NpcId } from "@/core/labels";
import { SKILL_STAT, type CheckSpec, type DailyActionDef, type RegionId, type RunState, type SkillId } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { TownRow } from "@/ui/components/TownRow";
import { Chip, ChipRow } from "@/ui/components/Controls";
import { ACTION_ICON, JOB_ICON } from "@/ui/gameIcons";
import { colors, radius, space, type } from "@/ui/theme";

type Training = "trainSolo" | "trainLesson";
/** 누르면 바로 실행하지 않고 아래 고르기 줄을 여는 행동 */
type Picking = Training | "explore" | "village";

const isPicking = (id: string): id is Picking => id === "trainSolo" || id === "trainLesson" || id === "explore" || id === "village";

/** 오전·오후 행동을 고르는 아래 패널. 버튼은 엄지가 닿는 아래쪽에 모은다. */
export function HubPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const [picking, setPicking] = useState<Picking | null>(null);

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

  const explore = (region: RegionId) => {
    send({ type: "chooseAction", action: "explore", region });
    setPicking(null);
  };

  const visit = (npc: NpcId) => {
    send({ type: "chooseAction", action: "village", npc });
    setPicking(null);
  };

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      {picking === "explore" ? (
        <RegionPicker run={run} onPick={explore} />
      ) : picking === "village" ? (
        <NpcPicker run={run} onPick={visit} />
      ) : picking ? (
        <TrainingPicker run={run} kind={picking} onPick={train} />
      ) : null}
      <ButtonGrid>
        {MVP_ACTIONS.map((def) => {
          const status = isPicking(def.id) ? pickingStatus(run, def.id) : actionStatus(run, CONTENT, def.id);
          return (
            <GridCell key={def.id}>
              <ActionButton
                icon={def.id === "work" ? JOB_ICON[run.player.job] : ACTION_ICON[def.id]}
                label={def.id === "work" ? jobOf(CONTENT, run).work.label : def.label}
                badge={status.available && def.id === "work" ? percent(chance(run, jobOf(CONTENT, run).work.check)) : undefined}
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
    </View>
  );
}

function TrainingPicker({ run, kind, onPick }: { run: RunState; kind: Training; onPick: (s: SkillId) => void }) {
  const skills = kind === "trainLesson" ? LESSON_SKILLS : SKILL_IDS;
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>
        {kind === "trainLesson" ? `레나에게 무엇을 배울까? 경험 +${LESSON_XP}` : `무엇을 연습할까? 목표 ${SOLO_TRAINING_DC}`}
      </Text>
      <ChipRow>
        {skills.map((skill) => {
          const ok = actionStatus(run, CONTENT, kind, { skill }).available;
          const p = run.player.skills[skill];
          const extra = ok && kind === "trainSolo" ? `  ${percent(soloChance(run, skill))}` : "";
          return (
            <Chip
              key={skill}
              label={`${SKILL_LABEL[skill]} ${p.rank}${extra}`}
              selected={false}
              disabled={!ok}
              onPress={() => onPick(skill)}
            />
          );
        })}
      </ChipRow>
    </View>
  );
}

function RegionPicker({ run, onPick }: { run: RunState; onPick: (r: RegionId) => void }) {
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>어디로 갈까? 카드 {EXPLORE_CARDS}장을 보고, 원하면 더 깊이 들어간다</Text>
      <ChipRow>
        {EXPLORE_REGIONS.map((region) => {
          const status = actionStatus(run, CONTENT, "explore", { region });
          return (
            <Chip
              key={region}
              label={status.available ? REGION_LABEL[region] : `${REGION_LABEL[region]} (${status.reason})`}
              selected={false}
              disabled={!status.available}
              onPress={() => onPick(region)}
            />
          );
        })}
      </ChipRow>
    </View>
  );
}

function NpcPicker({ run, onPick }: { run: RunState; onPick: (n: NpcId) => void }) {
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>누구를 찾아갈까?</Text>
      <ChipRow>
        {NPC_IDS.map((npc) => {
          const status = actionStatus(run, CONTENT, "village", { npc });
          return (
            <Chip
              key={npc}
              label={status.available ? NPC_LABEL[npc] : `${NPC_LABEL[npc]} (${status.reason})`}
              selected={false}
              disabled={!status.available}
              onPress={() => onPick(npc)}
            />
          );
        })}
      </ChipRow>
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
    case "village": return ["사람 고르기", "피로 없음"];
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
  if (kind === "village") {
    const statuses = NPC_IDS.map((npc) => actionStatus(run, CONTENT, "village", { npc }));
    return statuses.find((s) => s.available) ?? statuses[0];
  }
  const skills = kind === "trainLesson" ? LESSON_SKILLS : SKILL_IDS;
  if (skills.some((skill) => actionStatus(run, CONTENT, kind, { skill }).available)) return { available: true };
  const withRoom = skills.find((s) => skillXpRoomToday(run.player, s) > 0);
  return withRoom ? actionStatus(run, CONTENT, kind, { skill: withRoom }) : { available: false, reason: "오늘은 더 익힐 수 없다" };
}

function soloChance(run: RunState, skill: SkillId): number {
  return chance(run, { stat: SKILL_STAT[skill], skill, dc: SOLO_TRAINING_DC });
}

function chance(run: RunState, spec: CheckSpec): number {
  return previewCheck(spec, buildCheckContext(run, spec, CONTENT)).chance;
}

const percent = (p: number) => `${Math.round(p * 100)}%`;

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
