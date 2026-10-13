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

export type JobId =
  | "farmer" | "smith" | "hunter"
  | "herbalist" | "recruit" | "soldier_child" | "woodcutter" | "errand" | "peddler" | "acolyte";
export type RegionId = "village" | "forest" | "watchtower" | "marsh" | "mine" | "hamlet" | "rowen";

/** "1d6", "2d4+1", "1d8-1" 형태의 주사위 표기 */
export type DiceExpr = `${number}d${number}` | `${number}d${number}+${number}` | `${number}d${number}-${number}`;

/**
 * 0 이상 1 미만의 실수를 반환하는 난수 함수.
 * memory가 있으면(게임 RNG) d20은 직전 d20과 같은 눈이 나오지 않는다 (테스트용 고정 주사위에는 없다).
 */
export type Rng = (() => number) & { memory?: RngState };
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
| `cha` | 말솜씨 | 흥정, 설득, 정보 얻기, 자경단 모집 | 평판 상승량 |

- 수치 = **보정치 그 자체**(D&D의 18 → +4 같은 변환 없음). 화면에도 `+2`로 표시.
- 범위: 최소 `-1`, 자연 성장 상한 `+4`, 장비·흔적 포함 최종 상한 `+5`.

### 1-2. 파생 수치

| 수치 | 공식 | 예시 (농부: 체력+2, 민첩0) |
|------|------|------|
| 최대 HP | `16 + 체력 × 4` | 24 |
| 방어도 | `10 + 민첩 + 방어구 + 방패` | 10 (가죽 갑옷 착용 시 12) |
| 근접 피해 | `무기 주사위 + 근력` (최소 1) | 쇠갈퀴 1d6+1 |
| 평판 상승 보정 | 말솜씨 +2 이상이면 평판 획득 +1 | — |

### 1-3. 숙련 8종 (MVP)

| ID | 이름 | 연관 능력치 | 쓰이는 곳 |
|----|------|------------|-----------|
| `blade` | 검술 | 근력 | 검·칼 공격 |
| `blunt` | 둔기 | 근력 | 망치·몽둥이·쇠갈퀴 공격 |
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
- **능력치**: 해당 능력치를 쓴 판정 횟수(`statUses`)가 15회가 되면 그날 저녁 정산에서 **반드시 +1** 후 카운트 0 (굴림 없음, 자연 성장 상한 +4).
  - 예) 근력 +2: 13 이하가 나와야 하므로 65%. 근력 +3이면 60%. 높을수록 오르기 어렵다.
  - **혼자 훈련(운동)**: 근력 운동(근력)·달리기(민첩)·오래 버티기(체력)·집중 연습(감각) 중 하나. 능력치만으로 DC 10 판정, 판정 1회를 포함해 `statUses` 대성공 +6 / 성공 +5 / 그 밖 +3 (15를 채우려면 성공 기준 3번). 15를 넘겨 쌓지 않으며, 15를 채웠거나 자연 상한(+4)이면 할 수 없다. 말솜씨는 혼자 단련할 수 없다.

```ts
export type StatId = "str" | "agi" | "con" | "per" | "cha";
export type Stats = Record<StatId, number>;

export type SkillId =
  | "blade" | "blunt" | "bow" | "guard"
  | "farming" | "smithing" | "tracking" | "herbalism" | "haggle";

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
/** 결투(knockout)는 명성을 얻는 싸움이라 숙련 경험이 없다 (이겨도 COMBAT_VICTORY_XP 없음). 능력치 판정 횟수는 센다 */
export const DUEL_XP_CAP_PER_COMBAT = 0;
/** 이긴 전투에서 공격에 쓴 무기 숙련에 더 주는 XP (전투 상한과 별개, 하루 상한은 적용) */
export const COMBAT_VICTORY_XP = 1;
export const SKILL_XP_CAP_PER_DAY = 6;
export const STAT_GROWTH_USES = 15;

export const SKILL_STAT: Record<SkillId, StatId> = {
  blade: "str", blunt: "str", bow: "agi", guard: "con",
  farming: "str", smithing: "str", tracking: "per", herbalism: "per", haggle: "cha",
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
  /** 명성 0 ~ 100: 마을 밖에도 알려진 싸움 실력. 결투장·의뢰로 오른다 (평판은 마을 사람들의 믿음) */
  fame: number;
}

export const FAME_MAX = 100;
/** 의뢰 중개소가 일을 맡기기 시작하는 명성 */
export const GUILD_MIN_FAME = 10;

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
  return 16 + stats.con * 4;
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

export const JOBS: Record<JobId, JobDef> = {
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
      { itemId: "hunting_knife", qty: 1 },
    ],
    work: { label: "덫, 가죽 손질", check: { stat: "per", skill: "tracking", dc: 12 }, baseSilver: 2, bonusSilver: 1, bonusFood: 1, fatigue: 2 },
  },
  herbalist: {
    id: "herbalist", name: "약초꾼", mvp: true,
    stats: { str: -1, agi: 1, con: 1, per: 2, cha: 1 },
    startSkills: { herbalism: 2 },
    silver: 7, food: 3, reputation: 10,
    startItems: [
      { itemId: "hunting_knife", qty: 1, equip: true },
      { itemId: "padded_coat", qty: 1, equip: true },
      { itemId: "herb", qty: 3 },
    ],
    work: { label: "약초 손질", check: { stat: "per", skill: "herbalism", dc: 11 }, baseSilver: 2, bonusSilver: 1, bonusFood: 0, fatigue: 2, bonusItem: "herb" },
  },
  recruit: {
    id: "recruit", name: "경비대 신병", mvp: true,
    stats: { str: 1, agi: 0, con: 2, per: 1, cha: 0 },
    startSkills: { guard: 2, blade: 1 },
    silver: 6, food: 4, reputation: 10,
    startItems: [
      { itemId: "rusty_sword", qty: 1, equip: true },
      { itemId: "wooden_shield", qty: 1, equip: true },
    ],
    work: { label: "보초", check: { stat: "con", skill: "guard", dc: 11 }, baseSilver: 3, bonusSilver: 1, bonusFood: 0, fatigue: 2 },
  },
  soldier_child: {
    id: "soldier_child", name: "옛 병사의 자식", mvp: true,
    stats: { str: 1, agi: 2, con: 1, per: 0, cha: 0 },
    startSkills: { blade: 2 },
    silver: 6, food: 4, reputation: 10,
    startItems: [
      { itemId: "rusty_sword", qty: 1, equip: true },
      { itemId: "padded_coat", qty: 1, equip: true },
    ],
    work: { label: "대련 상대", check: { stat: "agi", skill: "blade", dc: 12 }, baseSilver: 2, bonusSilver: 2, bonusFood: 0, fatigue: 2, bonusSkillXp: "blade" },
  },
  woodcutter: {
    id: "woodcutter", name: "나무꾼", mvp: true,
    stats: { str: 0, agi: 2, con: 2, per: 1, cha: -1 },
    startSkills: {},
    silver: 8, food: 5, reputation: 10,
    startItems: [{ itemId: "hand_axe", qty: 1, equip: true }],
    work: { label: "장작 패기", check: { stat: "con", dc: 9 }, baseSilver: 2, bonusSilver: 1, bonusFood: 1, fatigue: 2 },
  },
  errand: {
    id: "errand", name: "여관 심부름꾼", mvp: true,
    stats: { str: 0, agi: 1, con: 1, per: 0, cha: 2 },
    startSkills: {},
    silver: 12, food: 2, reputation: 10,
    startItems: [
      { itemId: "club", qty: 1, equip: true },
      { itemId: "padded_coat", qty: 1, equip: true },
    ],
    work: { label: "여관 심부름", check: { stat: "cha", dc: 10 }, baseSilver: 2, bonusSilver: 1, bonusFood: 1, fatigue: 1 },
  },
  peddler: {
    id: "peddler", name: "떠돌이 행상", mvp: true,
    stats: { str: 0, agi: 0, con: 1, per: 1, cha: 2 },
    startSkills: { haggle: 2 },
    silver: 20, food: 2, reputation: 0,
    startItems: [
      { itemId: "rusty_sword", qty: 1, equip: true },
      { itemId: "padded_coat", qty: 1, equip: true },
      { itemId: "silver_scrap", qty: 2 },
    ],
    work: { label: "물건 팔기", check: { stat: "cha", skill: "haggle", dc: 12 }, baseSilver: 2, bonusSilver: 4, bonusFood: 0, fatigue: 2 },
  },
  acolyte: {
    id: "acolyte", name: "수도원 견습", mvp: true,
    stats: { str: 0, agi: 0, con: 2, per: 1, cha: 1 },
    startSkills: { guard: 1, herbalism: 1 },
    silver: 5, food: 4, reputation: 15,
    startItems: [
      { itemId: "club", qty: 1, equip: true },
      { itemId: "bandage", qty: 2 },
    ],
    work: { label: "예배당 일", check: { stat: "cha", dc: 10 }, baseSilver: 1, bonusSilver: 1, bonusFood: 0, fatigue: 1, bonusReputation: 1 },
  },
};
```

**직업 고유 규칙** (수치는 `src/core/jobPerks.ts`):

| 직업 | 규칙 |
|------|------|
| 대장장이 견습 | 수리비 반값, 대장간 일 대실패는 화상 (5-3, 6-2) |
| 약초꾼 | 약초를 쓰면 경상이 늘 낫는다(다른 직업 50%). 늪 탐험 중 판정 +1("늪 지리") |
| 경비대 신병 | 방어 자세 방어도 +1. 최종 습격의 자경단 +1명(상한 5) |
| 옛 병사의 자식 | 강타 명중 벌점 −2 → −1 |
| 나무꾼 | 숲 탐험 피로 −1. 나무 울타리 이벤트에서 혼자 통나무를 베어 세운다(피로 +1, 행동 소모 없음) |
| 여관 심부름꾼 | 평판이 오를 때 +1 더(말솜씨 2 보너스와 따로). 여관 물건값 반값(올림, 식량은 제외) |
| 떠돌이 행상 | 파는 값 +20%(내림). 흥정 숙련(말솜씨)은 행상만 처음부터 갖는다 |
| 수도원 견습 | 밤 피로 회복 +1 |

9일차 용사 일행(`story_heroes_arrive`)은 직업마다 일거리 선택지가 하나씩 있고, 해내면 `heroes_helped`(19일차 시험 숙련 3 → 2)를 얻는다.