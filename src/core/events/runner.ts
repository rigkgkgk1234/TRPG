import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import { buildCheckContext, previewCheck } from "../check/modifiers";
import { performCheck } from "../check/perform";
import { combatStep, finishCombat } from "../combat/combat";
import { changeFatigue, changeFood, changeSilver } from "../day/resources";
import { beginDay } from "../day/evening";
import { advanceSlot } from "../day/time";
import { countInBag, removeItem } from "../items/inventory";
import { josa, REGION_LABEL, VISIT_LABEL, type VisitId } from "../labels";
import type {
  ActiveEventState, CheckOutcome, EventCategory, ChoiceCost, CombatAction, ChoiceDef, Effect, EventDef, Outcome, OutcomeMap, RegionId, RollMode, RunState, SceneDef, SceneId,
} from "../types";
import { conditionReason, evalAll, evalCondition, itemName, WOUND_RANK } from "./conditions";
import { applyEffects } from "./effects";
import { DEEP_FATIGUE, EXPLORE_CARDS, isDeeperPrompt, stopExplore } from "./explore";
import { recordEvent, selectEvent, selectStory } from "./selector";
import { resolveText } from "./text";

/** 대실패인데 이벤트에 critFail 분기가 없을 때의 추가 페널티 (SYSTEM_SPEC 2-4) */
const CRIT_FAIL_FATIGUE = 1;
const SCENE_TEXT_TO_FEED = new Set<Effect["type"]>(["startCombat", "ending", "resolveEnding"]);
/** 실패했을 때 이것이 있으면 위험 표시 (SYSTEM_SPEC 4-2) */
const DANGER_EFFECTS = new Set<Effect["type"]>(["startCombat", "wound", "ending"]);

// ───────────────────────── 화면용 파생값 ─────────────────────────

export interface ChoiceView {
  id: string;
  label: string;
  /** 고를 수 없으면 사유 */
  lockedReason: string | null;
  /** 판정이 있으면 성공 확률 (부분 성공 제외) */
  chance?: number;
  /** 판정이 있으면 성공에 필요한 D20 눈 */
  need?: number;
  mode?: RollMode;
  /** 판정 선택지: 실패하면 다치거나 싸우게 된다. 판정 없는 선택지: 고르면 싸움이 벌어진다 */
  danger: boolean;
  /** "은화 -3", "화살 -1", "피로 +1" */
  cost: string[];
}

export type SceneView =
  | { kind: "choices"; title: string; text: string; choices: ChoiceView[]; progress?: ExploreProgress; category: EventCategory }
  | { kind: "continue"; title: string; text: string; progress?: ExploreProgress; category: EventCategory }
  | { kind: "deeper"; region: RegionId; progress: ExploreProgress };

export interface ExploreProgress { region: RegionId; card: number; deep: boolean }

/** 진행 중인 이벤트를 화면이 그릴 수 있게 정리한다. 선택지의 잠김·확률은 handleChoice와 같은 함수로 계산한다. */
export function sceneView(run: RunState, content: ContentDB): SceneView | null {
  const active = run.activeEvent;
  if (!active) return null;
  const progress = active.explore && { region: active.explore.region, card: active.explore.cardsDrawn, deep: active.explore.deep };
  if (isDeeperPrompt(active)) return { kind: "deeper", region: active.explore!.region, progress: progress! };

  const ev = content.events[active.eventId];
  const scene = ev?.scenes[active.sceneId];
  if (!ev || !scene) return null;
  const text = resolveText(scene.text, run);
  if (scene.choices.length === 0) return { kind: "continue", title: ev.title, text, progress, category: ev.category };

  const choices = scene.choices
    .filter((c) => !c.hideIfLocked || evalAll(c.conditions, run))
    .map((c) => choiceView(run, content, ev, c));
  return { kind: "choices", title: ev.title, text, choices, progress, category: ev.category };
}

function choiceView(run: RunState, content: ContentDB, ev: EventDef, c: ChoiceDef): ChoiceView {
  const view: ChoiceView = {
    id: c.id,
    label: c.label,
    lockedReason: choiceBlock(run, content, c),
    danger: isDangerous(ev, c.check ? [c.outcomes.fail, c.outcomes.critFail] : [c.outcome]),
    cost: costText(content, c.cost),
  };
  if (c.check) {
    const p = previewCheck(c.check, buildCheckContext(run, c.check, content));
    view.chance = p.chance;
    view.need = p.need;
    view.mode = p.mode;
  }
  return view;
}

/** 고를 수 없는 이유. 조건 → 비용 순으로 처음 걸리는 것 하나. */
function choiceBlock(run: RunState, content: ContentDB, c: ChoiceDef): string | null {
  for (const cond of c.conditions ?? []) {
    if (!evalCondition(cond, run)) return c.lockedReason ?? conditionReason(cond, content) ?? "지금은 할 수 없다";
  }
  const cost = c.cost;
  if (cost?.silver && run.resources.silver < cost.silver) return `은화 ${cost.silver} 필요`;
  if (cost?.food && run.resources.food < cost.food) return `식량 ${cost.food} 필요`;
  if (cost?.item && countInBag(run.inventory, cost.item.itemId) < cost.item.qty) {
    return `${itemName(content, cost.item.itemId)} ${cost.item.qty}개 필요`;
  }
  return null;
}

function costText(content: ContentDB, cost: ChoiceCost | undefined): string[] {
  if (!cost) return [];
  return [
    cost.silver && `은화 -${cost.silver}`,
    cost.food && `식량 -${cost.food}`,
    cost.item && `${itemName(content, cost.item.itemId)} -${cost.item.qty}`,
    cost.fatigue && `피로 +${cost.fatigue}`,
  ].filter((x): x is string => !!x);
}

/**
 * 판정 선택지는 실패·대실패 결과, 판정 없는 선택지는 그 결과를 본다.
 * 결과(와 그 결과가 들어가는 장면의 onEnter)에 전투·부상·엔딩이 있으면 위험.
 */
function isDangerous(ev: EventDef, outcomes: (Outcome | undefined)[]): boolean {
  return outcomes.some((o) => {
    if (!o) return false;
    const next = o.next === "END" ? undefined : ev.scenes[o.next];
    return [...(o.effects ?? []), ...(next?.onEnter ?? [])].some((e) => DANGER_EFFECTS.has(e.type));
  });
}

// ───────────────────────── 명령 처리 ─────────────────────────

/** 선택지를 고른다: 비용 → (판정) → 결과 문장·효과 → 다음 장면. @returns 처리했으면 true */
export function handleChoice(ctx: Ctx, choiceId: string): boolean {
  const s = ctx.draft;
  const found = currentScene(ctx);
  if (!found) return reject(ctx, "고를 선택지가 없다");
  const choice = found.scene.choices.find((c) => c.id === choiceId);
  if (!choice || (choice.hideIfLocked && !evalAll(choice.conditions, s))) return reject(ctx, "그런 선택지는 없다");
  const blocked = choiceBlock(s, ctx.content, choice);
  if (blocked) return reject(ctx, blocked);

  payCost(ctx, choice.cost);

  // 다음 장면으로 넘어가도 직전 판정은 남긴다 (5주차 저장 후 재진입 시 결과 화면 복원용)
  delete s.activeEvent!.lastCheck;
  let outcome: Outcome;
  if (choice.check) {
    const r = performCheck(ctx, choice.check, choice.label);
    s.activeEvent!.lastCheck = r;
    outcome = pickOutcome(choice.outcomes, r.outcome);
    if (r.outcome === "critFail" && !choice.outcomes.critFail) changeFatigue(ctx, CRIT_FAIL_FATIGUE);
  } else {
    outcome = choice.outcome;
  }
  applyOutcome(ctx, outcome);
  return true;
}

/** 선택지가 없는 장면의 "계속" */
export function handleContinue(ctx: Ctx): boolean {
  const found = currentScene(ctx);
  if (!found || found.scene.choices.length > 0) return reject(ctx, "아직 고를 것이 남았다");
  goTo(ctx, found.scene.autoNext ?? "END");
  return true;
}

/** 탐험 카드 2장을 본 뒤: 더 깊이 들어가 1장 더(위험 등급 +1, 피로 +1), 아니면 마을로. */
export function handleGoDeeper(ctx: Ctx, yes: boolean): boolean {
  const active = ctx.draft.activeEvent;
  if (!active?.explore || !isDeeperPrompt(active)) return reject(ctx, "지금은 고를 수 없다");
  if (!yes) {
    finishExplore(ctx);
    return true;
  }
  const ex = active.explore;
  ex.deep = true;
  changeFatigue(ctx, DEEP_FATIGUE);
  if (ctx.draft.time.collapsedToday) finishExplore(ctx);
  else drawCard(ctx, ex.region, true, ex.cardsDrawn);
  return true;
}

/** 전투 행동 하나. 전투가 끝나면 결과에 맞는 이벤트 장면으로 돌아간다. */
export function handleCombat(ctx: Ctx, action: CombatAction): boolean {
  const blocked = combatStep(ctx, action);
  if (blocked) return reject(ctx, blocked);
  if (ctx.draft.combat?.result) resolveCombat(ctx);
  return true;
}

/**
 * 마을에서 행동을 고르기 전(오전·오후, 하고 있는 일이 없을 때) 일어날 스토리가 있으면 시작한다.
 * @returns 시작했으면 true
 */
export function startPendingStory(ctx: Ctx): boolean {
  const s = ctx.draft;
  if (s.ending || s.activeEvent || s.combat || (s.time.phase !== "am" && s.time.phase !== "pm")) return false;
  const ev = selectStory(ctx);
  if (!ev) return false;
  startEvent(ctx, ev);
  return true;
}

/** 스토리 이벤트 하나를 바로 시작한다 (30일차 습격처럼 정해진 때에) */
export function startStoryEvent(ctx: Ctx, eventId: string): boolean {
  const ev = ctx.content.events[eventId];
  if (!ev) return false;
  startEvent(ctx, ev);
  return true;
}

/** 탐험 행동: 피로는 행동 쪽에서 이미 더했다. 첫 카드를 뽑는다. */
export function startExplore(ctx: Ctx, region: RegionId): void {
  ctx.feed.push({ kind: "text", text: `${josa(REGION_LABEL[region], "으로/로")} 들어섰다.` });
  if (ctx.draft.time.collapsedToday) {
    finishExplore(ctx);
    return;
  }
  drawCard(ctx, region, false, 0);
}

/** 마을 볼일: 그 사람(또는 결투장·의뢰 중개소)의 이벤트 하나. 행동 슬롯은 이벤트가 끝날 때 쓴다 (endEvent). */
export function startVillageVisit(ctx: Ctx, npc: VisitId): void {
  ctx.feed.push({ kind: "text", text: `${josa(VISIT_LABEL[npc], "을/를")} 찾아갔다.` });
  const ev = selectEvent(ctx, "npc", undefined, false, npc);
  if (ev) startEvent(ctx, ev);
  else advanceSlot(ctx.draft);
}

/**
 * 아침·밤 이벤트를 가중치로 하나 골라 시작한다. 후보가 없으면 아무 일도 없다.
 * @returns 시작했으면 true
 */
export function startRandomEvent(ctx: Ctx, category: "morning" | "night"): boolean {
  const ev = selectEvent(ctx, category);
  if (!ev) return false;
  startEvent(ctx, ev);
  return true;
}

// ───────────────────────── 장면 이동 ─────────────────────────

function currentScene(ctx: Ctx): { ev: EventDef; scene: SceneDef } | null {
  const active = ctx.draft.activeEvent;
  if (!active || ctx.draft.combat || isDeeperPrompt(active)) return null;
  const ev = ctx.content.events[active.eventId];
  const scene = ev?.scenes[active.sceneId];
  return ev && scene ? { ev, scene } : null;
}

/** 판정 결과에 맞는 분기. 대성공·대실패 분기가 없으면 성공·실패로, 부분 성공 분기가 없으면 실패로. (SYSTEM_SPEC 2-4) */
export function pickOutcome(o: OutcomeMap, r: CheckOutcome): Outcome {
  switch (r) {
    case "critSuccess": return o.critSuccess ?? o.success;
    case "success": return o.success;
    case "partial": return o.partial ?? o.fail;
    case "fail": return o.fail;
    case "critFail": return o.critFail ?? o.fail;
  }
}

function payCost(ctx: Ctx, cost: ChoiceCost | undefined): void {
  if (!cost) return;
  if (cost.silver) changeSilver(ctx, -cost.silver);
  if (cost.food) changeFood(ctx, -cost.food);
  if (cost.item) removeItem(ctx, cost.item.itemId, cost.item.qty);
  if (cost.fatigue) changeFatigue(ctx, cost.fatigue);
}

function applyOutcome(ctx: Ctx, o: Outcome): void {
  if (o.text) ctx.feed.push({ kind: "text", text: resolveText(o.text, ctx.draft) });
  applyEffects(ctx, o.effects);
  goTo(ctx, o.next);
}

function goTo(ctx: Ctx, next: SceneId | "END"): void {
  const s = ctx.draft;
  if (s.ending) {
    s.activeEvent = null;
    return;
  }
  if (next === "END") endEvent(ctx);
  else enterScene(ctx, next);
}

function enterScene(ctx: Ctx, sceneId: SceneId): void {
  const s = ctx.draft;
  const active = s.activeEvent!;
  active.sceneId = sceneId;
  const scene = ctx.content.events[active.eventId]?.scenes[sceneId];
  if (!scene) throw new Error(`없는 장면: ${active.eventId}/${sceneId}`);
  // 전투로 넘어가거나 엔딩으로 끝나는 장면은 패널에 그려질 틈이 없으므로 장면 글을 결과 카드에 남긴다
  if (scene.onEnter?.some((e) => SCENE_TEXT_TO_FEED.has(e.type))) ctx.feed.push({ kind: "text", text: resolveText(scene.text, s) });
  applyEffects(ctx, scene.onEnter);
  if (s.ending) s.activeEvent = null;
  // 기습당해 전투가 시작하자마자 끝날 수도 있다
  else if (s.combat?.result) resolveCombat(ctx);
}

/**
 * 끝난 전투를 정리하고 이벤트로 돌아간다.
 * 도주·패배면 탐험의 남은 카드는 버린다 (SYSTEM_SPEC 3-4). 사망이면 회차가 끝난다.
 */
function resolveCombat(ctx: Ctx): void {
  const s = ctx.draft;
  const result = s.combat!.result;
  const next = finishCombat(ctx);
  if (next === null || s.ending) {
    s.activeEvent = null;
    return;
  }
  const ex = s.activeEvent?.explore;
  if (result !== "victory" && ex) stopExplore(ex);
  // 쓰러졌다가 실려 왔거나 털린 뒤라면 "마을로 돌아왔다"를 덧붙이지 않고 조용히 탐험을 끝낸다
  if (result === "defeated" && ex && next === "END") {
    s.activeEvent = null;
    advanceSlot(s);
    return;
  }
  goTo(ctx, next);
}

function startEvent(ctx: Ctx, ev: EventDef, explore?: ActiveEventState["explore"]): void {
  recordEvent(ctx.draft, ev.id);
  ctx.draft.activeEvent = { eventId: ev.id, sceneId: ev.startScene, explore };
  enterScene(ctx, ev.startScene);
}

/**
 * 이벤트 하나가 끝났다. 탐험 중이면 다음 카드·"더 깊이" 질문·귀가 중 하나로 이어진다.
 * 마을 볼일(npc)이면 행동 슬롯을 쓰고, 밤 이벤트면 다음 날 아침을 연다.
 */
function endEvent(ctx: Ctx): void {
  const s = ctx.draft;
  const ex = s.activeEvent?.explore;
  if (!ex) {
    const category = ctx.content.events[s.activeEvent!.eventId]?.category;
    s.activeEvent = null;
    const acting = s.time.phase === "am" || s.time.phase === "pm";
    // 이벤트 중에 탈진했으면 그날은 끝 (아침 이벤트·스토리도 마찬가지)
    if (acting && s.time.collapsedToday) s.time.phase = "evening";
    // 쓰러져 실려 왔으면 이미 저녁이다
    else if (category === "npc" && acting) advanceSlot(s);
    if (category === "night") beginDay(ctx);
    return;
  }
  if (s.time.collapsedToday) finishExplore(ctx);
  else if (WOUND_RANK[s.player.wound.level] >= WOUND_RANK.serious) {
    // 중상 이상이면 탐험할 수 없다 (SYSTEM_SPEC 3-5). 다친 채 다음 카드로 들어가지 않고 돌아온다
    ctx.feed.push({ kind: "text", text: "상처가 깊다. 더 돌아다닐 몸이 아니다." });
    finishExplore(ctx);
  } else if (ex.cardsDrawn < EXPLORE_CARDS) drawCard(ctx, ex.region, ex.deep, ex.cardsDrawn);
  else if (!ex.deep) s.activeEvent!.sceneId = "END";
  else finishExplore(ctx);
}

function drawCard(ctx: Ctx, region: RegionId, deep: boolean, drawn: number): void {
  // 이 지역의 스토리가 일어날 때가 됐으면 카드 대신 먼저 나온다
  const ev = selectStory(ctx, region) ?? selectEvent(ctx, "explore", region, deep);
  if (!ev) {
    ctx.feed.push({ kind: "text", text: "더는 눈에 띄는 것이 없었다." });
    finishExplore(ctx);
    return;
  }
  startEvent(ctx, ev, { region, cardsDrawn: drawn + 1, deep });
}

/** 탐험을 마치고 마을로 돌아온다. 행동 슬롯은 이때 쓴다. */
function finishExplore(ctx: Ctx): void {
  const s = ctx.draft;
  s.activeEvent = null;
  ctx.feed.push({ kind: "text", text: s.time.collapsedToday ? "비틀거리며 겨우 마을로 돌아왔다." : "마을로 돌아왔다." });
  advanceSlot(s);
}

function reject(ctx: Ctx, text: string): false {
  ctx.feed.push({ kind: "toast", text });
  return false;
}
