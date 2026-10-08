// 이 파일은 docs/SYSTEM_SPEC.md 에서 자동 생성된다. 직접 수정하지 말 것.
// 재생성: node scripts/extract-types.mjs

/** 콘텐츠 ID. 데이터 파일의 키와 일치해야 한다. */
export type ItemId = string;
export type EventId = string;
export type SceneId = string;
export type EnemyId = string;
export type TraitId = string;
export type FlagId = string;

export type JobId = "farmer" | "smith" | "hunter" | "herbalist" | "errand";
export type RegionId = "village" | "forest" | "watchtower" | "marsh" | "rowen";

/** "1d6", "2d4+1", "1d8-1" 형태의 주사위 표기 */
export type DiceExpr = `${number}d${number}` | `${number}d${number}+${number}` | `${number}d${number}-${number}`;

/** 0 이상 1 미만의 실수를 반환하는 난수 함수 */
export type Rng = () => number;

export type StatId = "str" | "agi" | "con" | "per" | "cha";
export type Stats = Record<StatId, number>;

export type SkillId =
  | "blade" | "blunt" | "bow" | "guard"
  | "farming" | "smithing" | "tracking" | "herbalism";

export interface SkillProgress {
  /** 0(무경험) ~ 5(달인). 판정 보너스로 그대로 더해진다. */
  rank: number;
  /** 현재 등급에서 쌓은 경험치 */
  xp: number;
}
export type Skills = Record<SkillId, SkillProgress>;

export const STAT_MIN = -1;
export const STAT_NATURAL_CAP = 4;
export const STAT_HARD_CAP = 5;
export const SKILL_MAX_RANK = 5;
/** index = 현재 등급. 등급 0→1에 3, 1→2에 6 ... */
export const SKILL_XP_TO_NEXT = [3, 6, 10, 15, 21] as const;
export const SKILL_XP_CAP_PER_COMBAT = 4;
/** 이긴 전투에서 공격에 쓴 무기 숙련에 더 주는 XP (전투 상한과 별개, 하루 상한은 적용) */
export const COMBAT_VICTORY_XP = 1;
export const SKILL_XP_CAP_PER_DAY = 6;
export const STAT_GROWTH_USES = 15;

export const SKILL_STAT: Record<SkillId, StatId> = {
  blade: "str", blunt: "str", bow: "agi", guard: "con",
  farming: "str", smithing: "str", tracking: "per", herbalism: "per",
};

export type WoundLevel = "none" | "light" | "serious" | "critical";

export interface PlayerState {
  name: string;
  job: JobId;
  stats: Stats;
  /** 능력치별 판정 사용 횟수 (15회면 저녁에 +1) */
  statUses: Record<StatId, number>;
  skills: Skills;
  /** 오늘 숙련별로 얻은 XP (하루 상한 계산용, 아침마다 초기화) */
  skillXpToday: Partial<Record<SkillId, number>>;
  hp: number;
  wound: WoundState;
  traits: TraitId[];
  /** 0 ~ 100 */
  reputation: number;
}

/** 흔적(특성) 데이터. 판정 보정은 buildCheckContext가 읽는다. */
export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  /** 판정 보정. stat을 지정하면 그 능력치 판정만, tags를 지정하면 그중 하나 이상이 붙은 판정만 (둘 다 없으면 모든 판정) */
  checkBonus?: { tags?: string[]; stat?: StatId; value: number };
  /** 이 태그가 붙은 판정에 유리함 */
  advantageTags?: string[];
  /** 획득 시 한 번 적용하는 능력치 변화 (예: 오래된 상처 → agi -1) */
  statDelta?: Partial<Stats>;
}

export function maxHp(stats: Stats): number {
  return 8 + stats.con * 2;
}

export interface JobDef {
  id: JobId;
  name: string;
  stats: Stats;
  startSkills: Partial<Record<SkillId, number>>;
  silver: number;
  food: number;
  reputation: number;
  startItems: { itemId: ItemId; qty: number; equip?: boolean }[];
  /** 일하기 행동에 쓰이는 판정과 수입 */
  work: WorkDef;
  mvp: boolean;
}

export const JOBS: Record<"farmer" | "smith" | "hunter", JobDef> = {
  farmer: {
    id: "farmer", name: "농부", mvp: true,
    stats: { str: 1, agi: 0, con: 2, per: 1, cha: 0 },
    startSkills: { farming: 2, tracking: 1 },
    silver: 10, food: 6, reputation: 10,
    startItems: [{ itemId: "pitchfork", qty: 1, equip: true }],
    work: { label: "밭일", check: { stat: "str", skill: "farming", dc: 10 }, baseSilver: 2, bonusSilver: 1, bonusFood: 1, fatigue: 2 },
  },
  smith: {
    id: "smith", name: "대장장이 견습", mvp: true,
    stats: { str: 2, agi: 0, con: 1, per: 0, cha: 1 },
    startSkills: { smithing: 2, blunt: 1 },
    silver: 8, food: 5, reputation: 10,
    startItems: [{ itemId: "old_hammer", qty: 1, equip: true }],
    work: { label: "대장간 일", check: { stat: "str", skill: "smithing", dc: 12 }, baseSilver: 3, bonusSilver: 2, bonusFood: 0, fatigue: 3, bonusSkillXp: "blunt" },
  },
  hunter: {
    id: "hunter", name: "사냥꾼", mvp: true,
    stats: { str: 0, agi: 2, con: 1, per: 2, cha: -1 },
    startSkills: { bow: 2, tracking: 1 },
    silver: 5, food: 4, reputation: 5,
    startItems: [
      { itemId: "hunting_bow", qty: 1, equip: true },
      { itemId: "arrow", qty: 10 },
      { itemId: "hunting_knife", qty: 1 },
    ],
    work: { label: "덫·가죽 손질", check: { stat: "per", skill: "tracking", dc: 12 }, baseSilver: 2, bonusSilver: 1, bonusFood: 1, fatigue: 2 },
  },
};

export type RollMode = "normal" | "advantage" | "disadvantage";
export type CheckOutcome = "critSuccess" | "success" | "partial" | "fail" | "critFail";

export interface ModifierSource {
  /** UI 표시용 라벨: "민첩", "활", "경상" */
  label: string;
  value: number;
}

/** 데이터(이벤트·행동)에 적히는 판정 명세 */
export interface CheckSpec {
  stat: StatId;
  skill?: SkillId;
  dc: number;
  /** 상황 보정 (이벤트 고정값) */
  situational?: number;
  /** 부분 성공 허용 여부 (기본 false) */
  allowPartial?: boolean;
  /** 흔적 보정 매칭용 태그: "beast", "fear", "goblin" ... */
  tags?: string[];
  /** 이 판정에만 적용할 유리/불리 */
  forceMode?: RollMode;
}

/** 판정 직전에 코어가 상태를 보고 조립하는 컨텍스트 */
export interface CheckContext {
  modifiers: ModifierSource[];
  advantageSources: string[];
  disadvantageSources: string[];
}

export interface CheckResult {
  spec: CheckSpec;
  mode: RollMode;
  /** 실제 굴린 주사위들 (유리/불리면 2개) */
  dice: number[];
  /** 채택된 주사위 */
  kept: number;
  modifiers: ModifierSource[];
  modifierTotal: number;
  total: number;
  /** total - dc */
  margin: number;
  outcome: CheckOutcome;
  xpGained: number;
}

export const PARTIAL_MARGIN = 2;

export function resolveMode(ctx: CheckContext, force?: RollMode): RollMode {
  if (force) return force;
  const adv = ctx.advantageSources.length > 0;
  const dis = ctx.disadvantageSources.length > 0;
  if (adv && !dis) return "advantage";
  if (dis && !adv) return "disadvantage";
  return "normal";
}

export function d(sides: number, rng: Rng): number {
  return Math.floor(rng() * sides) + 1;
}

export function rollCheck(spec: CheckSpec, ctx: CheckContext, rng: Rng): CheckResult {
  const mode = resolveMode(ctx, spec.forceMode);
  const dice = mode === "normal" ? [d(20, rng)] : [d(20, rng), d(20, rng)];
  const kept = mode === "advantage" ? Math.max(...dice) : mode === "disadvantage" ? Math.min(...dice) : dice[0];
  const modifierTotal = ctx.modifiers.reduce((sum, m) => sum + m.value, 0);
  const total = kept + modifierTotal;
  const margin = total - spec.dc;

  let outcome: CheckOutcome;
  if (kept === 20) outcome = "critSuccess";
  else if (kept === 1) outcome = "critFail";
  else if (margin >= 0) outcome = "success";
  else if (spec.allowPartial && margin >= -PARTIAL_MARGIN) outcome = "partial";
  else outcome = "fail";

  const xpGained = outcome === "critSuccess" ? 3 : outcome === "success" ? 1 : 2;
  return { spec, mode, dice, kept, modifiers: ctx.modifiers, modifierTotal, total, margin, outcome, xpGained };
}

/** 선택지 버튼에 표시할 성공 확률 (부분 성공은 제외) */
export function successChance(modifierTotal: number, dc: number, mode: RollMode): number {
  const p = Math.min(0.95, Math.max(0.05, (21 - (dc - modifierTotal)) / 20));
  if (mode === "advantage") return 1 - (1 - p) ** 2;
  if (mode === "disadvantage") return p ** 2;
  return p;
}

export type CombatInitiative = "player" | "enemy" | "roll";
export type DefeatRule = "deathSave" | "robbed" | "scripted";
export type CombatResultKind = "victory" | "fled" | "defeated";

export interface LootEntry {
  itemId: ItemId;
  qty: number;
  /** 0~1 */
  chance: number;
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  defense: number;
  attackBonus: number;
  damage: DiceExpr;
  speed: number;
  /** HP 절반 이하일 때 라운드 종료마다 도망칠 확률 (없으면 끝까지 싸움) */
  morale?: number;
  /** 도망쳤을 때 세울 플래그 */
  onRoutFlag?: FlagId;
  onDefeat: DefeatRule;
  tags: string[];
  loot: LootEntry[];
  /** 승리 시 먹거리 획득 (짐승) */
  food?: number;
  silver?: number;
}

export interface EnemyInstance {
  instanceId: string;
  defId: EnemyId;
  hp: number;
  maxHp: number;
  routed: boolean;
}

export type CombatAction =
  | { type: "attack"; targetId: string }
  | { type: "powerAttack"; targetId: string }
  | { type: "defend" }
  | { type: "useItem"; itemId: ItemId }
  | { type: "flee" };

export interface CombatLogEntry {
  round: number;
  actor: "player" | string;
  text: string;
  check?: CheckResult;
  damage?: number;
}

export interface CombatSetup {
  enemies: EnemyId[];
  initiative: CombatInitiative;
  canFlee: boolean;
  /** 도주 불가 사유 (UI 표시) */
  noFleeReason?: string;
  /** 스토리 전투에서 적용할 추가 보정 */
  enemyHpModifier?: number;
  playerDefenseBonus?: number;
  firstAttackAdvantage?: boolean;
  onVictory: SceneId;
  onFled?: SceneId;
  onDefeat?: SceneId;
}

export interface CombatState {
  setup: CombatSetup;
  enemies: EnemyInstance[];
  round: number;
  phase: "playerTurn" | "enemyTurn" | "ended";
  /** 방어 자세 보너스 (다음 내 턴 시작 시 0) */
  defendBonus: number;
  /** 대실패로 인한 다음 턴 방어도 페널티 */
  defensePenalty: number;
  /** 도주 실패 → 이번 적 턴 유리함 */
  enemyAdvantageThisRound: boolean;
  arrowsFired: number;
  /** 전투 중 HP 1/3 이하 부상이 이미 적용됐는지 */
  lowHpWoundApplied: boolean;
  xpThisCombat: Partial<Record<SkillId, number>>;
  log: CombatLogEntry[];
  result?: CombatResultKind;
}

export interface DeathSaveResult {
  roll: number;
  total: number;
  outcome: "miracle" | "rescued" | "dead";
}

export const DEATH_SAVE_DC = 10;
export const DEATH_SAVE_VILLAGE_BONUS = 2;
export const CRITICAL_WOUND_MORNING_DC = 8;
export const POWER_ATTACK_HIT_PENALTY = -2;
export const POWER_ATTACK_DAMAGE_BONUS = 3;
export const ARROW_RECOVERY_RATE = 0.5;

export type Condition =
  | { type: "dayRange"; min?: number; max?: number }
  | { type: "flag"; flag: FlagId; value?: boolean | number }
  | { type: "notFlag"; flag: FlagId }
  | { type: "stat"; stat: StatId; min: number }
  | { type: "skill"; skill: SkillId; min: number }
  | { type: "reputation"; min?: number; max?: number }
  | { type: "silver"; min: number }
  | { type: "food"; min: number }
  | { type: "hasItem"; itemId: ItemId; qty?: number }
  | { type: "equipped"; itemId: ItemId }
  | { type: "job"; job: JobId }
  | { type: "wound"; max: WoundLevel }
  | { type: "fatigue"; max?: number; min?: number }
  | { type: "trait"; trait: TraitId }
  | { type: "chance"; p: number }
  | { type: "any"; of: Condition[] };

export type Effect =
  | { type: "silver"; delta: number }
  | { type: "food"; delta: number }
  | { type: "hp"; delta: number }
  | { type: "fatigue"; delta: number }
  | { type: "reputation"; delta: number }
  | { type: "addItem"; itemId: ItemId; qty: number }
  | { type: "removeItem"; itemId: ItemId; qty: number }
  | { type: "wound"; steps: number }
  | { type: "healWound"; to: WoundLevel }
  | { type: "setFlag"; flag: FlagId; value?: boolean | number }
  | { type: "incFlag"; flag: FlagId; delta: number }
  | { type: "skillXp"; skill: SkillId; amount: number }
  | { type: "gainTrait"; trait: TraitId }
  | { type: "startCombat"; combat: CombatSetup }
  /** 남은 행동 슬롯을 소모하고 저녁으로 */
  | { type: "endDay" }
  | { type: "loseNextSlot" }
  | { type: "ending"; ending: EndingId }
  /** 최종 습격 뒤: 플래그·수치로 엔딩을 판정해 회차를 끝낸다 (story/ending.ts의 표) */
  | { type: "resolveEnding" };

export type TextBlock =
  | string
  | { variants: { when: Condition[]; text: string }[]; fallback: string };

export interface Outcome {
  text?: TextBlock;
  effects?: Effect[];
  /** 다음 장면 ID, 또는 "END"로 이벤트 종료 */
  next: SceneId | "END";
}

export interface OutcomeMap {
  critSuccess?: Outcome;
  success: Outcome;
  partial?: Outcome;
  fail: Outcome;
  critFail?: Outcome;
}

export interface ChoiceCost {
  silver?: number;
  food?: number;
  fatigue?: number;
  item?: { itemId: ItemId; qty: number };
}

interface ChoiceBase {
  id: string;
  label: string;
  /** 표시·활성 조건 */
  conditions?: Condition[];
  /** 조건 미충족 시 숨김 (기본 false → 잠김 표시) */
  hideIfLocked?: boolean;
  /** 잠김 사유 문구 (생략 시 조건에서 자동 생성) */
  lockedReason?: string;
  cost?: ChoiceCost;
}

export type ChoiceDef =
  | (ChoiceBase & { check?: undefined; outcome: Outcome })
  | (ChoiceBase & { check: CheckSpec; outcomes: OutcomeMap });

export interface SceneDef {
  text: TextBlock;
  onEnter?: Effect[];
  /** 비어 있으면 "계속" 버튼 → autoNext */
  choices: ChoiceDef[];
  autoNext?: SceneId | "END";
}

export type EventCategory = "story" | "morning" | "explore" | "npc" | "night";

export type RepeatRule =
  | { mode: "once" }
  | { mode: "cooldown"; days: number }
  | { mode: "always" };

export interface EventDef {
  id: EventId;
  category: EventCategory;
  region?: RegionId;
  /** npc 이벤트의 대상 NPC: hamon · brock · lena · magda · toby (labels.ts의 NPC_IDS) */
  npc?: string;
  title: string;
  conditions: Condition[];
  weight: number;
  /** story 이벤트 우선순위 (높을수록 먼저) */
  priority?: number;
  repeat: RepeatRule;
  dangerTier?: 1 | 2 | 3;
  startScene: SceneId;
  scenes: Record<SceneId, SceneDef>;
}

/** 진행 중인 이벤트 (저장 대상) */
export interface ActiveEventState {
  eventId: EventId;
  sceneId: SceneId;
  /** 탐험 중일 때 남은 카드 정보 */
  explore?: { region: RegionId; cardsDrawn: number; deep: boolean };
  /** 직전 판정 결과 (재진입 시 결과 화면 복원용) */
  lastCheck?: CheckResult;
}

export interface EventHistoryEntry {
  count: number;
  lastDay: number;
}

export const SAMPLE_EVENT_WOLF: EventDef = {
  id: "forest_wolf_01",
  category: "explore",
  region: "forest",
  title: "덤불 속의 눈",
  conditions: [{ type: "dayRange", min: 2 }],
  weight: 10,
  repeat: { mode: "cooldown", days: 4 },
  dangerTier: 1,
  startScene: "start",
  scenes: {
    start: {
      text: {
        variants: [{ when: [{ type: "trait", trait: "wolf_hunter" }], text: "익숙한 냄새다. 늑대 한 마리가 덤불 뒤에 숨어 있다." }],
        fallback: "덤불 사이로 누런 눈이 번뜩인다. 낮게 으르렁거리는 소리.",
      },
      choices: [
        {
          id: "shoot", label: "먼저 활을 쏜다",
          conditions: [{ type: "equipped", itemId: "hunting_bow" }],
          cost: { item: { itemId: "arrow", qty: 1 } },
          check: { stat: "agi", skill: "bow", dc: 12, tags: ["beast"] },
          outcomes: {
            success: { text: "화살이 늑대의 어깨에 꽂혔다!", next: "fight_advantage" },
            fail: { text: "화살이 빗나갔다. 늑대가 달려든다!", next: "fight" },
          },
        },
        {
          id: "back_off", label: "눈을 마주친 채 천천히 물러난다",
          check: { stat: "per", skill: "tracking", dc: 10, allowPartial: true },
          outcomes: {
            success: { text: "늑대는 따라오지 않았다.", next: "END" },
            partial: { text: "도망치다 가시덤불에 긁혔다.", effects: [{ type: "hp", delta: -1 }, { type: "fatigue", delta: 1 }], next: "END" },
            fail: { text: "등을 보인 순간, 늑대가 뛰어올랐다!", next: "fight_ambushed" },
          },
        },
        {
          id: "throw_food", label: "말린 고기를 던져 준다 (식량 -1)",
          conditions: [{ type: "food", min: 1 }],
          cost: { food: 1 },
          outcome: { text: "늑대는 고기를 물고 사라졌다. 오늘 저녁은 조금 배고프겠다.", next: "END" },
        },
      ],
    },
    fight: {
      text: "피할 수 없다. 무기를 쥔다.",
      onEnter: [{ type: "startCombat", combat: { enemies: ["wolf"], initiative: "roll", canFlee: true, onVictory: "win", onFled: "fled" } }],
      choices: [],
    },
    fight_advantage: {
      text: "상처 입은 늑대가 비틀거리며 다가온다.",
      onEnter: [{ type: "startCombat", combat: { enemies: ["wolf"], initiative: "player", canFlee: true, enemyHpModifier: -3, onVictory: "win", onFled: "fled" } }],
      choices: [],
    },
    fight_ambushed: {
      text: "등에 날카로운 이빨이 박힌다!",
      onEnter: [{ type: "startCombat", combat: { enemies: ["wolf"], initiative: "enemy", canFlee: true, onVictory: "win", onFled: "fled" } }],
      choices: [],
    },
    win: {
      text: "숨을 몰아쉰다. 늑대 가죽은 여관에서 값을 쳐줄 것이다.",
      onEnter: [{ type: "addItem", itemId: "wolf_pelt", qty: 1 }, { type: "incFlag", flag: "wolves_killed", delta: 1 }],
      choices: [],
      autoNext: "END",
    },
    fled: {
      text: "정신없이 달려 마을 울타리까지 왔다. 오늘 숲은 여기까지다.",
      choices: [],
      autoNext: "END",
    },
  },
};

export type ItemCategory = "weapon" | "armor" | "shield" | "consumable" | "material" | "quest";
export type WeaponSkill = Extract<SkillId, "blade" | "blunt" | "bow">;

interface ItemDefBase {
  id: ItemId;
  name: string;
  category: ItemCategory;
  description: string;
  /** 구매가 (0이면 상점 미판매) */
  price: number;
  /** 판매가를 별도 지정 (재료 등). 없으면 price의 50% */
  sellPrice?: number;
  sellable: boolean;
  stackMax: number;
}

export interface WeaponDef extends ItemDefBase {
  category: "weapon";
  skill: WeaponSkill;
  damage: DiceExpr;
  twoHanded: boolean;
  ammo?: ItemId;
  requires?: Partial<Stats>;
  durabilityMax: number;
}

export interface ArmorDef extends ItemDefBase {
  category: "armor";
  defense: number;
  /** 특정 능력치 판정 페널티 */
  checkPenalty?: { stat: StatId; value: number };
  durabilityMax: number;
}

export interface ShieldDef extends ItemDefBase {
  category: "shield";
  defense: number;
  durabilityMax: number;
}

export interface ConsumableDef extends ItemDefBase {
  category: "consumable";
  /** 화살처럼 직접 '사용'하지 않는 소모품이면 빈 배열 */
  use: Effect[];
  /** 확률형 효과: 약초의 경상 치료 50% */
  chanceEffects?: { p: number; effects: Effect[] }[];
  usableInCombat: boolean;
}

export interface MaterialDef extends ItemDefBase {
  category: "material";
}

export interface QuestItemDef extends ItemDefBase {
  category: "quest";
  sellable: false;
}

export type ItemDef = WeaponDef | ArmorDef | ShieldDef | ConsumableDef | MaterialDef | QuestItemDef;

export interface ItemStack {
  itemId: ItemId;
  qty: number;
  /** 장비류만 사용 */
  durability?: number;
}

export interface Equipment {
  weapon: ItemStack | null;
  armor: ItemStack | null;
  shield: ItemStack | null;
}

export interface Inventory {
  /** 길이 = capacity, 빈 칸은 null */
  slots: (ItemStack | null)[];
  capacity: number;
  equipment: Equipment;
}

export const INVENTORY_CAPACITY = 10;
export const SELL_RATE = 0.5;
export const REPAIR_SILVER_PER_DURABILITY = 1 / 5;
export const REP_DISCOUNT_THRESHOLD = 60;
export const REP_DISCOUNT_RATE = 0.1;
export const REP_SURCHARGE_THRESHOLD = 10;
export const REP_SURCHARGE_RATE = 0.1;
export const REP_HEAVY_SURCHARGE_THRESHOLD = 5;
export const REP_HEAVY_SURCHARGE_RATE = 0.2;

export const SAMPLE_ITEMS: ItemDef[] = [
  { id: "hunting_bow", name: "사냥용 활", category: "weapon", description: "손때 묻은 짧은 활.", price: 12, sellable: true, stackMax: 1,
    skill: "bow", damage: "1d6", twoHanded: true, ammo: "arrow", durabilityMax: 20 },
  { id: "leather_armor", name: "가죽 갑옷", category: "armor", description: "질긴 소가죽으로 만든 조끼.", price: 25, sellable: true, stackMax: 1,
    defense: 2, durabilityMax: 25 },
  { id: "chain_shirt", name: "사슬 갑옷", category: "armor", description: "무겁지만 든든하다.", price: 60, sellable: true, stackMax: 1,
    defense: 3, checkPenalty: { stat: "agi", value: -1 }, durabilityMax: 25 },
  { id: "herb", name: "약초", category: "consumable", description: "씹으면 쓰지만 상처가 아문다.", price: 2, sellable: true, stackMax: 5,
    use: [{ type: "hp", delta: 2 }], chanceEffects: [{ p: 0.5, effects: [{ type: "healWound", to: "none" }] }], usableInCombat: true },
  { id: "goblin_token", name: "고블린 부적", category: "quest", description: "뼈와 깃털을 엮은 부적. 촌장에게 보여야 한다.", price: 0, sellable: false, stackMax: 1 },
];

export type DayPhase = "morning" | "am" | "pm" | "evening";

export interface TimeState {
  day: number;
  phase: DayPhase;
  /** 탈진 등으로 다음 날 오전을 잃는지 */
  skipNextAm: boolean;
  /** 오늘 휴식 행동 횟수 (수면 보너스 계산) */
  restsToday: number;
  /** 오늘 탈진했는지. 저녁 수면에서 회복 대신 피로를 FATIGUE_AFTER_COLLAPSE로 맞춘다 */
  collapsedToday: boolean;
}

export const LAST_DAY = 30;
export const TAX_INTERVAL_DAYS = 7;
export const TAX_AMOUNT = 5;
export const DEBT_INTEREST = 2;
export const DEBT_ENDING_THRESHOLD = 20;
export const FOOD_PRICE = 1;
export const NIGHT_EVENT_CHANCE = 0.25;

export const FATIGUE_MAX = 10;
export const FATIGUE_DISADVANTAGE_AT = 7;
export const FATIGUE_AFTER_COLLAPSE = 6;
export const SLEEP_RECOVERY = 3;

export interface Resources {
  silver: number;
  food: number;
  debt: number;
  fatigue: number;
  /** 본인 굶주림 단계 */
  hunger: number;
  familyHunger: number;
}

export interface WoundState {
  level: WoundLevel;
  /** 경상: 휴식 누적 횟수 (2회면 회복) */
  restCount: number;
  /** 중상: 치료 후 경과일 (null = 미치료) */
  treatedDays: number | null;
  /** 중상: 방치 경과일 */
  untreatedDays: number;
}

export type DailyActionId = "work" | "trainSolo" | "trainLesson" | "explore" | "rest" | "village" | "travelRowen";

export interface WorkDef {
  label: string;
  check: CheckSpec;
  baseSilver: number;
  bonusSilver: number;
  bonusFood: number;
  fatigue: number;
  /** 성공·대성공이면 이 숙련 XP +1 (대장간 일의 망치질 → 둔기) */
  bonusSkillXp?: SkillId;
}

export interface DailyActionDef {
  id: DailyActionId;
  label: string;
  slots: 1 | 2;
  fatigue: number;
  silverCost?: number;
  /** 행동 가능 조건 (예: 탐험은 중상 이상 불가) */
  conditions: Condition[];
  mvp: boolean;
}

export const DAILY_ACTIONS: DailyActionDef[] = [
  { id: "work", label: "일하기", slots: 1, fatigue: 2, conditions: [{ type: "wound", max: "serious" }], mvp: true },
  { id: "trainSolo", label: "혼자 훈련", slots: 1, fatigue: 2, conditions: [{ type: "wound", max: "light" }], mvp: true },
  { id: "trainLesson", label: "레나의 교습", slots: 1, fatigue: 3, silverCost: 3, conditions: [{ type: "wound", max: "light" }, { type: "silver", min: 3 }], mvp: true },
  { id: "explore", label: "탐험", slots: 1, fatigue: 2, conditions: [{ type: "wound", max: "light" }], mvp: true },
  { id: "rest", label: "휴식", slots: 1, fatigue: -3, conditions: [], mvp: true },
  { id: "village", label: "마을 볼일", slots: 1, fatigue: 0, conditions: [], mvp: true },
  { id: "travelRowen", label: "로웬 다녀오기", slots: 2, fatigue: 3, conditions: [{ type: "wound", max: "light" }], mvp: false },
];

export const SAVE_VERSION = 2;
export const SAVE_KEYS = {
  run: "brw.run.v1",
  runBackup: "brw.run.v1.bak",
  runTemp: "brw.run.v1.tmp",
  meta: "brw.meta.v1",
} as const;

export interface RngState {
  seed: number;
  /** mulberry32 내부 상태 */
  state: number;
}

export interface RunState {
  version: number;
  runId: string;
  createdAt: string;
  updatedAt: string;
  rng: RngState;
  player: PlayerState;
  resources: Resources;
  inventory: Inventory;
  time: TimeState;
  flags: Record<FlagId, boolean | number>;
  eventHistory: Record<EventId, EventHistoryEntry>;
  /** 진행 중 이벤트가 없으면 행동 선택 화면 */
  activeEvent: ActiveEventState | null;
  combat: CombatState | null;
  /** 회차가 끝났으면 엔딩 ID (사망 포함). null이면 진행 중 */
  ending: EndingId | null;
  /** 엔딩 화면용 누적 통계 */
  stats: RunStats;
}

export interface RunStats {
  checksRolled: number;
  crits: number;
  fumbles: number;
  combatsWon: number;
  timesFled: number;
  deathSavesSurvived: number;
  silverEarned: number;
  /** 가장 위험했던 순간: 최저 HP와 그 날짜 */
  lowestHp: { hp: number; day: number } | null;
}

/** 봉인(seal) 안에 들어가는 내용. 서명이 손상·조작을 함께 막으므로 따로 체크섬을 두지 않는다 */
export interface RunSaveFile {
  version: number;
  savedAt: string;
  data: RunState;
}

export type EndingId =
  | "shield_of_village"
  | "flee_together"
  | "rowen_spearman"
  | "hero_party"
  | "survivor"
  | "debtor"
  | "death";

export interface RunRecord {
  runId: string;
  job: JobId;
  ending: EndingId | "abandoned";
  /** 사망 시 원인과 장소 (묘비문 생성용) */
  death?: { cause: string; region: RegionId; day: number };
  daysSurvived: number;
  traits: TraitId[];
  bestSkill: { skill: SkillId; rank: number } | null;
  finishedAt: string;
}

export interface Settings {
  diceAnimation: boolean;
  /** 0.8 ~ 1.4 */
  fontScale: number;
  textSpeed: "instant" | "fast" | "normal";
  haptics: boolean;
}

export interface MetaSave {
  version: number;
  endingsSeen: EndingId[];
  traitsSeen: TraitId[];
  history: RunRecord[];
  totalRuns: number;
  settings: Settings;
}

export type Migration = (old: unknown) => unknown;

/** 시드 기반 RNG. 상태를 RngState.state에 저장/복원한다. */
export function createRng(rngState: RngState): Rng {
  return () => {
    rngState.state = (rngState.state + 0x6d2b79f5) | 0;
    let t = rngState.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32bit — 저장 파일 손상 감지용 */
export function checksum(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
