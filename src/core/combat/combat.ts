import type { Ctx } from "../commands";
import type { ContentDB } from "../content";
import { buildCheckContext, previewCheck } from "../check/modifiers";
import { performCheck } from "../check/perform";
import { gainSkillXp } from "../check/progress";
import { gainTrait } from "../day/evening";
import { changeFatigue, changeFood, changeHp, changeSilver, setWound, worsenWound } from "../day/resources";
import { addItem, canUseItem, consumeItem, countInBag, removeItem } from "../items/inventory";
import { josa } from "../labels";
import {
  ARROW_RECOVERY_RATE,
  d,
  DEATH_SAVE_DC,
  DEATH_SAVE_VILLAGE_BONUS,
  maxHp,
  POWER_ATTACK_DAMAGE_BONUS,
  POWER_ATTACK_HIT_PENALTY,
  SKILL_XP_CAP_PER_COMBAT,
  type CheckSpec,
  type CombatAction,
  type CombatSetup,
  type CombatState,
  type EnemyDef,
  type EnemyInstance,
  type ItemId,
  type RollMode,
  type RunState,
  type SceneId,
  type SkillId,
  type WeaponDef,
  type WoundLevel,
} from "../types";
import { rollDice } from "./dice";

/** 무기가 없을 때 (SYSTEM_SPEC 5-5) */
export const FIST: WeaponDef = {
  id: "fist", name: "맨주먹", category: "weapon", description: "", price: 0, sellable: false, stackMax: 1,
  skill: "blunt", damage: "1d2", twoHanded: false, durabilityMax: 0,
};
const ARROW: ItemId = "arrow";
const BASE_DEFENSE = 10;
const DEFEND_BONUS = 2;
const MELEE_FUMBLE_DEFENSE_PENALTY = 2;
const COMBAT_FATIGUE = 1;
const ROBBED_SILVER_RATE = 0.5;
const RESCUED_SILVER_LOSS = 0.3;
const LOG_MAX = 30;
const WOUND_ORDER: WoundLevel[] = ["none", "light", "serious", "critical"];

/** 적이 공격을 맞혔을 때의 문장 (피해 숫자는 뒤에 붙는다) */
const ENEMY_HIT_TEXT: Record<string, string> = {
  wolf: "늑대가 달려들어 팔을 물었다.",
  boar: "멧돼지가 엄니로 들이받았다.",
  bandit: "도적의 칼날이 팔을 그었다.",
  goblin_scout: "고블린 정찰병의 단검이 옆구리를 파고들었다.",
  goblin_warrior: "고블린 전사의 도끼가 어깨를 내리찍었다.",
  raid_leader: "약탈대장의 철퇴가 몸을 강타했다.",
};

// ───────────────────────── 계산 ─────────────────────────

export function enemyDef(content: Pick<ContentDB, "enemies">, e: EnemyInstance): EnemyDef {
  const def = content.enemies[e.defId];
  if (!def) throw new Error(`없는 적: ${e.defId}`);
  return def;
}

export function equippedWeapon(run: RunState, content: Pick<ContentDB, "items">): WeaponDef {
  const stack = run.inventory.equipment.weapon;
  const def = stack ? content.items[stack.itemId] : undefined;
  return def?.category === "weapon" ? def : FIST;
}

export const isBow = (w: WeaponDef) => w.skill === "bow";

/** 아직 싸우는 적 (쓰러지지도 달아나지도 않은) */
export function activeEnemies(c: CombatState): EnemyInstance[] {
  return c.enemies.filter((e) => e.hp > 0 && !e.routed);
}

/** 방어도 = 10 + 민첩 + 방어구 + 방패 (+ 방어 자세, 스토리 보정, − 대실패 페널티) */
export function playerDefense(run: RunState, content: Pick<ContentDB, "items">, c: CombatState | null): number {
  const eq = run.inventory.equipment;
  const gear = [eq.armor, eq.shield].reduce((sum, stack) => {
    const def = stack ? content.items[stack.itemId] : undefined;
    return sum + (def && (def.category === "armor" || def.category === "shield") ? def.defense : 0);
  }, 0);
  const extra = c ? c.defendBonus - c.defensePenalty + (c.setup.playerDefenseBonus ?? 0) : 0;
  return BASE_DEFENSE + run.player.stats.agi + gear + extra;
}

/** 공격 판정 명세: 근접은 근력, 활은 민첩 + 무기 숙련 vs 적 방어도. 강타는 −2. */
export function attackSpec(run: RunState, content: ContentDB, target: EnemyInstance, power: boolean): CheckSpec {
  const w = equippedWeapon(run, content);
  const def = enemyDef(content, target);
  return {
    stat: isBow(w) ? "agi" : "str",
    skill: w.skill,
    dc: def.defense,
    tags: def.tags,
    situational: power ? POWER_ATTACK_HIT_PENALTY : undefined,
  };
}

export function fleeDc(content: ContentDB, c: CombatState): number {
  return BASE_DEFENSE + Math.max(0, ...activeEnemies(c).map((e) => enemyDef(content, e).speed));
}

/** 첫 공격 유리함(기습 정보 등): 아직 내가 한 번도 공격하지 않았을 때만 */
function firstStrikeSources(c: CombatState): string[] {
  return c.setup.firstAttackAdvantage && !c.log.some((l) => l.actor === "player" && l.check) ? ["기습"] : [];
}

// ───────────────────────── 화면용 ─────────────────────────

export interface CombatActionView {
  type: CombatAction["type"];
  label: string;
  chance?: number;
  mode?: RollMode;
  detail: string[];
  lockedReason: string | null;
}

export interface CombatView {
  round: number;
  defense: number;
  enemies: { id: string; name: string; hp: number; maxHp: number; state: "active" | "down" | "routed" }[];
  /** 공격·강타 확률은 이 대상 기준 */
  targetId: string | null;
  actions: CombatActionView[];
  /** 쓸 수 있는 소모품 */
  items: { itemId: ItemId; name: string; qty: number }[];
}

export function combatView(run: RunState, content: ContentDB, targetId?: string): CombatView | null {
  const c = run.combat;
  if (!c) return null;
  const alive = activeEnemies(c);
  const target = alive.find((e) => e.instanceId === targetId) ?? alive[0];
  const w = equippedWeapon(run, content);
  const bow = isBow(w);
  const noArrow = bow && countInBag(run.inventory, ARROW) === 0 ? "화살이 없다" : null;
  const dmg = (bonus: number) => `피해 ${w.damage}${bow ? "" : signedOrEmpty(run.player.stats.str + bonus)}${bow && bonus ? `+${bonus}` : ""}`;

  const chanceOf = (power: boolean) => {
    if (!target) return {};
    const spec = attackSpec(run, content, target, power);
    const p = previewCheck(spec, buildCheckContext(run, spec, content, { advantage: firstStrikeSources(c) }));
    return { chance: p.chance, mode: p.mode };
  };
  const items = Object.values(content.items)
    .filter((def) => canUseItem(run, content, def.id, true))
    .map((def) => ({ itemId: def.id, name: def.name, qty: countInBag(run.inventory, def.id) }));

  const fleeSpec: CheckSpec = { stat: "agi", dc: fleeDc(content, c) };
  const flee = previewCheck(fleeSpec, buildCheckContext(run, fleeSpec, content));
  const defendBonus = DEFEND_BONUS + run.player.skills.guard.rank;

  const actions: CombatActionView[] = [
    { type: "attack", label: bow ? "활 쏘기" : "공격", ...chanceOf(false), detail: [dmg(0), ...(bow ? ["화살 -1"] : [])], lockedReason: noArrow },
    {
      type: "powerAttack", label: bow ? "조준 사격" : "강타", ...chanceOf(true),
      detail: [`피해 +${POWER_ATTACK_DAMAGE_BONUS}`, `명중 ${POWER_ATTACK_HIT_PENALTY}`, "피로 +1"], lockedReason: noArrow,
    },
    { type: "defend", label: "방어 자세", detail: [`방어도 +${defendBonus}`], lockedReason: null },
    {
      type: "useItem", label: "아이템 사용", detail: items.length ? items.map((i) => `${i.name} ${i.qty}`) : [],
      lockedReason: items.length ? null : "쓸 만한 것이 없다",
    },
    {
      type: "flee", label: "도주", chance: flee.chance, mode: flee.mode, detail: [`목표 ${fleeSpec.dc}`],
      lockedReason: c.setup.canFlee ? null : c.setup.noFleeReason ?? "물러설 곳이 없다",
    },
  ];

  return {
    round: c.round,
    defense: playerDefense(run, content, c),
    enemies: c.enemies.map((e) => ({
      id: e.instanceId, name: enemyDef(content, e).name, hp: Math.max(0, e.hp), maxHp: e.maxHp,
      state: e.hp <= 0 ? "down" : e.routed ? "routed" : "active",
    })),
    targetId: target?.instanceId ?? null,
    actions,
    items,
  };
}

const signedOrEmpty = (n: number) => (n > 0 ? `+${n}` : n < 0 ? String(n) : "");

// ───────────────────────── 진행 ─────────────────────────

/** 전투를 연다. 선공을 정하고, 적이 먼저면 바로 적 턴을 치른다. (SYSTEM_SPEC 3-2) */
export function startCombat(ctx: Ctx, setup: CombatSetup): void {
  const s = ctx.draft;
  const enemies: EnemyInstance[] = setup.enemies.map((defId, i) => {
    const def = ctx.content.enemies[defId];
    if (!def) throw new Error(`없는 적: ${defId}`);
    return { instanceId: `${defId}_${i + 1}`, defId, hp: Math.max(1, def.hp + (setup.enemyHpModifier ?? 0)), maxHp: def.hp, routed: false };
  });
  const c: CombatState = {
    setup, enemies, round: 1, phase: "playerTurn", defendBonus: 0, defensePenalty: 0,
    enemyAdvantageThisRound: false, arrowsFired: 0, lowHpWoundApplied: false, xpThisCombat: {}, log: [],
  };
  s.combat = c;

  const names = enemyNames(ctx, c);
  let playerFirst = setup.initiative === "player";
  if (setup.initiative === "roll") {
    // 선공 다툼은 D20 + 민첩 (판정 기록·경험은 남기지 않는다)
    const dc = fleeDc(ctx.content, c);
    playerFirst = d(20, ctx.rng) + s.player.stats.agi >= dc;
  }
  say(ctx, c, "player", playerFirst ? `${josa(names, "이/가")} 덤비기 전에 먼저 움직였다.` : `${josa(names, "이/가")} 먼저 덮쳐 왔다!`);
  if (!playerFirst) {
    enemyTurn(ctx, c);
    if (!c.result) endRound(ctx, c);
  }
}

/** 내 행동 하나 → 적 턴 → 라운드 정리. 끝났으면 c.result가 정해지고 phase는 "ended". */
export function combatStep(ctx: Ctx, action: CombatAction): string | null {
  const s = ctx.draft;
  const c = s.combat;
  if (!c || c.phase !== "playerTurn") return "지금은 싸우는 중이 아니다";

  const blocked = actionBlock(ctx, c, action);
  if (blocked) return blocked;

  c.defendBonus = 0; // 내 턴 시작: 방어 자세 해제
  playerAct(ctx, c, action);
  if (!c.result && activeEnemies(c).length === 0) c.result = "victory";
  if (c.result) {
    c.phase = "ended";
    return null;
  }

  enemyTurn(ctx, c);
  if (!c.result) endRound(ctx, c);
  return null;
}

function actionBlock(ctx: Ctx, c: CombatState, a: CombatAction): string | null {
  const s = ctx.draft;
  switch (a.type) {
    case "attack":
    case "powerAttack": {
      const target = activeEnemies(c).find((e) => e.instanceId === a.targetId);
      if (!target) return "그 상대는 이미 싸울 수 없다";
      if (isBow(equippedWeapon(s, ctx.content)) && countInBag(s.inventory, ARROW) === 0) return "화살이 없다";
      return null;
    }
    case "defend": return null;
    case "useItem": return canUseItem(s, ctx.content, a.itemId, true) ? null : "그 아이템은 지금 쓸 수 없다";
    case "flee": return c.setup.canFlee ? null : c.setup.noFleeReason ?? "물러설 곳이 없다";
  }
}

function playerAct(ctx: Ctx, c: CombatState, a: CombatAction): void {
  const s = ctx.draft;
  switch (a.type) {
    case "attack":
    case "powerAttack":
      return attack(ctx, c, activeEnemies(c).find((e) => e.instanceId === a.targetId)!, a.type === "powerAttack");
    case "defend": {
      c.defendBonus = DEFEND_BONUS + s.player.skills.guard.rank;
      say(ctx, c, "player", `몸을 낮추고 방어 자세를 잡았다. (방어도 +${c.defendBonus})`);
      return;
    }
    case "useItem":
      consumeItem(ctx, a.itemId, true);
      return;
    case "flee": {
      const spec: CheckSpec = { stat: "agi", dc: fleeDc(ctx.content, c) };
      const r = performCheck(ctx, spec, "도주");
      if (r.outcome === "success" || r.outcome === "critSuccess") {
        say(ctx, c, "player", "등을 돌려 내달렸다. 무사히 따돌렸다.");
        c.result = "fled";
      } else {
        say(ctx, c, "player", "달아나려다 발이 걸렸다. 등을 보이고 말았다.");
        c.enemyAdvantageThisRound = true;
      }
      return;
    }
  }
}

function attack(ctx: Ctx, c: CombatState, target: EnemyInstance, power: boolean): void {
  const s = ctx.draft;
  const w = equippedWeapon(s, ctx.content);
  const bow = isBow(w);
  const def = enemyDef(ctx.content, target);
  if (bow) {
    removeItem(ctx, ARROW, 1);
    c.arrowsFired += 1;
  }
  if (power) changeFatigue(ctx, COMBAT_FATIGUE);

  const spec = attackSpec(s, ctx.content, target, power);
  const label = power ? (bow ? "조준 사격" : "강타") : bow ? "활 쏘기" : "공격";
  const r = performCheck(ctx, spec, label, { advantage: firstStrikeSources(c) }, xpRoom(c, w.skill));
  addCombatXp(c, w.skill, r.xpGained);

  if (r.outcome === "success" || r.outcome === "critSuccess") {
    const crit = r.outcome === "critSuccess";
    const bonus = (bow ? 0 : s.player.stats.str) + (power ? POWER_ATTACK_DAMAGE_BONUS : 0);
    const dmg = Math.max(1, rollDice(w.damage, ctx.rng, crit) + bonus);
    target.hp -= dmg;
    const hitText = crit
      ? `급소를 정확히 노렸다! ${def.name}에게 피해 ${dmg}.`
      : bow ? `화살이 ${def.name}에게 꽂혔다. 피해 ${dmg}.` : `${def.name}에게 일격을 먹였다. 피해 ${dmg}.`;
    say(ctx, c, "player", hitText, r, dmg);
    if (target.hp <= 0) say(ctx, c, "player", `${josa(def.name, "이/가")} 쓰러졌다.`);
    return;
  }

  say(ctx, c, "player", bow ? "화살이 빗나갔다." : "공격이 빗나갔다.", r);
  if (r.outcome === "critFail") {
    if (bow) {
      if (removeItem(ctx, ARROW, 1) > 0) say(ctx, c, "player", "시위가 엉키면서 화살 하나를 부러뜨렸다.");
    } else {
      c.defensePenalty = MELEE_FUMBLE_DEFENSE_PENALTY;
      say(ctx, c, "player", "중심을 잃고 비틀거렸다. (이번 라운드 방어도 −2)");
    }
  }
}

/** 살아 있는 적이 차례로 공격한다. 적의 굴림은 판정 기록에 남기지 않는다. */
function enemyTurn(ctx: Ctx, c: CombatState): void {
  const s = ctx.draft;
  c.phase = "enemyTurn";
  for (const e of activeEnemies(c)) {
    const def = enemyDef(ctx.content, e);
    const defense = playerDefense(s, ctx.content, c);
    const dice = c.enemyAdvantageThisRound ? [d(20, ctx.rng), d(20, ctx.rng)] : [d(20, ctx.rng)];
    const roll = Math.max(...dice);
    const crit = roll === 20;
    const hit = crit || (roll !== 1 && roll + def.attackBonus >= defense);

    if (!hit) {
      if (c.defendBonus > 0) {
        say(ctx, c, e.instanceId, `${def.name}의 공격을 막아 냈다.`);
        addCombatXp(c, "guard", gainSkillXp(ctx, "guard", Math.min(1, xpRoom(c, "guard"))));
      } else {
        say(ctx, c, e.instanceId, `${def.name}의 공격을 피했다.`);
      }
      continue;
    }

    const dmg = Math.max(1, rollDice(def.damage, ctx.rng) * (crit ? 2 : 1));
    changeHp(ctx, -dmg);
    const hitText = ENEMY_HIT_TEXT[def.id] ?? `${def.name}의 공격에 맞았다.`;
    say(ctx, c, e.instanceId, crit ? `${def.name}의 공격이 급소에 들어왔다! 피해 ${dmg}.` : `${hitText} 피해 ${dmg}.`, undefined, dmg);
    if (s.player.hp <= 0) {
      c.result = "defeated";
      c.phase = "ended";
      return;
    }
    // 부상: 적의 대성공, 또는 한 전투에서 처음으로 HP가 1/3 이하 (SYSTEM_SPEC 3-5).
    // 한 번 맞아서 두 조건이 겹쳐도 부상은 한 단계만 (한 방에 중상이 되면 그 뒤 판정 −4·불리함으로 손쓸 수 없게 된다)
    const lowHp = !c.lowHpWoundApplied && s.player.hp <= maxHp(s.player.stats) / 3;
    if (lowHp) c.lowHpWoundApplied = true;
    if (crit || lowHp) {
      if (lowHp && !crit) say(ctx, c, "player", "피를 너무 많이 흘렸다.");
      worsenWound(ctx, 1);
    }
  }
}

/** 라운드 정리: 유리함·페널티 해제, 사기 판정, 끝났는지 확인, 다음 라운드 */
function endRound(ctx: Ctx, c: CombatState): void {
  c.enemyAdvantageThisRound = false;
  c.defensePenalty = 0;
  for (const e of activeEnemies(c)) {
    const def = enemyDef(ctx.content, e);
    if (def.morale === undefined || e.hp > e.maxHp / 2) continue;
    if (ctx.rng() < def.morale) {
      e.routed = true;
      say(ctx, c, e.instanceId, `${josa(def.name, "이/가")} 겁을 먹고 달아났다.`);
      if (def.onRoutFlag) ctx.draft.flags[def.onRoutFlag] = true;
    }
  }
  if (activeEnemies(c).length === 0) {
    c.result = "victory";
    c.phase = "ended";
    return;
  }
  c.round += 1;
  c.phase = "playerTurn";
}

/**
 * 끝난 전투를 정리하고 이벤트가 이어질 장면을 돌려준다.
 * 공통: 피로 +1, 쏜 화살 절반 회수. 승리: 전리품. 패배: 적의 패배 규칙(사망 굴림·강탈·스토리).
 * @returns 다음 장면. "END"면 이벤트 끝. 사망이면 null (엔딩).
 */
export function finishCombat(ctx: Ctx): SceneId | "END" | null {
  const s = ctx.draft;
  const c = s.combat!;
  s.combat = null;
  changeFatigue(ctx, COMBAT_FATIGUE);
  const recovered = Math.floor(c.arrowsFired * ARROW_RECOVERY_RATE);
  if (recovered > 0) addItem(ctx, ARROW, recovered);

  switch (c.result) {
    case "victory":
      s.stats.combatsWon += 1;
      loot(ctx, c);
      return c.setup.onVictory;
    case "fled":
      s.stats.timesFled += 1;
      return c.setup.onFled ?? "END";
    default:
      return defeat(ctx, c);
  }
}

/** 쓰러뜨린 적은 전리품을 다, 달아난 적은 절반(내림)만 남긴다 */
function loot(ctx: Ctx, c: CombatState): void {
  for (const e of c.enemies) {
    const def = enemyDef(ctx.content, e);
    const share = (n: number) => (e.routed ? Math.floor(n / 2) : n);
    if (def.food) changeFood(ctx, share(def.food));
    if (def.silver) changeSilver(ctx, share(def.silver));
    for (const l of def.loot) {
      const qty = share(l.qty);
      if (qty > 0 && ctx.rng() < l.chance) addItem(ctx, l.itemId, qty);
    }
  }
}

function defeat(ctx: Ctx, c: CombatState): SceneId | "END" | null {
  const s = ctx.draft;
  const rule = enemyDef(ctx.content, c.enemies[0]).onDefeat;
  if (rule === "scripted") {
    s.player.hp = 1;
    return c.setup.onDefeat ?? "END";
  }
  if (rule === "robbed") {
    say(ctx, c, "player", "정신을 차려 보니 주머니가 가벼워져 있었다.");
    changeSilver(ctx, -Math.floor(s.resources.silver * ROBBED_SILVER_RATE));
    const stealable = s.inventory.slots.filter((x): x is NonNullable<typeof x> => !!x && ctx.content.items[x.itemId]?.category !== "quest");
    if (stealable.length > 0) removeItem(ctx, stealable[Math.floor(ctx.rng() * stealable.length)].itemId, 1);
    changeHp(ctx, 1 - s.player.hp);
    worsenWound(ctx, 1);
    return c.setup.onDefeat ?? "END";
  }

  // 사망 굴림: D20 + 체력 ≥ 10, 마을 안이면 +2 (SYSTEM_SPEC 3-5)
  const roll = d(20, ctx.rng);
  const bonus = inVillage(ctx) ? DEATH_SAVE_VILLAGE_BONUS : 0;
  const total = roll + s.player.stats.con + bonus;
  ctx.feed.push({ kind: "text", text: `눈앞이 캄캄해진다. 사망 굴림: 주사위 ${roll}, 합계 ${total} (목표 ${DEATH_SAVE_DC})` });

  if (roll === 20) {
    ctx.feed.push({ kind: "text", text: "숨이 끊어지기 직전, 이를 악물고 다시 일어섰다." });
    changeHp(ctx, 1 - s.player.hp);
    setWound(ctx, "light");
    gainTrait(ctx, "survivor");
    s.stats.deathSavesSurvived += 1;
    return c.setup.onDefeat ?? "END";
  }
  if (roll !== 1 && total >= DEATH_SAVE_DC) {
    ctx.feed.push({ kind: "text", text: "지나가던 마을 사람이 쓰러진 것을 발견해 집까지 업어다 주었다." });
    changeHp(ctx, 1 - s.player.hp);
    if (WOUND_ORDER.indexOf(s.player.wound.level) < WOUND_ORDER.indexOf("serious")) setWound(ctx, "serious");
    changeSilver(ctx, -Math.floor(s.resources.silver * RESCUED_SILVER_LOSS));
    gainTrait(ctx, "survivor");
    s.stats.deathSavesSurvived += 1;
    // 그날 남은 행동은 사라진다: 탐험 중이면 귀가하면서 저녁으로 넘어가도록 오후로, 아니면 바로 저녁
    s.time.phase = s.activeEvent?.explore ? "pm" : "evening";
    return "END";
  }
  ctx.feed.push({ kind: "text", text: "다시는 눈을 뜨지 못했다." });
  s.ending = "death";
  return null;
}

/** 탐험 중이 아니고 마을(또는 지역 없는) 이벤트에서 싸웠으면 마을 안 */
function inVillage(ctx: Ctx): boolean {
  const a = ctx.draft.activeEvent;
  if (!a || a.explore) return false;
  return (ctx.content.events[a.eventId]?.region ?? "village") === "village";
}

function xpRoom(c: CombatState, skill: SkillId): number {
  return Math.max(0, SKILL_XP_CAP_PER_COMBAT - (c.xpThisCombat[skill] ?? 0));
}

function addCombatXp(c: CombatState, skill: SkillId, n: number): void {
  if (n > 0) c.xpThisCombat[skill] = (c.xpThisCombat[skill] ?? 0) + n;
}

/** "늑대", "늑대 2마리", "늑대와 고블린 정찰병" */
function enemyNames(ctx: Ctx, c: CombatState): string {
  const counts = new Map<string, number>();
  for (const e of c.enemies) {
    const name = enemyDef(ctx.content, e).name;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const parts = [...counts].map(([name, n]) => (n > 1 ? `${name} ${n}마리` : name));
  if (parts.length === 1) return parts[0];
  const head = parts.slice(0, -2).map((p) => `${p}, `).join("");
  return `${head}${josa(parts[parts.length - 2], "과/와")} ${parts[parts.length - 1]}`;
}

/** 전투 기록과 피드에 같은 문장을 남긴다 */
function say(ctx: Ctx, c: CombatState, actor: string, text: string, check?: CombatState["log"][number]["check"], damage?: number): void {
  c.log.push({ round: c.round, actor, text, check, damage });
  if (c.log.length > LOG_MAX) c.log.shift();
  ctx.feed.push({ kind: "text", text });
}
