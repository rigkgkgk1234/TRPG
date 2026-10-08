# 보리울의 30일 — 시스템 상세 설계서 (v0.1)

> 상위 문서: [게임 기획서](GAME_DESIGN.md)
> 목적: 이 문서만 보고 게임 코어 로직을 구현할 수 있을 정도로 규칙·숫자·데이터 구조를 확정한다.
> 이 문서의 ` ```ts ` 코드 블록은 `scripts/extract-types.mjs`로 모아 `src/core/types.ts`를 생성하며, `tsc`로 타입 검사한다. **문서가 원본**이다.

### 공통 원칙
- 코어 로직은 **순수 함수 + 직렬화 가능한 상태(JSON)** 로 작성한다. UI는 상태를 읽고 액션만 보낸다.
- 모든 무작위는 **시드 기반 RNG** 하나에서 나온다(저장·불러오기 후 같은 결과 → 세이브 스컴 방지, 테스트 재현 가능).
- 콘텐츠(이벤트·적·아이템)는 데이터로 분리한다. 코드는 규칙만 안다.

---

## 0. 공통 기초 타입

```ts
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
```

---

## 1. 능력치

### 1-1. 능력치 5종

| ID | 이름 | 주 사용처 | 파생 수치 |
|----|------|-----------|-----------|
| `str` | 근력 | 근접 공격 명중·피해, 노동(농사·대장일), 힘쓰기 | 근접 피해 보정 |
| `agi` | 민첩 | 활 명중, 회피(방어도), 도주, 은신 | 방어도 |
| `con` | 체력 | 최대 HP, 사망 굴림, 독·질병 저항 | 최대 HP |
| `per` | 감각 | 추적, 위험·함정 감지, 약초 식별, 소문의 진위 | 탐험 기습 회피 |
| `cha` | 말솜씨 | 흥정, 설득, 정보 얻기, 민병대 모집 | 평판 상승량 |

- 수치 = **보정치 그 자체**(D&D의 18 → +4 같은 변환 없음). 화면에도 `+2`로 표시.
- 범위: 최소 `-1`, 자연 성장 상한 `+4`, 장비·흔적 포함 최종 상한 `+5`.

### 1-2. 파생 수치

| 수치 | 공식 | 예시 (농부: 체력+2, 민첩0) |
|------|------|------|
| 최대 HP | `8 + 체력 × 2` | 12 |
| 방어도 | `10 + 민첩 + 방어구 + 방패` | 10 (가죽 갑옷 착용 시 12) |
| 근접 피해 | `무기 주사위 + 근력` (최소 1) | 쇠스랑 1d6+1 |
| 평판 상승 보정 | 말솜씨 +2 이상이면 평판 획득 +1 | — |

### 1-3. 숙련 8종 (MVP)

| ID | 이름 | 연관 능력치 | 쓰이는 곳 |
|----|------|------------|-----------|
| `blade` | 검술 | 근력 | 검·칼 공격 |
| `blunt` | 둔기 | 근력 | 망치·몽둥이·쇠스랑 공격 |
| `bow` | 활 | 민첩 | 활 공격, 사냥 |
| `guard` | 방어 | 체력 | 방어 자세 보너스, 버티기 |
| `farming` | 농사 | 근력 | 농부의 일하기, 수확 이벤트 |
| `smithing` | 대장일 | 근력 | 대장간 일하기, 장비 자가 수리 |
| `tracking` | 추적 | 감각 | 사냥감·적 흔적, 길 찾기 |
| `herbalism` | 약초 | 감각 | 채집, 약 조제, 응급 처치 |

### 1-4. 성장 규칙
- **숙련**: 등급 0~5. 판정마다 경험치(XP) 획득 → 등급별 필요치 `3 / 6 / 10 / 15 / 21`을 채우면 다음 등급, XP는 0으로.

| 판정 결과 | 획득 XP |
|-----------|--------|
| 대성공 | +3 |
| 성공 | +1 |
| 부분 성공 · 실패 · 대실패 | +2 ("실패에서 더 배운다") |
| 교습 훈련(은화 3) | +3 (판정 없음) |

  - **전투 승리 보너스**: 이긴 전투에서 공격에 쓴 무기 숙련 XP +1 (전투 상한과 별개).
  - **남용 방지**: 전투 1회당 같은 숙련 XP 최대 +4, 하루 같은 숙련 XP 최대 +6.
- **능력치**: 해당 능력치를 쓴 판정 횟수(`statUses`)가 15회가 되면 **성장 굴림** `D20 + 현재 능력치 ≤ 15` → 성공 시 +1 후 카운트 0, 실패 시 카운트를 10으로 되돌림(5회 뒤 재도전).
  - 예) 근력 +2: 13 이하가 나와야 하므로 65%. 근력 +3이면 60%. 높을수록 오르기 어렵다.
  - **혼자 훈련(운동)**: 근력 운동(근력)·달리기(민첩)·오래 버티기(체력)·집중 연습(감각) 중 하나. 능력치만으로 DC 10 판정, 판정 1회를 포함해 `statUses` 대성공 +4 / 성공 +3 / 그 밖 +2. 15를 넘겨 쌓지 않으며, 15를 채웠거나 자연 상한(+4)이면 할 수 없다. 말솜씨는 혼자 단련할 수 없다.

```ts
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
export const STAT_GROWTH_RETRY_USES = 10;
export const STAT_GROWTH_TARGET = 15;

export const SKILL_STAT: Record<SkillId, StatId> = {
  blade: "str", blunt: "str", bow: "agi", guard: "con",
  farming: "str", smithing: "str", tracking: "per", herbalism: "per",
};

export type WoundLevel = "none" | "light" | "serious" | "critical";

export interface PlayerState {
  name: string;
  job: JobId;
  stats: Stats;
  /** 능력치별 판정 사용 횟수 (성장 굴림용) */
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
```

### 1-5. 직업별 시작값 (기획서 표 확정본)

```ts
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
```

---

## 2. 주사위 판정 규칙

### 2-1. 굴림 공식
```
최종값 = D20(유리/불리 반영) + 능력치 + 숙련 등급 + 장비 보정 + 부상 보정 + 상황 보정
최종값 ≥ DC  →  성공
```

| DC | 이름 | 예 |
|----|------|----|
| 8 | 쉬움 | 익숙한 밭일, 토끼 쫓기 |
| 10 | 평이 | 혼자 훈련, 평범한 노동 |
| 12 | 보통 | 늑대 추적, 상인과 흥정 |
| 14 | 까다로움 | 감시탑 벽 오르기, 도적 설득 |
| 16 | 어려움 | 고블린 매복 간파 |
| 20 | 영웅적 | 약탈대장 위협하기 |

### 2-2. 유리함 / 불리함
- 유리함: D20 2개 중 **높은 값**, 불리함: **낮은 값**.
- 출처가 여러 개여도 **중첩되지 않는다**. 유리함과 불리함이 하나라도 둘 다 있으면 상쇄되어 일반 굴림.
- 대표 출처

| 유리함 | 불리함 |
|--------|--------|
| 사전 정보(소문·정찰 플래그) | 피로 7 이상 |
| 알맞은 도구(밧줄·덫) | 굶주림 2단계 이상 |
| 흔적 효과(예: 죽다 살아난 자 → 공포 판정) | 중상 상태 |
| 동료 도움(확장) | 밤·폭우 등 환경 |

### 2-3. 보정치 계산 순서
1. `stat` 능력치 값
2. `skill` 숙련 등급(지정된 경우)
3. 장비 보정(예: 사슬 셔츠 → 민첩 판정 -1)
4. 부상 보정: 경상 → `str`·`agi` 판정 -2 / 중상·치명상 → 모든 판정 -4
5. 이벤트가 지정한 상황 보정(±1~3)
6. 흔적 보정(예: 늑대 사냥꾼 → `beast` 태그 판정 +1)

화면에는 합계와 함께 내역을 펼쳐볼 수 있게 표시한다. (`민첩 +2 / 활 +2 / 경상 -2 = +2`)

### 2-4. 결과 5단계

| 결과 | 조건 | 기본 처리 |
|------|------|-----------|
| **대성공** | 남은 주사위가 자연 20 | 항상 성공. 이벤트의 `critSuccess` 분기, 없으면 `success` 분기 + XP +3 |
| **성공** | 최종값 ≥ DC | `success` 분기 |
| **부분 성공** | DC-2 ≤ 최종값 < DC, 그리고 선택지가 `allowPartial` | 목적은 이루지만 대가(피로·부상·손실). `partial` 분기 |
| **실패** | 그 외 | `fail` 분기 |
| **대실패** | 남은 주사위가 자연 1 | 항상 실패. `critFail` 분기, 없으면 `fail` 분기 + 추가 페널티(피로 +1) |

- 대성공/대실패 판정은 **최종으로 채택된 주사위** 기준(유리함일 때 20+3이면 20 채택 → 대성공).
- 부분 성공은 "아슬아슬했다"를 서사로 살리는 장치. 이벤트에 `partial` 분기가 없으면 실패로 처리.

### 2-5. 성공 확률 표시
일반 굴림 단일 확률 `p = clamp((21 - (DC - 보정)) / 20, 0.05, 0.95)`
유리함 `1 - (1-p)²`, 불리함 `p²`

| 상황 | 보정 | DC | 확률 |
|------|------|----|------|
| 시작 농부가 늑대에게 쇠스랑 공격 (근력1 + 둔기0) vs 방어도 11 | +1 | 11 | 55% |
| 시작 사냥꾼의 활 공격 (민첩2 + 활2) | +4 | 11 | 70% |
| 같은 사냥꾼, 피로 8 (불리함) | +4 | 11 | 49% |
| 20일차 사냥꾼 (민첩3 + 활4) | +7 | 11 | 85% |
| 시작 대장장이의 흥정 (말솜씨1) | +1 | 12 | 50% |

```ts
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
```

---

## 3. 전투 시스템

설계 목표: **한 판 3~5라운드, 버튼 탭 5~8회**. 플레이어는 "행동 선택 → 주사위 탭"만 하고, 적의 굴림은 자동으로 진행·표시한다.

### 3-1. 전투 구성
- 적 1~3체(MVP). 대상 선택은 기본 "가장 앞의 적", 탭으로 변경 가능.
- 전투는 이벤트 효과 `startCombat`로만 시작하며, 결과(승리/도주/패배)에 따라 이벤트 장면으로 돌아간다.

### 3-2. 턴 진행 순서
```
[전투 시작]
  선공 결정: 이벤트가 지정 (player / enemy / roll)
    roll = D20 + 민첩 vs DC(10 + 적 최고 속도) → 성공 시 플레이어 선공
  ↓
[라운드 N]
  1. 플레이어 턴: 행동 1개 선택 → 판정 → 결과
  2. 적 턴: 살아있는 적이 순서대로 공격 (자동 굴림)
  3. 라운드 종료: 사기 판정(사기 수치가 있는 적), 방어 자세 해제, 종료 조건 확인
  ↓
[종료 조건]
  모든 적 HP 0 또는 도주(적 사기) → 승리
  플레이어 도주 성공 → 도주
  플레이어 HP 0 → 패배
```
적이 선공이면 라운드 1은 적 턴부터 시작한다.

### 3-3. 행동 종류

| 행동 | 판정 | 효과 | 비고 |
|------|------|------|------|
| **공격** | D20 + (근접: 근력 / 활: 민첩) + 무기 숙련 vs 적 방어도 | 명중 시 무기 피해 | 활은 화살 1개 소모 |
| **강타** (활은 "조준 사격") | 공격과 같되 **-2** | 명중 시 피해 **+3** | 피로 +1 |
| **방어 자세** | 없음 | 다음 내 턴까지 방어도 **+2 + 방어 숙련 등급** | 적이 빗나가면 방어 XP +1 |
| **아이템 사용** | 없음 | 소모품 효과(`usableInCombat`) | 턴 소모 |
| **도주** | D20 + 민첩 vs DC(10 + 적 최고 속도) | 성공 시 전투 이탈 | 실패 시 이번 라운드 적 공격 유리함 |

- **피해**: 무기 주사위 + 근력(근접만), 최소 1. **대성공 시 주사위 개수 2배**(1d6 → 2d6, 보정은 1번만).
- **대실패**: 근접 → 다음 턴 방어도 -2 / 활 → 화살 1개 추가 손실 / 공통 → 무기 내구도 -2.
- **적 공격**: D20 + 적 공격 보정 vs 플레이어 방어도. 적의 자연 20 → 피해 2배 + 플레이어 부상 1단계.
- 전투 후 회수: 쏜 화살의 50%(내림) 회수.
- 전투 1회마다 피로 +1 (승패 무관).

### 3-4. 도주
- DC = `10 + 적 중 최고 속도`. 예) 늑대(속도 4) → DC 14. 시작 사냥꾼(민첩+2)은 45%, 농부(0)는 35%.
- 성공: 전투 종료, 이벤트의 `onFled` 장면으로. 탐험 중이었다면 남은 카드 없이 귀가.
- 실패: 그 라운드 적 공격이 유리함으로 굴려진다.
- `canFlee: false`인 전투(최종 습격 등)는 버튼 비활성 + 이유 표시("등 뒤에 가족이 있다").

### 3-5. 부상과 사망

**부상 단계** (단일 상태값, 새 부상을 입으면 한 단계 악화)

| 단계 | 판정 보정 | 제약 | 회복 |
|------|----------|------|------|
| 없음 | — | — | — |
| 경상 | `str`·`agi` 판정 -2 | — | 휴식 행동 2회, 또는 붕대·약초 사용 |
| 중상 | 모든 판정 -4, 불리함 | 탐험·훈련 불가(탐험 중 중상이 되면 남은 카드 없이 귀가), 밤 HP 회복 없음 | 의원 치료(은화 5) 후 3일 → 경상. 방치 5일 → 경상 + 흔적 「오래된 상처」(민첩 -1 영구) |
| 치명상 | 모든 판정 -4, 불리함 | 마을 볼일·휴식만 가능 | 신전/치유 물약 → 중상, 또는 약초방 응급 처치(은화 12, 피로 +2) → 치료받은 중상. 방치 시 매일 아침 사망 굴림(DC 8) |

**부상 발생 조건**
1. 적의 대성공 공격에 맞음 → 부상 1단계 악화
2. 한 전투에서 처음으로 HP가 최대 HP의 1/3 이하가 됨 → 부상 1단계 악화
3. 이벤트 효과(`wound`)
4. HP 0에서 살아남음 → 최소 중상

**HP 0 → 패배 처리** (적 그룹의 `onDefeat` 규칙)

| 규칙 | 대상 | 처리 |
|------|------|------|
| `deathSave` | 짐승, 고블린 | **사망 굴림** `D20 + 체력 ≥ 10` (마을 안에서는 +2) |
| `robbed` | 도적 | 사망 없음. 은화 50% + 무작위 소지품 1개 강탈, HP 1, 부상 1단계 악화 |
| `scripted` | 스토리 전투 | 이벤트가 지정한 장면으로 |

**사망 굴림 결과**

| 결과 | 처리 |
|------|------|
| 자연 20 | 기적적으로 일어섬. HP 1, 경상. 흔적 「죽다 살아난 자」 |
| 성공 | 누군가에게 발견됨. HP 1, 중상, 은화 -30%, 그날의 남은 행동 소실(다음 날 아침 집에서 깨어남). 흔적 「죽다 살아난 자」 |
| 실패 / 자연 1 | **사망 → 회차 종료** (사망 엔딩, 묘비문 기록) |

- 시작 확률: 농부(체력+2) 65%, 사냥꾼(체력+1) 60%. 죽음은 언제나 진짜 위협이다.

### 3-6. MVP 적 데이터

| 적 | HP | 방어도 | 공격 | 피해 | 속도 | 사기 | 패배 규칙 | 태그 |
|----|---:|------:|-----:|------|----:|----:|-----------|------|
| 늑대 | 6 | 11 | +3 | 1d6 | 4 | 50% | deathSave | beast |
| 멧돼지 | 9 | 10 | +3 | 1d6 | 2 | 30% | deathSave | beast |
| 도적 | 9 | 12 | +3 | 1d6 | 2 | 30% | robbed | humanoid |
| 들개 | 4 | 10 | +1 | 1d4 | 4 | 60% | deathSave | beast |
| 큰 쥐 | 3 | 9 | +1 | 1d3 | 3 | 50% | deathSave | beast |
| 밀렵꾼 | 6 | 10 | +1 | 1d4 | 3 | 60% | robbed | humanoid |
| 고블린 정찰병 | 6 | 12 | +2 | 1d4+1 | 3 | 50% (도망 시 플래그 `goblin_alerted`) | deathSave | goblin |
| 고블린 전사 | 12 | 14 | +4 | 1d8 | 2 | — | deathSave | goblin |
| 약탈대장 | 18 | 13 | +4 | 1d8+1 | 2 | — | scripted | goblin, boss |

- **사기**: HP가 절반 이하가 된 라운드 종료 시 이 확률로 도망 → 승리 처리(전리품 절반).

**밸런스 확인 (시작 사냥꾼 vs 늑대)**
- 사냥꾼 명중 70% × 평균 피해 3.5 → 늑대(HP 6)를 약 2.5라운드에 처치.
- 늑대 명중 `+3 vs 방어도 12` 60% × 3.5 → 라운드당 2.1 피해. 2.5라운드면 약 5 피해 → 사냥꾼 HP 10 중 5 남음(부상 조건 2에 걸릴 확률 높음).
- 20일차(민첩3·활4·가죽 갑옷): 명중 85%, 늑대 명중 45% → 받는 피해가 절반 이하. **성장을 숫자로 체감**.

**최종 습격 전투 보정** (`scripted` 스토리 전투 전용)
- 민병대 인원 = `floor(평판 / 20)` (최대 5). 1명당 약탈대장 시작 HP -3.
- 플래그 보정: `palisade_built`(목책) → 플레이어 방어도 +2, `goblin_plan_known`(작전 정보) → 플레이어 선공 + 첫 공격 유리함.

```ts
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
```

---

## 4. 이벤트 시스템

### 4-1. 구조
```
EventDef
 └─ scenes: { [sceneId]: SceneDef }
      SceneDef = 텍스트 + onEnter 효과 + 선택지[]
        ChoiceDef = 라벨 + 표시조건 + 비용 + (판정) + 결과
           결과(Outcome) = 텍스트 + 효과[] + next(다음 장면 | "END")
```
- **판정 없는 선택지**: `outcome` 하나만 가진다.
- **판정 있는 선택지**: `outcomes`에 `success`/`fail` 필수, `critSuccess`/`partial`/`critFail` 선택. (없으면 2-4의 대체 규칙)
- 선택지가 없는 장면은 자동으로 "계속" 버튼 1개 → `next`.
- 한 장면 텍스트는 **4~6줄**, 선택지는 **최대 4개**(세로 한 손 UI 제약).

### 4-2. 선택지 표시 규칙
| 상태 | 조건 | 표시 |
|------|------|------|
| 활성 | 조건 충족 | 정상 버튼 + 성공 확률 + 비용 아이콘 |
| 잠김 | 조건 미충족, `hideIfLocked: false` | 회색 버튼 + 사유("활 숙련 2 필요") — 성장 목표 제시 |
| 숨김 | 조건 미충족, `hideIfLocked: true` | 표시 안 함 — 숨은 루트용 |
| 위험 | 실패 결과에 `startCombat`·`wound`·`death` 포함 | 해골 아이콘 |

### 4-3. 이벤트 종류와 발생 조건

| 종류 | 발생 시점 | 선택 방식 |
|------|----------|-----------|
| `story` | 매 슬롯 시작 전 검사 | 조건 충족 시 **강제 발생**, `priority` 높은 순 1개 |
| `morning` | 매일 아침 1회 (2일차부터, 날이 바뀐 직후) | 가중치 무작위 1개 (소문·날씨·가벼운 효과). 후보가 없으면 없음 |
| `explore` | 탐험 행동 | 지역 풀에서 카드 2장 연속, 2장 후 "더 깊이" 선택 시 1장 추가 |
| `npc` | 마을 볼일 행동 | NPC 선택(`hamon`·`brock`·`lena`·`magda`·`toby`) → 그 NPC 풀에서 가중치 무작위 1개. 이벤트가 끝나면 행동 슬롯을 쓴다. 후보가 없으면 `npc_fallback` |
| `night` | 저녁 정산 후 | **25%** 확률로 1개. 밤 이벤트가 끝나야 날이 바뀐다 (다음 날 오전을 잃게 하려면 `loseNextSlot`) |

**발생 알고리즘 (공통)**
1. 해당 종류·지역의 이벤트 풀을 가져온다.
2. `conditions`를 모두 만족하지 않으면 제외.
3. `repeat` 규칙 위반(once 이미 발생 / cooldown 미경과) 제외.
4. 위험 등급 필터(탐험): `dangerTier ≤ 현재 등급`. 현재 등급 = 1~10일차 1, 11~20일차 2, 21일차~ 3. "더 깊이" 카드는 등급 +1.
5. 가중치 보정: 현재 등급과 같은 등급의 카드 가중치 ×2. 최근 3일 안에 본 카드 ×0.3.
6. 가중치 무작위 추첨. 후보가 없으면 지역별 `fallback` 이벤트("조용한 하루").

**MVP 이벤트 수량 목표**: story 15 / morning 30 / explore 숲 30·감시탑 30 / npc 20 / night 10 → **약 135개**. (7주차 현재: story 17 / morning 30 / 숲 30·감시탑 30 / npc 20 / night 10 = 137개 + 대체 이벤트 3개)
- 아침·밤 이벤트는 행동 슬롯 밖에서 일어나므로 `endDay`를 쓸 수 없다(빌드 오류). 마을 볼일 이벤트는 `npc`가 있어야 한다.

### 4-4. 주요 스토리 트리거 예시

| ID | 조건 | 내용 |
|----|------|------|
| `story_missing_sheep` | 3일차 이상 | 사라진 양 → 숲 탐험 동기 부여 |
| `story_goblin_tracks` | 숲 탐험 중, 7일차 이상, `tracking` 판정 성공 | 고블린 발자국 발견 → 플래그 `goblin_tracks_found` |
| `story_scout` | 11일차 이상, 감시탑 탐험 | 고블린 정찰병 조우 (전투) |
| `story_report` | 플래그 `goblin_scout_seen` | 촌장에게 보고 → 평판 +10, 대응 방향 선택 시작 |
| `story_recruiter` | 15일차 | 로웬 모집관 방문 → 「로웬의 창병」 루트 |
| `story_heroes_arrive` | 9일차 | 용사 일행 방문. 직업별 일거리(농부: 곡식 팔기 / 대장장이 견습: 검 수리 / 사냥꾼: 숲길 안내) → `heroes_met`, 도우면 `heroes_helped` |
| `story_heroes_return` | 19일차, `heroes_met` | 궁수가 빠진 일행. 무기 숙련 3이면 시험(DC 13) → 합류 제안 → `route_hero` |
| `story_heroes_departure` | 26일차, `route_hero` | 따라나서면 「용사 일행」 엔딩, 남으면 `route_defend` |
| `story_decision` | 21일차 아침 | 방어 / 피난 / 개인의 길 선택 → 플래그 `route_*` |
| `story_raid` | 30일차 저녁 | 최종 습격 → 엔딩 판정 |

### 4-5. 텍스트 변형
같은 장면에서 조건에 따라 문장을 바꿔 재사용성을 높인다. (`{name}`, `{job}`, `{silver}` 치환 지원)

```ts
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
```

### 4-6. 이벤트 데이터 예시 (숲 · 위험 등급 1)

```ts
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
```

---

## 5. 아이템 · 장비 · 인벤토리

### 5-1. 분류
| 분류 | 설명 | 겹침 |
|------|------|------|
| `weapon` | 무기. 장착 1개 | 1 |
| `armor` | 몸 방어구. 장착 1개 | 1 |
| `shield` | 방패. 장착 1개, **양손 무기·활과 동시 사용 불가** | 1 |
| `consumable` | 사용 시 소멸 | 3~20 |
| `material` | 판매·제작용 (가죽, 약초) | 5 |
| `quest` | 스토리 증거물. 판매·버리기 불가 | 1 |

### 5-2. 인벤토리 규칙
- **가방 10칸** 고정(MVP). 장착 중인 장비는 칸을 차지하지 않는다.
- 같은 아이템은 `stackMax`까지 한 칸에 겹친다. (화살 20, 약초 5, 물약 3)
- 가방이 가득 차면 획득 시 "버릴 것 고르기" 시트를 띄운다(버리기 거부 = 새 아이템 포기).
- **식량과 은화는 아이템이 아닌 자원**(칸 차지 없음). 사냥 고기는 획득 즉시 식량으로 환산.

### 5-3. 내구도
- 무기·방어구·방패에 내구도가 있다(무기 20 / 방어구 25 / 방패 15).
- 감소: 전투 1회 사용 시 -1(무기는 공격했을 때, 방어구·방패는 맞았을 때), 대실패 -2.
- 0이 되면 **파손**: 무기 피해 -2(최소 1), 방어구·방패 보너스 0. 버려지지는 않는다.
- 수리: 대장간 브록에게 `내구도 5당 은화 1`(올림). 대장장이 견습은 반값, 또는 `smithing` DC 12 판정으로 무료 자가 수리(행동 1회).

### 5-4. 가격 규칙
- 판매가 = 구매가의 50%(내림). `quest` 판매 불가.
- 평판 보정: 평판 60 이상 → 구매가 -10% / 10 미만 → +10% / 5 미만 → +20% (올림). 시작 평판(10)은 보정 없음, 사냥꾼(5)은 +10%.
- 상점 이용·수리·치료 같은 **거래는 행동 슬롯을 소모하지 않는다**(아침·저녁 '마을 메뉴'에서 가능, 탐험 중 불가).

### 5-5. MVP 아이템 목록

가게: 대장간(무기·방어구·방패 17종), 약초방(약 8종), 여관(화살 10개 3닢, 스튜, 보리술, 식량). 가격은 은화 1~45. 30일 동안 버는 돈이 50닢 안팎이라 45를 넘는 물건은 두지 않는다.

**무기**

| ID | 이름 | 숙련 | 피해 | 가격 | 비고 |
|----|------|------|------|----:|------|
| `fist` | 맨주먹 | blunt | 1d2 | — | 무기 없을 때 자동 |
| `club` | 몽둥이 | blunt | 1d4 | 3 | 내구도 12 |
| `hunting_knife` | 사냥칼 | blade | 1d4 | 5 | |
| `pitchfork` | 쇠스랑 | blunt | 1d6 | 6 | 양손 |
| `old_hammer` | 낡은 망치 | blunt | 1d6 | 8 | |
| `hand_axe` | 손도끼 | blade | 1d6 | 11 | 내구도 16 |
| `rusty_sword` | 녹슨 검 | blade | 1d6 | 15 | |
| `short_spear` | 짧은 창 | blunt | 1d8 | 18 | 양손 |
| `war_hammer` | 전투 망치 | blunt | 1d8 | 30 | 근력 +2 이상 필요, 내구도 25 |
| `soldier_sword` | 병사의 검 | blade | 1d8 | 32 | 감시탑 보상으로도 획득 |
| `goblin_axe` | 고블린 도끼 | blade | 1d8 | — | 고블린 전사 전리품(50%), 판매 8, 내구도 12 |
| `hunting_bow` | 사냥활 | bow | 1d6 | 12 | 양손, 화살 소모 |
| `longbow` | 장궁 | bow | 1d8 | 28 | 양손, 근력 +1 이상 필요 |

**방어구 · 방패**

| ID | 이름 | 방어도 | 가격 | 비고 |
|----|------|------:|----:|------|
| `padded_coat` | 누빔 옷 | +1 | 10 | |
| `patched_leather` | 기운 가죽 조끼 | +2 | 16 | 내구도 12 (가죽 갑옷의 절반) |
| `leather_armor` | 가죽 갑옷 | +2 | 25 | |
| `chain_shirt` | 사슬 셔츠 | +3 | 45 | 민첩 판정 -1 |
| `wooden_shield` | 나무 방패 | +1 | 12 | 한손 무기 전용 |
| `round_shield` | 쇠 방패 | +2 | 28 | 한손 무기 전용, 내구도 20 |

**소모품 · 재료**

| ID | 이름 | 효과 | 가격 | 전투 중 |
|----|------|------|----:|:---:|
| `arrow` | 화살 | 활 공격 1회 | 10개 3 | — |
| `herb` | 약초 | HP +2, 경상이면 50% 확률 치료 | 2 | O |
| `bandage` | 붕대 | 경상 → 없음 | 3 | X |
| `bitter_tea` | 쓴 약차 | 피로 -2 | 3 | X |
| `salve` | 상처 연고 | HP +4 | 4 | X |
| `vigor_pill` | 기운 환 | HP +3, 피로 -1 | 6 | O |
| `sleep_herb` | 숙면초 | 피로 -3 | 5 | X |
| `splint` | 부목 | 중상 → 경상 (부상이 맞지 않으면 쓸 수 없다) | 10 | X |
| `hot_stew` | 고기 스튜 (여관) | HP +2, 피로 -1 | 2 | X |
| `barley_ale` | 보리술 (여관) | 피로 -2, HP -1 | 2 | X |
| `healing_potion` | 치유 물약 | HP +6, 치명상 → 중상 | 20 | O |
| `wolf_pelt` | 늑대 가죽 | 판매용 | (판매 4) | — |
| `boar_tusk` | 멧돼지 엄니 | 판매용, 멧돼지 전리품(70%) | (판매 3) | — |
| `rare_herb` | 늪 약초 | 판매용 / 물약 재료(확장) | (판매 8) | — |
| `goblin_token` | 고블린 부적 | 스토리 증거물 | — | — |

```ts
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
  { id: "hunting_bow", name: "사냥활", category: "weapon", description: "손때 묻은 짧은 활.", price: 12, sellable: true, stackMax: 1,
    skill: "bow", damage: "1d6", twoHanded: true, ammo: "arrow", durabilityMax: 20 },
  { id: "leather_armor", name: "가죽 갑옷", category: "armor", description: "무두질한 소가죽 조끼.", price: 25, sellable: true, stackMax: 1,
    defense: 2, durabilityMax: 25 },
  { id: "chain_shirt", name: "사슬 셔츠", category: "armor", description: "무겁지만 든든하다.", price: 60, sellable: true, stackMax: 1,
    defense: 3, checkPenalty: { stat: "agi", value: -1 }, durabilityMax: 25 },
  { id: "herb", name: "약초", category: "consumable", description: "씹으면 쓰지만 상처가 아문다.", price: 2, sellable: true, stackMax: 5,
    use: [{ type: "hp", delta: 2 }], chanceEffects: [{ p: 0.5, effects: [{ type: "healWound", to: "none" }] }], usableInCombat: true },
  { id: "goblin_token", name: "고블린 부적", category: "quest", description: "뼈와 깃털을 엮은 부적. 촌장에게 보여야 한다.", price: 0, sellable: false, stackMax: 1 },
];
```

> `herb`의 `healWound`는 **현재 경상일 때만** 적용(중상 이상에는 무효)하도록 사용 로직에서 검사한다.

---

## 6. 시간 · 자원 시스템

### 6-1. 날짜와 시간대
- 1회차 = **1일차 ~ 30일차** (MVP). 30일차 저녁은 밤 이벤트 대신 최종 습격.
- 하루 = `morning`(아침 이벤트) → `am`(오전 행동) → `pm`(오후 행동) → `evening`(저녁 정산).
- 2슬롯 행동(로웬 왕복 등)은 오전에만 선택 가능.

### 6-2. 하루 행동

| 행동 | 슬롯 | 피로 | 효과 |
|------|:---:|:---:|------|
| 일하기 | 1 | +2 (대장장이 +3) | 직업 판정 → 은화 (아래 표) |
| 혼자 훈련 | 1 | +2 | 운동 하나 골라 능력치 판정 DC 10 → 성장 굴림까지의 판정 횟수 (1-4) |
| 교습 훈련 | 1 | +3 | 은화 3, 선택 숙련 XP +3 (레나: 검술·둔기·활·방어) |
| 탐험 | 1 | +2 (+1 더 깊이) | 지역 카드 2~3장 |
| 휴식 | 1 | **-3** | HP +2, 경상 회복 카운트 +1 |
| 마을 볼일 | 1 | 0 | NPC 이벤트 1개 |
| 로웬 다녀오기 | 2 | +3 | 확장(MVP는 모집관 이벤트로 대체) |

**일하기 수입**

| 직업 | 판정 | 기본 | 성공 추가 | 대성공 | 실패 |
|------|------|----:|---------:|--------|------|
| 농부 | 근력+농사 DC 10 | 은화 2 | +1, 식량 +1 | 추가분 2배 | 기본만 |
| 대장장이 견습 | 근력+대장일 DC 12 | 은화 3 | +2, 둔기 XP +1 | 추가분 2배 | 기본만, 대실패 시 HP -2·경상(이미 다쳤으면 그대로) |
| 사냥꾼 | 감각+추적 DC 12 | 은화 2 | +1, 식량 +1 | 추가분 2배 | 기본만 |
| 공통 잡일 | 근력 DC 10 | 은화 1 | +1 | — | 기본만 |

### 6-3. 피로 (0~10)

| 구간 | 상태 | 효과 |
|------|------|------|
| 0~3 | 상쾌 | — |
| 4~6 | 피곤 | — (UI 경고 색) |
| 7~9 | 지친 상태 | 모든 판정 불리함 |
| 10 | 탈진 | 즉시 그날 종료, 다음 날 오전 소실, 피로 6으로 (그날 밤 수면 회복 대신 6으로 맞춤) |

- **저녁 수면 회복**: 기본 -3. 굶주림 1단계 이상이면 -2. 그날 휴식 행동을 했다면 추가 -1.
- 계산 예) 하루 일하기 2회(+4) → 수면(-3) = 하루 +1 누적 → 약 6일마다 쉬는 날이 필요.

### 6-4. 식량
- 매일 저녁 **본인 1 + 가족 1** 소비. (가족 2명분은 어머니의 텃밭으로 일부 충당한다는 설정)
- 구매: 여관 토비에게 `식량 1 = 은화 1`.
- 본인 굶주림(`hunger`): 그날 못 먹으면 +1, 먹으면 0으로.

| 굶주림 | 효과 |
|-------|------|
| 1 | 수면 피로 회복 -1 |
| 2 | 모든 판정 불리함 |
| 3+ | 매일 밤 HP -2 |

- 가족 굶주림(`familyHunger`): 못 먹이면 +1, 먹이면 0. **3에 도달하면** 스토리 이벤트 「동생이 앓아눕다」(의원비 은화 5, 엔딩 서술에 영향).
- 식량이 부족하면 먹이는 순서를 저녁 정산에서 선택(본인 먼저 / 가족 먼저).

### 6-5. 돈 (은화)
- 세금: **7·14·21·28일차 저녁** 은화 5 자동 납부.
- 못 내면 부족분 + 이자 2가 `debt`(빚)로, 평판 -5.
- 빚은 상점에서 언제든 상환. 빚이 **20 이상**인 상태로 납세일을 맞으면 「빚진 자」 엔딩.

**경제 기준선 (하루 평균)**

| 항목 | 금액 |
|------|----:|
| 식량 2 | -2.0 |
| 세금(주 5 ÷ 7) | -0.7 |
| 일하기 1회 (농부 기대값) | +3.0 |

→ **하루 1회는 일해야 현상 유지**, 남은 1슬롯이 훈련·탐험·휴식. 장비 하나(가죽 갑옷 25)는 일주일 정도 아껴야 산다.

### 6-6. 저녁 정산 순서 (고정)
1. 식사(식량 소비, 굶주림 갱신)
2. 수면(피로 회복)
3. HP 회복: 부상 없음·경상 +1 / 중상·치명상 0 / 굶주림 3+ → -2
4. 부상 타이머 진행(치료 경과일, 방치일)
5. 세금(7의 배수일)
6. 능력치 성장 굴림(조건 충족한 것)
7. 30일차면 최종 습격, 아니면 밤 이벤트 25% 판정 (밤 이벤트 콘텐츠가 없으면 굴리지 않는다). 밤 이벤트가 나면 8은 그 이벤트가 끝난 뒤에
8. 날짜 +1, `skillXpToday` 초기화 → 치명상 사망 굴림 → 아침 이벤트 → **자동 저장(체크포인트)**

```ts
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
```

---

## 7. 저장 방식

### 7-1. 원칙
- **아이언맨 방식**: 수동 저장/불러오기 없음. 항상 자동 저장, 되돌릴 수 없다. (평범한 사람의 선택에 무게를 주기 위함)
- RNG 상태까지 저장 → 앱을 강제 종료하고 다시 켜도 **같은 굴림 결과**가 나온다.
- 저장 데이터는 하나의 JSON. 로컬 키-값 저장소(AsyncStorage / SharedPreferences / `localStorage` 등) 사용.

### 7-2. 자동 저장 시점

| 시점 | 설명 |
|------|------|
| 하루 시작(아침 직전) | 주 체크포인트. 백업본도 이 시점에만 갱신 |
| 장면 전환마다 | 선택지 결과 확정 → 다음 장면 진입 시 |
| 전투 라운드 종료마다 | `CombatState` 포함 저장 |
| 상점 거래 확정 | 구매·판매·수리·치료 직후 |
| 앱 백그라운드 전환 | OS의 pause/background 이벤트 |

- 판정은 **결과를 상태에 반영한 뒤 저장**하고 나서 연출(주사위 애니메이션)을 보여 준다. 연출 중 종료해도 결과는 이미 확정.

### 7-3. 슬롯 구성

| 저장 키 | 내용 | MVP |
|---------|------|:---:|
| `brw.run.v1` | 진행 중인 회차 1개 | O |
| `brw.run.v1.bak` | 전날 아침 체크포인트 백업 (손상 복구용) | O |
| `brw.meta.v1` | 회차 간 기록: 본 엔딩, 사망 기록, 획득 흔적 도감, 설정 | O |
| `brw.run.v1.slot2~3` | 진행 슬롯 추가 | 확장 |

- **새 게임**: 진행 중인 회차가 있으면 "포기하고 새로 시작" 확인 후 덮어쓴다(포기 기록은 meta에 남김).
- **사망·엔딩**: ① meta에 기록 저장 → ② 성공 확인 후 run 삭제. (순서를 지켜 기록 유실 방지)
- 메타 데이터는 다음 회차를 **강하게 만들지 않는다**(도감·통계만).

### 7-4. 무결성과 버전
- 쓰기: `brw.run.v1.tmp`에 기록 → 성공 시 본 키로 교체(원자적 쓰기 흉내).
- 읽기: `version` 확인 → 낮으면 `migrations[version]` 순서대로 적용. `checksum` 불일치 시 `.bak`에서 복구 후 안내 문구.
- 체크섬: JSON 문자열의 간단한 해시(FNV-1a 32bit 등). 보안이 아닌 **손상 감지** 목적.

```ts
export const SAVE_VERSION = 1;
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

export interface RunSaveFile {
  version: number;
  savedAt: string;
  checksum: string;
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
```

---

## 8. 구현 순서 제안 (코어 → 콘텐츠)

| 단계 | 작업 | 완료 기준 |
|------|------|-----------|
| 1 | 타입·RNG·판정(`rollCheck`, `successChance`) | 단위 테스트: 고정 시드에서 결과 재현, 확률 표 일치 |
| 2 | 하루 루프 + 자원·피로·저녁 정산 | 콘솔에서 30일 자동 플레이 시뮬레이션 |
| 3 | 이벤트 엔진(조건·효과·장면 이동) | 샘플 이벤트 5개 텍스트 UI로 플레이 |
| 4 | 전투 | 늑대·고블린 전투 1,000회 시뮬레이션 → 승률/사망률 표로 밸런스 확인 |
| 5 | 인벤토리·상점·저장 | 강제 종료 후 재시작 시 동일 장면·동일 굴림 |
| 6 | 콘텐츠 작성(이벤트 135개)·엔딩 | 1회차 30분 내외, 엔딩 5종 모두 도달 확인 |

> 4단계 시뮬레이션 목표치: **시작 캐릭터 vs 늑대 사망률 10~15%, 20일차 캐릭터 2% 이하.** 벗어나면 적 수치부터 조정한다.
