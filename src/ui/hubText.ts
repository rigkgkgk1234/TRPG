import { buildCheckContext, previewCheck } from "@/core/check/modifiers";
import { skillXpRoomToday } from "@/core/check/progress";
import { actionStatus, type ActionStatus, LESSON_SKILLS, LESSON_XP } from "@/core/day/actions";
import { EXPLORE_REGIONS } from "@/core/events/explore";
import { skillXpToNext } from "@/core/jobPerks";
import { EXERCISE_STATS, STAT_LABEL } from "@/core/labels";
import { SKILL_MAX_RANK, STAT_GROWTH_USES, type CheckSpec, type RunState, type SkillId, type StatId } from "@/core/types";
import { CONTENT } from "@/data";
import { chanceBadgeProps } from "@/ui/rollText";

/** 누르면 바로 하지 않고 고르기 패널을 여는 행동 */
export type Picking = "trainSolo" | "trainLesson" | "explore";

export const isPicking = (id: string): id is Picking => id === "trainSolo" || id === "trainLesson" || id === "explore";

/** 교습 버튼의 설명 한 줄 ["1레벨", "성장 2/6 (+3)"]: 교습 한 번에 실제로 오르는 만큼 (하루 상한 반영). 가장 높은 레벨이면 "달인" */
export function skillDetail(run: RunState, skill: SkillId): string[] {
  const { rank, xp } = run.player.skills[skill];
  const gain = Math.min(LESSON_XP, skillXpRoomToday(run.player, skill));
  const progress = rank >= SKILL_MAX_RANK ? "달인" : `성장 ${xp}/${skillXpToNext(run.player.job, rank)}${gain > 0 ? ` (+${gain})` : ""}`;
  return [`${rank}레벨`, progress];
}

/** 운동 버튼의 설명 한 줄 ["민첩 2레벨", "성장 4/15"] (성공 확률은 배지로 따로) */
export function exerciseDetail(run: RunState, stat: StatId): string[] {
  return [`${STAT_LABEL[stat]} ${run.player.stats[stat]}레벨`, `성장 ${Math.min(run.player.statUses[stat], STAT_GROWTH_USES)}/${STAT_GROWTH_USES}`];
}

/**
 * 훈련·교습·탐험 버튼은 운동·숙련·지역을 고르기 전에 그려진다: 고를 수 있는 것이 하나라도 있으면 열고,
 * 없으면 대표 사유를 보여 준다. 교습은 오늘 경험을 더 쌓을 수 있는 숙련의 사유(은화·부상 등), 그것도 없으면 하루 상한.
 */
export function pickingStatus(run: RunState, kind: Picking): ActionStatus {
  if (kind === "explore") {
    const statuses = EXPLORE_REGIONS.map((region) => actionStatus(run, CONTENT, "explore", { region }));
    return statuses.find((s) => s.available) ?? statuses[0];
  }
  if (kind === "trainSolo") {
    const statuses = EXERCISE_STATS.map((stat) => actionStatus(run, CONTENT, "trainSolo", { stat }));
    // 모두 같은 사유(부상 등)면 그 사유를, 운동마다 다르면(상한·성장 대기) 한데 묶어 말한다
    const reasons = new Set(statuses.map((s) => (s.available ? "" : s.reason)));
    return statuses.find((s) => s.available) ?? (reasons.size === 1 ? statuses[0] : { available: false, reason: "더 단련할 것 없음" });
  }
  if (LESSON_SKILLS.some((skill) => actionStatus(run, CONTENT, kind, { skill }).available)) return { available: true };
  const withRoom = LESSON_SKILLS.find((s) => skillXpRoomToday(run.player, s) > 0);
  return withRoom ? actionStatus(run, CONTENT, kind, { skill: withRoom }) : { available: false, reason: "오늘은 더 익힐 수 없음" };
}

/** 버튼 배지: "60%" 뒤에 작게 "(D20 / 9↑)" */
export function workBadge(run: RunState, spec: CheckSpec) {
  const p = previewCheck(spec, buildCheckContext(run, spec, CONTENT));
  return chanceBadgeProps(p.chance, p.need);
}
