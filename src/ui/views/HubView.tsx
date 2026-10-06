import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildCheckContext, previewCheck } from "@/core/check/modifiers";
import { skillXpRoomToday } from "@/core/check/progress";
import { actionStatus, jobOf, type ActionStatus, LESSON_SKILLS, LESSON_XP, MVP_ACTIONS, REST_HP, SOLO_TRAINING_DC } from "@/core/day/actions";
import { canTrade } from "@/core/day/town";
import { SKILL_IDS, SKILL_LABEL } from "@/core/labels";
import { FOOD_PRICE, SKILL_STAT, type CheckSpec, type DailyActionDef, type RunState, type SkillId } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { Chip, ChipRow } from "@/ui/components/Controls";
import { FeedLog } from "@/ui/components/FeedLog";
import { colors, font, space } from "@/ui/theme";

type Training = "trainSolo" | "trainLesson";

/** 오전·오후 행동을 고르는 화면. 버튼은 엄지가 닿는 아래쪽에 모은다. */
export function HubView({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const log = useGame((s) => s.log);
  const [training, setTraining] = useState<Training | null>(null);

  const choose = (def: DailyActionDef) => {
    if (def.id === "trainSolo" || def.id === "trainLesson") {
      setTraining(training === def.id ? null : def.id);
      return;
    }
    setTraining(null);
    send({ type: "chooseAction", action: def.id });
  };

  const train = (skill: SkillId) => {
    if (!training) return;
    send({ type: "chooseAction", action: training, skill });
    setTraining(null);
  };

  return (
    <View style={styles.root}>
      <FeedLog log={log} empty={`${run.player.name}의 서른 날이 시작된다. 오늘은 무엇을 할까?`} />

      <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
        {training && (
          <TrainingPicker run={run} kind={training} onPick={train} />
        )}
        <ButtonGrid>
          {MVP_ACTIONS.map((def) => {
            const isTraining = def.id === "trainSolo" || def.id === "trainLesson";
            const status = isTraining ? trainingStatus(run, def.id as Training) : actionStatus(run, def.id);
            return (
              <GridCell key={def.id}>
                <ActionButton
                  label={def.id === "work" ? jobOf(CONTENT, run).work.label : def.label}
                  detail={status.available ? actionDetail(run, def) : status.reason}
                  disabled={!status.available}
                  selected={training === def.id}
                  onPress={() => choose(def)}
                />
              </GridCell>
            );
          })}
        </ButtonGrid>
        <TownRow run={run} />
      </View>
    </View>
  );
}

function TrainingPicker({ run, kind, onPick }: { run: RunState; kind: Training; onPick: (s: SkillId) => void }) {
  const skills = kind === "trainLesson" ? LESSON_SKILLS : SKILL_IDS;
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerTitle}>{kind === "trainLesson" ? "레나에게 무엇을 배울까? (경험 +3)" : "무엇을 연습할까? (DC 10)"}</Text>
      <ChipRow>
        {skills.map((skill) => {
          const ok = actionStatus(run, kind, skill).available;
          const p = run.player.skills[skill];
          const extra = !ok ? " —" : kind === "trainSolo" ? ` ${percent(soloChance(run, skill))}` : "";
          return (
            <Chip
              key={skill}
              label={`${SKILL_LABEL[skill]} ${p.rank}${extra}`}
              selected={false}
              onPress={() => ok && onPick(skill)}
            />
          );
        })}
      </ChipRow>
    </View>
  );
}

function TownRow({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  if (!canTrade(run)) return null;
  const { silver, debt } = run.resources;
  return (
    <View style={styles.townRow}>
      <View style={styles.townCell}>
        <ActionButton
          label="식량 1 사기"
          detail={`토비의 여관 · 은화 ${FOOD_PRICE}`}
          disabled={silver < FOOD_PRICE}
          onPress={() => send({ type: "shop", op: "buyFood", qty: 1 })}
        />
      </View>
      {debt > 0 && (
        <View style={styles.townCell}>
          <ActionButton
            label="빚 갚기"
            detail={`가진 만큼 (최대 ${Math.min(silver, debt)})`}
            disabled={silver <= 0}
            onPress={() => send({ type: "shop", op: "payDebt", qty: debt })}
          />
        </View>
      )}
    </View>
  );
}

/** 행동 버튼의 두 번째 줄: 확률·비용·피로 */
function actionDetail(run: RunState, def: DailyActionDef): string {
  switch (def.id) {
    case "work": {
      const w = jobOf(CONTENT, run).work;
      return `${percent(chance(run, w.check))} · 은화 ${w.baseSilver}~${w.baseSilver + w.bonusSilver * 2} · 피로 +${w.fatigue}`;
    }
    case "trainSolo": return `숙련 고르기 · 피로 +${def.fatigue}`;
    case "trainLesson": return `은화 ${def.silverCost} · 경험 +${LESSON_XP} · 피로 +${def.fatigue}`;
    case "rest": return `피로 ${def.fatigue} · HP +${REST_HP}`;
    default: return "";
  }
}

/**
 * 훈련 버튼은 숙련을 고르기 전에 그려진다: 고를 수 있는 숙련이 하나라도 있으면 열고,
 * 없으면 오늘 경험을 더 쌓을 수 있는 숙련의 사유(은화·부상 등)를, 그것도 없으면 하루 상한을 보여 준다.
 */
function trainingStatus(run: RunState, kind: Training): ActionStatus {
  const skills = kind === "trainLesson" ? LESSON_SKILLS : SKILL_IDS;
  if (skills.some((s) => actionStatus(run, kind, s).available)) return { available: true };
  const withRoom = skills.find((s) => skillXpRoomToday(run.player, s) > 0);
  return withRoom ? actionStatus(run, kind, withRoom) : { available: false, reason: "오늘은 더 익힐 수 없다" };
}

function soloChance(run: RunState, skill: SkillId): number {
  return chance(run, { stat: SKILL_STAT[skill], skill, dc: SOLO_TRAINING_DC });
}

function chance(run: RunState, spec: CheckSpec): number {
  return previewCheck(spec, buildCheckContext(run, spec, CONTENT)).chance;
}

const percent = (p: number) => `${Math.round(p * 100)}%`;

const styles = StyleSheet.create({
  root: { flex: 1 },
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  picker: { gap: space.sm, paddingBottom: space.sm },
  pickerTitle: { color: colors.textDim, fontSize: font.sm },
  townRow: { flexDirection: "row", gap: space.sm },
  townCell: { flex: 1 },
});
