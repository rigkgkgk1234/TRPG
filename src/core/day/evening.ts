import type { Ctx, FeedOrder } from "../commands";
import { rollStatGrowth } from "../check/progress";
import {
  DEBT_ENDING_THRESHOLD,
  DEBT_INTEREST,
  FATIGUE_AFTER_COLLAPSE,
  LAST_DAY,
  SLEEP_RECOVERY,
  STAT_MIN,
  TAX_AMOUNT,
  TAX_INTERVAL_DAYS,
  type RunState,
} from "../types";
import { changeDebt, changeFatigue, changeFood, changeHp, changeReputation, changeSilver, setWound } from "./resources";

/** 본인 1 + 가족 1 (SYSTEM_SPEC 6-4) */
export const FOOD_PER_DAY = 2;
const HUNGER_HP_LOSS_AT = 3;
const HUNGER_HP_LOSS = 2;
const FAMILY_HUNGER_WARNING_AT = 3;
const TAX_REPUTATION_PENALTY = -5;
const SERIOUS_TREATED_DAYS = 3;
const SERIOUS_UNTREATED_DAYS = 5;

export function isTaxDay(day: number): boolean {
  return day % TAX_INTERVAL_DAYS === 0 && day < LAST_DAY;
}

/** 저녁 뷰에서 정산 전에 보여 줄 예고 */
export interface EveningPreview {
  foodShort: boolean;
  taxDue: number;
  /** 세금을 내면 빚이 생기는지 */
  taxShort: boolean;
  /** 이 상태로 정산하면 「빚진 자」 엔딩 */
  debtEnding: boolean;
  lastDay: boolean;
}

export function previewEvening(run: RunState): EveningPreview {
  const tax = isTaxDay(run.time.day);
  return {
    foodShort: run.resources.food < FOOD_PER_DAY,
    taxDue: tax ? TAX_AMOUNT : 0,
    taxShort: tax && run.resources.silver < TAX_AMOUNT,
    debtEnding: tax && run.resources.debt >= DEBT_ENDING_THRESHOLD,
    lastDay: run.time.day === LAST_DAY,
  };
}

/**
 * 저녁 정산. SYSTEM_SPEC 6-6의 순서를 바꾸지 않는다 (순서가 바뀌면 숫자가 미묘하게 어긋난다).
 * @returns 다음 날 아침이 시작됐으면 true (체크포인트 저장 지점). 엔딩이면 false.
 */
export function runEvening(ctx: Ctx, order: FeedOrder = "selfFirst"): boolean {
  const s = ctx.draft;
  eat(ctx, order);                                       // 1. 식사
  sleep(ctx);                                            // 2. 수면
  regenHp(ctx);                                          // 3. HP
  if (s.player.hp <= 0) return endRun(ctx, "death", "굶주림 끝에 다시 눈을 뜨지 못했다.");
  tickWound(ctx);                                        // 4. 부상 타이머
  if (isTaxDay(s.time.day)) {                            // 5. 세금
    if (s.resources.debt >= DEBT_ENDING_THRESHOLD) return endRun(ctx, "debtor", "징수관이 빚 문서를 들고 문을 두드렸다.");
    payTax(ctx);
  }
  rollStatGrowth(ctx);                                   // 6. 능력치 성장
  // 7. 최종 습격(story_raid)은 6주차, 밤 이벤트(25%)는 밤 이벤트 콘텐츠와 함께 붙인다 (엔진은 3주차에 준비됨). 그 전까지 30일차 밤을 넘기면 생존 엔딩.
  if (s.time.day >= LAST_DAY) return endRun(ctx, "survivor", "서른 번째 밤이 지났다. 아직 살아 있다.");
  startNextDay(ctx);                                     // 8. 다음 날
  return true;
}

function eat(ctx: Ctx, order: FeedOrder): void {
  const r = ctx.draft.resources;
  // 먼저 먹는 쪽이 남은 한 끼를 가져간다
  let left = r.food;
  const firstAte = left > 0;
  if (firstAte) left--;
  const secondAte = left > 0;
  if (secondAte) left--;
  const [selfAte, familyAte] = order === "selfFirst" ? [firstAte, secondAte] : [secondAte, firstAte];
  changeFood(ctx, left - r.food);

  r.hunger = selfAte ? 0 : r.hunger + 1;
  r.familyHunger = familyAte ? 0 : r.familyHunger + 1;
  if (selfAte && familyAte) ctx.feed.push({ kind: "text", text: "동생과 둘러앉아 저녁을 먹었다." });
  if (!selfAte) ctx.feed.push({ kind: "text", text: `빈속으로 잠자리에 든다. (굶주림 ${r.hunger})` });
  if (!familyAte) ctx.feed.push({ kind: "text", text: `동생이 배고프다며 칭얼거린다. (가족 굶주림 ${r.familyHunger})` });
  // 「동생이 앓아눕다」 스토리 이벤트는 스토리 이벤트(6주차)가 이 수치를 조건으로 띄운다
  if (r.familyHunger >= FAMILY_HUNGER_WARNING_AT) ctx.feed.push({ kind: "text", text: "동생의 얼굴이 핼쑥하다. 이대로는 안 된다." });
}

function sleep(ctx: Ctx): void {
  const { resources: r, time } = ctx.draft;
  if (time.collapsedToday) {
    changeFatigue(ctx, FATIGUE_AFTER_COLLAPSE - r.fatigue);
    return;
  }
  const recovery = SLEEP_RECOVERY - (r.hunger >= 1 ? 1 : 0) + (time.restsToday > 0 ? 1 : 0);
  changeFatigue(ctx, -recovery);
}

function regenHp(ctx: Ctx): void {
  const s = ctx.draft;
  if (s.resources.hunger >= HUNGER_HP_LOSS_AT) changeHp(ctx, -HUNGER_HP_LOSS);
  else if (s.player.wound.level === "none" || s.player.wound.level === "light") changeHp(ctx, 1);
}

/** 중상: 치료 후 3일 → 경상, 방치 5일 → 경상 + 「오래된 상처」. 치명상의 아침 사망 굴림은 4주차. */
function tickWound(ctx: Ctx): void {
  const w = ctx.draft.player.wound;
  if (w.level !== "serious") return;
  if (w.treatedDays !== null) {
    w.treatedDays += 1;
    if (w.treatedDays >= SERIOUS_TREATED_DAYS) setWound(ctx, "light");
  } else {
    w.untreatedDays += 1;
    if (w.untreatedDays >= SERIOUS_UNTREATED_DAYS) {
      setWound(ctx, "light");
      gainTrait(ctx, "old_wound");
    }
  }
}

function payTax(ctx: Ctx): void {
  const r = ctx.draft.resources;
  if (r.silver >= TAX_AMOUNT) {
    changeSilver(ctx, -TAX_AMOUNT);
    ctx.feed.push({ kind: "text", text: `세금(은화 ${TAX_AMOUNT})을 냈다.` });
    return;
  }
  const shortfall = TAX_AMOUNT - r.silver;
  changeSilver(ctx, -r.silver);
  changeDebt(ctx, shortfall + DEBT_INTEREST);
  changeReputation(ctx, TAX_REPUTATION_PENALTY);
  ctx.feed.push({ kind: "text", text: `세금이 모자랐다. 모자란 은화 ${shortfall}닢에 이자 ${DEBT_INTEREST}닢을 더해 빚으로 남았다.` });
}

/** 흔적을 얻고, 능력치 변화가 있으면 한 번 적용한다. */
export function gainTrait(ctx: Ctx, traitId: string): void {
  const p = ctx.draft.player;
  if (p.traits.includes(traitId)) return;
  p.traits.push(traitId);
  const def = ctx.content.traits[traitId];
  ctx.feed.push({ kind: "text", text: `흔적을 얻었다: 「${def?.name ?? traitId}」` });
  for (const [stat, delta] of Object.entries(def?.statDelta ?? {}) as [keyof typeof p.stats, number][]) {
    p.stats[stat] = Math.max(STAT_MIN, p.stats[stat] + delta);
  }
}

function startNextDay(ctx: Ctx): void {
  const t = ctx.draft.time;
  t.day += 1;
  t.phase = t.skipNextAm ? "pm" : "am";
  t.skipNextAm = false;
  t.restsToday = 0;
  t.collapsedToday = false;
  ctx.draft.player.skillXpToday = {};
  ctx.feed.push({ kind: "text", text: `${t.day}일차 아침이 밝았다.${t.phase === "pm" ? " 몸이 무거워 오전 내내 누워 있었다." : ""}` });
}

function endRun(ctx: Ctx, ending: NonNullable<RunState["ending"]>, text: string): false {
  ctx.draft.ending = ending;
  ctx.feed.push({ kind: "text", text });
  return false;
}
