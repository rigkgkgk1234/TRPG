import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import { performCheck } from "../check/perform";
import { gainSkillXp, skillXpRoomToday } from "../check/progress";
import { conditionReason, evalCondition } from "../events/conditions";
import { EXPLORE_REGIONS } from "../events/explore";
import { startExplore, startVillageVisit } from "../events/runner";
import { eventPool } from "../events/selector";
import { EXERCISE_LABEL, isExerciseStat, isNpcId, josa, SKILL_LABEL, STAT_LABEL, type NpcId } from "../labels";
import {
  DAILY_ACTIONS,
  SKILL_MAX_RANK,
  STAT_GROWTH_USES,
  STAT_NATURAL_CAP,
  type DailyActionDef,
  type DailyActionId,
  type RegionId,
  type RunState,
  type SkillId,
  type StatId,
} from "../types";
import { changeFatigue, changeFood, changeHp, changeSilver, setWound } from "./resources";
import { advanceSlot } from "./time";

/** 레나가 가르치는 숙련 (SYSTEM_SPEC 6-2) */
export const LESSON_SKILLS: readonly SkillId[] = ["blade", "blunt", "bow", "guard"];
export const SOLO_TRAINING_DC = 10;
/** 혼자 훈련은 몸을 단련하는 운동: 고른 능력치의 판정 횟수(성장 굴림용)를 늘린다. 말솜씨는 혼자 늘릴 수 없다. */
/** 운동 한 번에 쌓이는 판정 횟수 (판정 자체의 1회 포함): 대성공 6, 성공 5, 그 밖 3 */
export const EXERCISE_USES = { critSuccess: 6, success: 5, other: 3 } as const;
export const LESSON_XP = 3;
export const REST_HP = 2;
/** 경상은 휴식 2회로 낫는다 */
export const LIGHT_WOUND_RESTS = 2;
/** 대장간 일 대실패의 화상: HP -2, 다친 데가 없으면 경상 (SYSTEM_SPEC 6-2) */
const SMITH_BURN_HP = 2;
/** 대실패에 별도 분기가 없을 때의 추가 페널티 (SYSTEM_SPEC 2-4) */
const CRIT_FAIL_FATIGUE = 1;

/** 구현된 행동. 로웬 다녀오기는 확장. */
const IMPLEMENTED: ReadonlySet<DailyActionId> = new Set(["work", "trainSolo", "trainLesson", "explore", "rest", "village"]);

export const MVP_ACTIONS: readonly DailyActionDef[] = DAILY_ACTIONS.filter((a) => a.mvp);

/** 교습받을 숙련 / 운동할 능력치 / 탐험할 지역 / 찾아갈 사람 */
export interface ActionTarget { skill?: SkillId; stat?: StatId; region?: RegionId; npc?: string }

export type ActionStatus = { available: true } | { available: false; reason: string };

/** 허브의 행동 버튼 활성 여부와 잠김 사유. dispatch도 같은 함수로 검증하므로 UI와 엔진이 어긋나지 않는다. */
export function actionStatus(
  run: RunState,
  content: Pick<ContentDB, "events" | "items" | "traits">,
  id: DailyActionId,
  { skill, stat, region, npc }: ActionTarget = {},
): ActionStatus {
  const def = DAILY_ACTIONS.find((a) => a.id === id);
  if (!def || !def.mvp) return locked("아직 갈 수 없다");
  if (!IMPLEMENTED.has(id)) return locked("준비 중");
  if (run.ending || run.activeEvent || run.combat) return locked("지금은 할 수 없다");
  if (run.time.phase !== "am" && run.time.phase !== "pm") return locked("오늘은 이미 저물었다");

  for (const c of def.conditions) {
    if (!evalCondition(c, run)) return locked(conditionReason(c, content) ?? "지금은 할 수 없다");
  }

  if (id === "explore") {
    if (!region) return locked("갈 곳을 고른다");
    if (!EXPLORE_REGIONS.includes(region)) return locked("그곳은 갈 수 없다");
    if (eventPool(content, "explore", region).length === 0) return locked("준비 중");
  }

  if (id === "village") {
    if (!npc) return locked("찾아갈 사람을 고른다");
    if (!isNpcId(npc)) return locked("그런 사람은 없다");
    if (eventPool(content, "npc", undefined, npc).length === 0) return locked("준비 중");
  }

  if (id === "trainSolo") {
    if (!stat) return locked("할 운동을 고른다");
    if (!isExerciseStat(stat)) return locked("그런 운동은 없다");
    if (run.player.stats[stat] >= STAT_NATURAL_CAP) return locked(`${josa(STAT_LABEL[stat], "은/는")} 더 단련해도 늘지 않는다`);
    if (run.player.statUses[stat] >= STAT_GROWTH_USES) return locked("저녁에 성장 기회가 온다");
  }

  if (id === "trainLesson") {
    if (!skill) return locked("훈련할 숙련을 고른다");
    if (!Object.hasOwn(run.player.skills, skill)) return locked("그런 기술은 없다");
    if (!LESSON_SKILLS.includes(skill)) return locked("레나는 그건 가르치지 않는다");
    if (run.player.skills[skill].rank >= SKILL_MAX_RANK) return locked("더 배울 것이 없다");
    if (skillXpRoomToday(run.player, skill) <= 0) return locked(`오늘은 ${josa(SKILL_LABEL[skill], "을/를")} 더 익힐 수 없다`);
  }
  return { available: true };
}

/**
 * 행동 하나를 처리하고 시간을 한 칸 넘긴다.
 * 판정은 행동 전 피로로 굴리고, 피로는 행동 뒤에 쌓인다 (일을 마치고 지친다).
 * @returns 처리했으면 true. 불가능한 행동이면 피드에 사유만 남기고 false.
 */
export function handleAction(ctx: Ctx, id: DailyActionId, { skill, stat, region, npc }: ActionTarget = {}): boolean {
  const status = actionStatus(ctx.draft, ctx.content, id, { skill, stat, region, npc });
  if (!status.available) {
    ctx.feed.push({ kind: "toast", text: status.reason });
    return false;
  }
  const def = DAILY_ACTIONS.find((a) => a.id === id)!;

  switch (id) {
    case "work": work(ctx); break;
    case "trainSolo": trainSolo(ctx, stat!); break;
    case "trainLesson": trainLesson(ctx, skill!, def); break;
    case "rest": rest(ctx); break;
  }
  // 일하기는 직업마다 피로가 달라 work()가 직접 더한다
  if (id !== "work") changeFatigue(ctx, def.fatigue);

  // 탐험·마을 볼일은 이벤트가 끝난 뒤 runner가 슬롯을 넘긴다
  if (id === "explore") startExplore(ctx, region!);
  else if (id === "village") startVillageVisit(ctx, npc as NpcId);
  else advanceSlot(ctx.draft);
  return true;
}

function work(ctx: Ctx): void {
  const s = ctx.draft;
  const job = jobOf(ctx.content, s);
  const w = job.work;
  const r = performCheck(ctx, w.check, w.label);

  const success = r.outcome === "success" || r.outcome === "critSuccess";
  const mult = r.outcome === "critSuccess" ? 2 : success ? 1 : 0;
  // 대장간 망치질은 둔기 연습도 된다
  if (success && w.bonusSkillXp) {
    const gained = gainSkillXp(ctx, w.bonusSkillXp, 1);
    if (gained > 0) ctx.feed.push({ kind: "text", text: `망치질에 손이 익었다. ${SKILL_LABEL[w.bonusSkillXp]} 경험 +${gained}` });
  }
  const silver = w.baseSilver + w.bonusSilver * mult;
  changeSilver(ctx, silver);
  s.stats.silverEarned += silver;
  if (w.bonusFood * mult > 0) changeFood(ctx, w.bonusFood * mult);

  if (r.outcome === "critFail") {
    changeFatigue(ctx, CRIT_FAIL_FATIGUE);
    if (job.id === "smith") {
      ctx.feed.push({ kind: "text", text: "달군 쇠가 손등을 스쳤다." });
      changeHp(ctx, -SMITH_BURN_HP);
      if (s.player.wound.level === "none") setWound(ctx, "light");
    }
  }
  changeFatigue(ctx, w.fatigue);
}

/** 운동: 능력치만으로 DC 10. 판정이 1회 세고, 결과에 따라 판정 횟수를 더 얹는다 (상한은 성장 굴림 기준치). */
function trainSolo(ctx: Ctx, stat: StatId): void {
  if (!isExerciseStat(stat)) return;
  const r = performCheck(ctx, { stat, dc: SOLO_TRAINING_DC }, EXERCISE_LABEL[stat]);
  const total = r.outcome === "critSuccess" ? EXERCISE_USES.critSuccess : r.outcome === "success" ? EXERCISE_USES.success : EXERCISE_USES.other;
  const uses = ctx.draft.player.statUses;
  uses[stat] = Math.min(STAT_GROWTH_USES, uses[stat] + total - 1);
  ctx.feed.push({ kind: "text", text: `${josa(STAT_LABEL[stat], "을/를")} 단련했다. 성장까지 ${uses[stat]}/${STAT_GROWTH_USES}` });
  if (r.outcome === "critFail") changeFatigue(ctx, CRIT_FAIL_FATIGUE);
}

function trainLesson(ctx: Ctx, skill: SkillId, def: DailyActionDef): void {
  changeSilver(ctx, -(def.silverCost ?? 0));
  const gained = gainSkillXp(ctx, skill, LESSON_XP);
  ctx.feed.push({ kind: "text", text: `레나에게 ${josa(SKILL_LABEL[skill], "을/를")} 배웠다. 경험 +${gained}` });
}

function rest(ctx: Ctx): void {
  const s = ctx.draft;
  s.time.restsToday += 1;
  changeHp(ctx, REST_HP);
  const w = s.player.wound;
  if (w.level === "light") {
    w.restCount += 1;
    if (w.restCount >= LIGHT_WOUND_RESTS) setWound(ctx, "none");
  }
}

export function jobOf(content: ContentDB, run: RunState) {
  const job = content.jobs[run.player.job];
  if (!job) throw new Error(`직업 데이터 없음: ${run.player.job}`);
  return job;
}

function locked(reason: string): ActionStatus {
  return { available: false, reason };
}
