# 버들여울의 하루 (가제) 기술 설계서

버전 0.1. 기준 문서는 docs/GDD.md이며 React Native, Expo, TypeScript를 사용한다.

# 0. 설계 원칙

1. 엔진과 UI를 분리한다. 판정, 효과 적용, 엔딩 계산은 React Native를 import하지 않는 순수 TypeScript 함수로 만들고 Node에서 단위 테스트한다.
2. 콘텐츠는 데이터다. 이벤트, 아이템, NPC, 엔딩은 JSON으로 정의하고 빌드 시 스키마를 검증한다. 코드 수정 없이 콘텐츠를 추가할 수 있어야 한다.
3. 상태는 하나의 직렬화 가능한 객체(GameState)다. 함수는 상태를 받아 새 상태를 돌려준다. 저장, 롤백, 리플레이가 모두 이 성질에 기대어 단순해진다.
4. 난수는 시드 기반이다. 같은 시드와 같은 선택이면 같은 결과가 나온다. 불러오기로 주사위를 다시 굴리는 일을 막고 주간 시드 챌린지를 가능하게 한다.
5. 오프라인이 기본이다. 네트워크는 오늘의 소식과 주간 시드에만 선택적으로 쓴다.

주요 라이브러리
- 라우팅: expo-router
- 상태 관리: zustand
- 저장: expo-sqlite
- 애니메이션과 제스처: react-native-reanimated, react-native-gesture-handler
- 햅틱과 사운드: expo-haptics, expo-av
- 다국어: i18next
- 콘텐츠 검증: zod (빌드 스크립트 전용)
- 테스트: vitest (엔진), jest-expo와 React Native Testing Library (화면)

# 1. 폴더 구조

```
trpg/
  app/                      expo-router 라우트 (화면 파일만 둔다)
    _layout.tsx
    index.tsx               타이틀
    new-game.tsx
    load.tsx
    game/
      _layout.tsx
      index.tsx             메인 플레이 화면
      season-start.tsx
      season-result.tsx
      ending.tsx
    menu/
      inventory.tsx
      people.tsx
      journal.tsx
      codex.tsx
    settings.tsx
  src/
    engine/                 순수 TypeScript. RN import 금지
      rng.ts
      requirements.ts
      deck.ts
      check.ts
      effects.ts
      growth.ts
      resolve.ts
      day.ts
      season.ts
      ending.ts
      index.ts
    types/                  공용 타입
      core.ts
      player.ts
      item.ts
      event.ts
      save.ts
    data/
      balance.json          수치 조정용 설정
      origins.json
      items.json
      npcs.json
      endings.json
      events/
        daily.json
        bond.json
        crisis.json
        chronicle.json
      generated/            빌드 결과 (git 제외)
        content.json
    content/                콘텐츠 접근 계층
      loader.ts             generated/content.json을 읽어 인덱스 생성
      selectors.ts
    store/
      gameStore.ts          zustand 스토어, 엔진 호출
      settingsStore.ts
      metaStore.ts          도감, 연대기, 해금 정보
    save/
      db.ts                 sqlite 연결과 마이그레이션 실행
      migrations.ts
      saveRepo.ts           슬롯 저장, 불러오기, 체크포인트
      metaRepo.ts
      backup.ts             내보내기와 가져오기
    ui/
      components/           StatusBar, StoryPane, ChoiceDock, DiceOverlay 등
      sheets/               하단 시트 (인벤토리 등)
      theme/
      hooks/
    i18n/
      index.ts
      locales/
        ko/
          events.json
          ui.json
    services/
      haptics.ts
      audio.ts
      notifications.ts
      dailyNews.ts          선택적 네트워크 호출
  scripts/
    build-content.ts        JSON 검증, 참조 확인, 병합
    lint-text-keys.ts       누락된 텍스트 키 검사
  tests/
    engine/
    content/
  docs/
```

규칙
- 라우트 폴더는 Expo 기본 템플릿 관례에 따라 src/app에 둔다. 위 트리의 app 폴더는 src/app을 가리킨다.
- app 폴더의 파일은 화면 조립만 한다. 로직은 store와 engine에 둔다.
- engine은 types, content 인터페이스 외에는 아무것도 import하지 않는다.
- 텍스트는 데이터 파일에 직접 쓰지 않고 키만 쓴다. 실제 문장은 i18n/locales에 둔다.

# 2. 데이터 모델 (TypeScript 타입)

유니온 타입 대신 const 배열에서 타입을 뽑는 방식을 쓴다. 같은 배열을 zod 스키마와 UI 선택 목록에도 재사용할 수 있다.

## 2-1. 공용 타입 (src/types/core.ts)

```ts
export const STATS = ["labor", "craft", "talk", "sense"] as const;
export type Stat = (typeof STATS)[number];

export const RESOURCES = ["stamina", "mind", "coin", "food", "debt"] as const;
export type Resource = (typeof RESOURCES)[number];

export const REP_TRACKS = ["neighbor", "merchant", "office"] as const;
export type RepTrack = (typeof REP_TRACKS)[number];

export const VALUE_AXES = ["bond", "duty", "wealth", "freedom"] as const;
export type ValueAxis = (typeof VALUE_AXES)[number];

export const SLOTS = ["morning", "afternoon", "evening"] as const;
export type Slot = (typeof SLOTS)[number];

export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = (typeof SEASONS)[number];

export const OUTCOME_TIERS = ["crit", "success", "partial", "fail", "botch"] as const;
export type OutcomeTier = (typeof OUTCOME_TIERS)[number];

export interface GameDate {
  year: number;
  season: Season;
  day: number;
  slot: Slot;
}
```

## 2-2. 플레이어 (src/types/player.ts)

```ts
export interface Player {
  name: string;
  originId: string;
  stats: Record<Stat, number>;
  xp: Record<Stat, number>;
  resources: Record<Resource, number>;
  reputation: Record<RepTrack, number>;
  values: Record<ValueAxis, number>;
  bonds: Record<string, number>;
  career: CareerState;
  inventory: ItemInstance[];
  knowHow: string[];
  prep: PrepBuff[];
  conditions: Condition[];
  retryUsedToday: boolean;
}

export interface CareerState {
  trackId: string;
  rank: number;
  progress: number;
}

export interface PrepBuff {
  tag: string;
  bonus: number;
  expiresOn: GameDate;
}

export interface Condition {
  id: string;
  untilDay: number;
  statPenalty: number;
}
```

## 2-3. 아이템 (src/types/item.ts)

```ts
export const ITEM_CATEGORIES = ["tool", "food", "gift", "material", "keepsake"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export interface ItemDef {
  id: string;
  nameKey: string;
  descKey: string;
  category: ItemCategory;
  price: number;
  stackable: boolean;
  toolBonus?: ToolBonus;
  foodValue?: number;
}

export interface ToolBonus {
  tag: string;
  bonus: number;
  maxDurability: number;
}

export interface ItemInstance {
  uid: string;
  defId: string;
  count: number;
  durability?: number;
}
```

## 2-4. 이벤트 (src/types/event.ts)

이벤트 정의는 JSON과 1대1로 대응한다. 효과와 조건은 kind 필드와 선택 필드를 가진 하나의 인터페이스로 표현하고, 종류별 필수 필드는 zod 스키마가 검증한다.

```ts
export const EVENT_KINDS = ["daily", "bond", "crisis", "chronicle"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EFFECT_KINDS = [
  "resource",
  "reputation",
  "bond",
  "xp",
  "value",
  "flag",
  "item",
  "durability",
  "knowHow",
  "career",
  "prep",
  "skipSlot",
  "queueEvent",
  "ending",
] as const;
export type EffectKind = (typeof EFFECT_KINDS)[number];

export interface Effect {
  kind: EffectKind;
  target?: string;
  amount?: number;
  text?: string;
}

export const REQUIREMENT_KINDS = [
  "stat",
  "resource",
  "reputation",
  "bond",
  "flag",
  "flagNot",
  "item",
  "knowHow",
  "careerRank",
  "year",
] as const;
export type RequirementKind = (typeof REQUIREMENT_KINDS)[number];

export const COMPARE_OPS = ["gte", "lte", "eq"] as const;
export type CompareOp = (typeof COMPARE_OPS)[number];

export interface Requirement {
  kind: RequirementKind;
  target?: string;
  op?: CompareOp;
  value?: number;
}

export interface CheckDef {
  stat: Stat;
  dc: number;
  tags?: string[];
  allowRetry?: boolean;
}

export interface Outcome {
  textKey: string;
  effects: Effect[];
}

export interface Choice {
  id: string;
  textKey: string;
  requires?: Requirement[];
  cost?: Effect[];
  check?: CheckDef;
  valueTags?: ValueAxis[];
  outcomes: Partial<Record<OutcomeTier, Outcome>>;
}

export interface FixedDate {
  year: number;
  season: Season;
  day: number;
  slot?: Slot;
}

export interface EventDef {
  id: string;
  kind: EventKind;
  weight: number;
  slots: Slot[];
  seasons: Season[];
  years?: number[];
  requires?: Requirement[];
  once?: boolean;
  cooldownDays?: number;
  fixedDate?: FixedDate;
  textKey: string;
  choices: Choice[];
}
```

판정이 없는 선택지는 check를 생략하고 outcomes.success만 정의한다.

## 2-5. 세이브 (src/types/save.ts)

```ts
export interface RngState {
  seed: number;
  cursor: number;
}

export interface SeenEvent {
  id: string;
  lastDay: number;
  count: number;
}

export interface SlotContext {
  eventId: string;
  choiceIds: string[];
  pendingRoll?: PendingRoll;
}

export interface PendingRoll {
  choiceId: string;
  dice: number[];
  retried: boolean;
}

export interface GameState {
  date: GameDate;
  dayIndex: number;
  player: Player;
  flags: Record<string, number>;
  seen: SeenEvent[];
  queue: string[];
  slotContext?: SlotContext;
  rng: RngState;
  log: LogEntry[];
  campaignSeed: number;
}

export interface LogEntry {
  dayIndex: number;
  textKey: string;
  params?: Record<string, string>;
}

export interface SaveSlot {
  slotId: number;
  schemaVersion: number;
  contentVersion: string;
  updatedAt: number;
  summary: SaveSummary;
  state: GameState;
}

export interface SaveSummary {
  playerName: string;
  originId: string;
  year: number;
  season: Season;
  day: number;
  playtimeSec: number;
}

export interface MetaState {
  codexEvents: string[];
  codexEndings: string[];
  knowHowSeen: string[];
  chronicle: ChronicleEntry[];
  settings: SettingsState;
}

export interface ChronicleEntry {
  campaignSeed: number;
  endingId: string;
  keyFlags: string[];
  finishedAt: number;
}

export const HANDEDNESS = ["right", "left"] as const;
export type Handedness = (typeof HANDEDNESS)[number];

export interface SettingsState {
  handedness: Handedness;
  textScale: number;
  textSpeed: number;
  haptics: boolean;
  sound: boolean;
  colorBlindMode: boolean;
  notifications: boolean;
}
```

pendingRoll은 주사위 결과가 정해졌지만 결과 카드를 아직 확정하지 않은 중간 상태를 보관해서, 이 시점에 앱이 종료되어도 같은 결과로 복원되게 한다.

# 3. 이벤트 JSON 스키마

## 3-1. 규칙

- 파일은 src/data/events 아래 종류별로 나눈다. 최상위는 EventDef 배열이다.
- id는 전역 고유이며 snake_case로 쓴다. 접두어로 계절과 종류를 붙인다(spring_market_eggs).
- 텍스트는 키만 쓴다. 키 규칙은 이벤트id.본문, 이벤트id.선택지id, 이벤트id.선택지id.결과단계 형태다.
- weight는 랜덤 덱에서의 가중치다. fixedDate가 있으면 weight는 무시되고 해당 날짜에 강제 삽입된다.
- 효과 target 규칙: resource는 자원 이름, reputation은 갈래 이름, bond는 npc id, xp는 능력치 이름, value는 가치 축 이름, flag는 플래그 이름, item과 durability는 아이템 id, knowHow는 노하우 id, queueEvent는 이벤트 id를 쓴다.
- 판정 결과 5단계 중 정의되지 않은 단계는 가장 가까운 아래 단계로 대체한다(crit이 없으면 success, partial이 없으면 fail).

## 3-2. 빌드 시 검증 (scripts/build-content.ts)

1. zod 스키마로 모든 파일을 검증한다. 종류별 필수 필드(예: resource 효과는 target과 amount 필수)를 확인한다.
2. 참조 무결성을 검사한다. queueEvent, bond, item이 가리키는 id의 존재를 확인한다.
3. 텍스트 키가 ko 로케일에 있는지 검사한다.
4. 고정 날짜 이벤트가 같은 슬롯에 겹치지 않는지 검사한다.
5. 통과하면 모든 데이터를 합쳐 src/data/generated/content.json으로 출력한다. 앱은 이 파일 하나만 읽는다.

## 3-3. 예시 1: 일상 이벤트 (판정 있음)

```json
{
  "id": "spring_market_eggs",
  "kind": "daily",
  "weight": 10,
  "slots": ["morning", "afternoon"],
  "seasons": ["spring"],
  "requires": [{ "kind": "item", "target": "egg", "op": "gte", "value": 3 }],
  "textKey": "spring_market_eggs.body",
  "choices": [
    {
      "id": "sell",
      "textKey": "spring_market_eggs.sell",
      "valueTags": ["wealth"],
      "check": { "stat": "talk", "dc": 7, "tags": ["trade"], "allowRetry": true },
      "outcomes": {
        "crit": {
          "textKey": "spring_market_eggs.sell.crit",
          "effects": [
            { "kind": "resource", "target": "coin", "amount": 27 },
            { "kind": "reputation", "target": "merchant", "amount": 1 },
            { "kind": "xp", "target": "talk", "amount": 2 }
          ]
        },
        "success": {
          "textKey": "spring_market_eggs.sell.success",
          "effects": [
            { "kind": "resource", "target": "coin", "amount": 18 },
            { "kind": "reputation", "target": "merchant", "amount": 1 },
            { "kind": "xp", "target": "talk", "amount": 1 }
          ]
        },
        "partial": {
          "textKey": "spring_market_eggs.sell.partial",
          "effects": [
            { "kind": "resource", "target": "coin", "amount": 12 },
            { "kind": "resource", "target": "stamina", "amount": -1 },
            { "kind": "xp", "target": "talk", "amount": 1 }
          ]
        },
        "fail": {
          "textKey": "spring_market_eggs.sell.fail",
          "effects": [
            { "kind": "resource", "target": "coin", "amount": 3 },
            { "kind": "xp", "target": "talk", "amount": 1 }
          ]
        },
        "botch": {
          "textKey": "spring_market_eggs.sell.botch",
          "effects": [
            { "kind": "flag", "target": "egg_spill", "amount": 1 },
            { "kind": "resource", "target": "mind", "amount": -1 },
            { "kind": "queueEvent", "target": "spring_marta_comfort" }
          ]
        }
      }
    },
    {
      "id": "give_marta",
      "textKey": "spring_market_eggs.give_marta",
      "valueTags": ["bond", "duty"],
      "outcomes": {
        "success": {
          "textKey": "spring_market_eggs.give_marta.success",
          "effects": [
            { "kind": "item", "target": "egg", "amount": -3 },
            { "kind": "bond", "target": "marta", "amount": 1 },
            { "kind": "reputation", "target": "neighbor", "amount": 1 }
          ]
        }
      }
    },
    {
      "id": "skip",
      "textKey": "spring_market_eggs.skip",
      "outcomes": {
        "success": { "textKey": "spring_market_eggs.skip.success", "effects": [] }
      }
    }
  ]
}
```

## 3-4. 예시 2: 인연 이벤트 (조건과 도움 요청)

```json
{
  "id": "bond_tobi_lost_cart",
  "kind": "bond",
  "weight": 6,
  "slots": ["evening"],
  "seasons": ["spring", "summer"],
  "requires": [
    { "kind": "bond", "target": "tobi", "op": "gte", "value": 1 },
    { "kind": "flagNot", "target": "tobi_cart_done" }
  ],
  "once": true,
  "textKey": "bond_tobi_lost_cart.body",
  "choices": [
    {
      "id": "search_river",
      "textKey": "bond_tobi_lost_cart.search_river",
      "valueTags": ["duty"],
      "cost": [{ "kind": "resource", "target": "stamina", "amount": -2 }],
      "check": { "stat": "sense", "dc": 9, "tags": ["search"], "allowRetry": true },
      "outcomes": {
        "success": {
          "textKey": "bond_tobi_lost_cart.search_river.success",
          "effects": [
            { "kind": "flag", "target": "tobi_cart_done", "amount": 1 },
            { "kind": "bond", "target": "tobi", "amount": 1 },
            { "kind": "item", "target": "river_charm", "amount": 1 },
            { "kind": "xp", "target": "sense", "amount": 2 }
          ]
        },
        "partial": {
          "textKey": "bond_tobi_lost_cart.search_river.partial",
          "effects": [
            { "kind": "flag", "target": "tobi_cart_clue", "amount": 1 },
            { "kind": "xp", "target": "sense", "amount": 1 }
          ]
        },
        "fail": {
          "textKey": "bond_tobi_lost_cart.search_river.fail",
          "effects": [{ "kind": "xp", "target": "sense", "amount": 1 }]
        },
        "botch": {
          "textKey": "bond_tobi_lost_cart.search_river.botch",
          "effects": [
            { "kind": "resource", "target": "stamina", "amount": -2 },
            { "kind": "durability", "target": "work_boots", "amount": -1 }
          ]
        }
      }
    },
    {
      "id": "ask_neighbors",
      "textKey": "bond_tobi_lost_cart.ask_neighbors",
      "requires": [{ "kind": "reputation", "target": "neighbor", "op": "gte", "value": 2 }],
      "valueTags": ["bond"],
      "check": { "stat": "talk", "dc": 7, "tags": ["persuade"] },
      "outcomes": {
        "success": {
          "textKey": "bond_tobi_lost_cart.ask_neighbors.success",
          "effects": [
            { "kind": "flag", "target": "tobi_cart_done", "amount": 1 },
            { "kind": "bond", "target": "tobi", "amount": 1 },
            { "kind": "reputation", "target": "neighbor", "amount": 1 }
          ]
        },
        "fail": {
          "textKey": "bond_tobi_lost_cart.ask_neighbors.fail",
          "effects": [{ "kind": "resource", "target": "mind", "amount": -1 }]
        }
      }
    },
    {
      "id": "decline",
      "textKey": "bond_tobi_lost_cart.decline",
      "valueTags": ["wealth"],
      "outcomes": {
        "success": {
          "textKey": "bond_tobi_lost_cart.decline.success",
          "effects": [{ "kind": "bond", "target": "tobi", "amount": -1 }]
        }
      }
    }
  ]
}
```

## 3-5. 예시 3: 고정 메인 이벤트 (연대기, 분기 플래그와 엔딩 영향)

```json
{
  "id": "y2_winter_conscription",
  "kind": "chronicle",
  "weight": 0,
  "slots": ["morning"],
  "seasons": ["winter"],
  "years": [2],
  "fixedDate": { "year": 2, "season": "winter", "day": 3, "slot": "morning" },
  "textKey": "y2_winter_conscription.body",
  "choices": [
    {
      "id": "enlist",
      "textKey": "y2_winter_conscription.enlist",
      "valueTags": ["duty"],
      "outcomes": {
        "success": {
          "textKey": "y2_winter_conscription.enlist.success",
          "effects": [
            { "kind": "flag", "target": "conscripted", "amount": 1 },
            { "kind": "reputation", "target": "office", "amount": 2 },
            { "kind": "resource", "target": "coin", "amount": 40 }
          ]
        }
      }
    },
    {
      "id": "pay_exemption",
      "textKey": "y2_winter_conscription.pay_exemption",
      "requires": [{ "kind": "resource", "target": "coin", "op": "gte", "value": 60 }],
      "valueTags": ["wealth"],
      "cost": [{ "kind": "resource", "target": "coin", "amount": -60 }],
      "outcomes": {
        "success": {
          "textKey": "y2_winter_conscription.pay_exemption.success",
          "effects": [
            { "kind": "flag", "target": "exempted", "amount": 1 },
            { "kind": "reputation", "target": "neighbor", "amount": -1 }
          ]
        }
      }
    },
    {
      "id": "hide",
      "textKey": "y2_winter_conscription.hide",
      "valueTags": ["freedom"],
      "check": { "stat": "sense", "dc": 9, "tags": ["stealth"] },
      "outcomes": {
        "success": {
          "textKey": "y2_winter_conscription.hide.success",
          "effects": [
            { "kind": "flag", "target": "evaded_conscription", "amount": 1 },
            { "kind": "reputation", "target": "office", "amount": -2 }
          ]
        },
        "fail": {
          "textKey": "y2_winter_conscription.hide.fail",
          "effects": [
            { "kind": "flag", "target": "conscripted", "amount": 1 },
            { "kind": "reputation", "target": "office", "amount": -2 },
            { "kind": "resource", "target": "mind", "amount": -2 }
          ]
        }
      }
    }
  ]
}
```

# 4. 판정과 결과 처리 엔진

모든 함수는 순수 함수이며 새 상태를 반환한다. 난수는 RngState를 인자로 받아 새 RngState를 함께 돌려준다.

## 4-1. 모듈별 함수 구성

rng.ts (난수)
- createRng(seed): RngState
- nextFloat(rng): { value: number, rng: RngState }
- rollDice(rng, count, sides): { dice: number[], rng: RngState }
- 알고리즘은 mulberry32를 쓰고 cursor는 호출 횟수를 기록해 복원 가능하게 한다.

requirements.ts (조건)
- meetsRequirement(state, requirement): boolean
- meetsAll(state, requirements): boolean
- canPayCost(state, effects): boolean

deck.ts (카드 구성)
- getFixedEvent(state, content): EventDef 또는 undefined
- getQueuedEvent(state, content): EventDef 또는 undefined
- listAvailableEvents(state, content, slot): EventDef[]
- drawSlotEvent(state, content): { event: EventDef, state: GameState }. 우선순위는 고정 이벤트, 대기열, 랜덤 가중치 추첨 순이다. once와 cooldownDays를 반영한다.
- buildActivityCards(state, content, slot): ActivityCard[]. 일, 거래, 관계, 탐색, 준비, 휴식 활동 카드 3장에서 4장을 구성한다.

check.ts (판정)
- computeModifiers(state, check): ModifierBreakdown. 능력치, 준비 버프와 도구, 도움(인연 2단계 이상 NPC), 상태 페널티를 항목별로 담는다
- totalModifier(breakdown): number
- successRate(totalMod, dc): number. 2d6 분포를 미리 계산한 표에서 바로 읽는다. 화면 버튼의 퍼센트 표기가 이 함수를 쓴다
- rollCheck(state, check): { result: CheckResult, rng: RngState }
- resolveTier(dice, totalMod, dc): OutcomeTier. 6과 6은 crit, 1과 1은 botch, 그 외는 합계와 난이도의 차이로 5단계를 가른다
- canRetry(state, check): boolean. allowRetry, 마음 2 이상, 하루 1회 여부를 확인한다
- applyRetry(state, pendingRoll): { state: GameState, result: CheckResult }. 마음 2를 차감하고 새 결과를 따른다

effects.ts (효과 적용)
- applyEffect(state, effect, content): GameState
- applyEffects(state, effects, content): GameState
- clampPlayer(player): Player. 자원과 평판의 범위, 능력치 상한 4, 보정 합계 상한을 강제한다
- resolveDebt(state): GameState. 코인이 음수가 되면 부족분을 빚으로 옮긴다
- 효과 종류별 핸들러를 객체 맵으로 등록하고 applyEffect는 맵 조회만 한다. 새 효과를 추가할 때 한 곳만 고치면 된다

growth.ts (성장)
- grantXp(state, stat, amount): GameState
- xpThreshold(level): number. balance.json의 값을 읽는다
- checkLevelUp(state, stat): { state: GameState, leveledUp: boolean, unlocked: string[] }
- tickCareer(state, content): GameState. 숙련, 평판, 완료 사건 조건을 보고 승급을 판정한다

resolve.ts (선택지 처리의 진입점)
- previewChoice(state, event, choiceId, content): ChoicePreview. 성공률과 보정 내역을 돌려주며 상태를 바꾸지 않는다
- beginChoice(state, event, choiceId, content): { state: GameState, pending: PendingRoll }. 비용 지불과 주사위 결정을 수행하고 pendingRoll을 상태에 기록한다
- commitChoice(state, event, choiceId, content): ResolveResult. pendingRoll로 결과 단계를 정하고 효과, XP, 가치 태그, 로그를 반영한 뒤 slotContext를 비운다
- ResolveResult는 새 상태, 결과 단계, 결과 텍스트 키, 적용된 효과 목록(화면의 변화 표시용)을 담는다

day.ts (하루 진행)
- startDay(state, content): GameState. 날씨와 소식 이벤트를 정하고 retryUsedToday를 초기화한다
- advanceSlot(state): GameState. 오전, 오후, 저녁 순으로 넘기고 저녁 다음은 밤 정산으로 넘긴다
- settleNight(state, content): { state: GameState, report: NightReport }. 식량 소비, 회복, 준비 버프 만료, 상태 이상 만료를 처리한다
- isSeasonEnd(state): boolean

season.ts (계절 진행)
- startSeason(state, content): GameState. 계절 목표와 세금액을 정한다
- settleSeason(state, content): { state: GameState, report: SeasonReport }. 세금 납부, 빚 이자 10퍼센트, 도구 내구도 점검, 계절 성과 집계
- applySeasonChoice(state, choiceId, content): GameState. 계절 말 큰 선택을 처리한다

ending.ts (엔딩)
- dominantValue(state): ValueAxis
- evaluateEnding(state, content): string. endings.json의 조건을 우선순위 순으로 검사해 엔딩 id를 반환한다. 어느 조건도 맞지 않으면 이름 없는 평안(기본 엔딩)을 반환한다
- buildEpilogue(state, endingId, content): EpilogueData. 후일담과 놓친 이야기 목록을 구성한다

## 4-2. 한 슬롯의 호출 순서

1. 화면 진입: drawSlotEvent로 이벤트를 뽑고 slotContext에 기록한다
2. 선택지 표시: previewChoice를 각 선택지에 호출해 성공률을 버튼에 그린다
3. 선택 확정: beginChoice가 비용을 내고 주사위를 굴려 pendingRoll을 저장한다. 이 직후 자동 저장한다
4. 재도전(선택): canRetry가 참이면 applyRetry로 결과를 교체하고 다시 저장한다
5. 결과 확정: commitChoice가 효과를 적용하고 결과 카드를 만든다
6. 슬롯 종료: advanceSlot. 저녁이었다면 settleNight, 계절 끝이면 settleSeason으로 이어진다
7. 위 단계마다 save 계층이 현재 상태를 기록한다

## 4-3. 스토어 계층 (store/gameStore.ts)

- zustand 스토어가 GameState와 화면용 파생 정보(현재 이벤트, 미리보기 목록)를 가진다
- 액션 이름: newGame, loadGame, pickChoice, rollDice, retry, confirmResult, nextSlot, endSeason, giveUp
- 모든 액션은 엔진 함수를 호출하고 결과를 setState한 뒤 save 계층에 저장을 요청한다. 스토어 안에 규칙 로직을 두지 않는다

## 4-4. 테스트 계획

- check.test.ts: 보정과 난이도 조합별 successRate가 기획서의 확률표와 일치하는지 확인
- rng.test.ts: 같은 시드와 cursor에서 같은 결과, 상태 복원 후 이어 굴렸을 때 동일 결과
- resolve.test.ts: 선택지별 효과 반영, 결과 단계 대체 규칙, 비용 부족 시 선택 불가
- balance.test.ts: 시드 1000개로 한 계절을 자동 플레이해 수입, 지출, 빚의 분포가 기획 범위 안에 있는지 확인하는 시뮬레이션
- content.test.ts: 모든 이벤트가 스키마와 참조 검사를 통과하는지 확인

# 5. 화면 목록과 이동 흐름

## 5-1. 화면 목록

- 타이틀 (index): 이어하기, 새로 시작, 불러오기, 도감, 설정
- 새 게임 (new-game): 이름 입력, 출신 선택(능력치와 시작 인연 미리보기), 확인
- 불러오기 (load): 슬롯 목록(요약 표시), 슬롯 삭제, 가져오기
- 계절 시작 (game/season-start): 지난 계절 요약, 이번 계절 목표와 세금 안내
- 메인 플레이 (game/index): 상단 상태바, 스토리 영역, 하단 선택 영역, 주사위 오버레이. 하루의 모든 단계가 이 화면 안에서 진행된다
- 밤 정산: 메인 플레이 위에 뜨는 모달. 식사, 회복, 일기 한 줄
- 계절 결산 (game/season-result): 세금 납부, 큰 선택, 성과 정리, 다음 계절 예고
- 엔딩 (game/ending): 엔딩 연출, 10년 후 에필로그, 놓친 이야기 목록, 연대기 기록
- 인벤토리 (menu/inventory): 하단 시트. 도구 내구도, 식량, 선물 사용
- 인물 (menu/people): NPC 목록, 인연 단계, 개인 이야기 진행도
- 일지 (menu/journal): 날짜별 기록, 획득한 노하우
- 도감 (menu/codex): 이벤트, 엔딩, 노하우 수집 현황
- 설정 (settings): 손 방향, 글자 크기와 속도, 햅틱, 사운드, 색약 모드, 알림, 데이터 내보내기와 가져오기

## 5-2. 이동 흐름

전체 흐름
1. 앱 시작: 스플래시, 콘텐츠 로드와 DB 마이그레이션 완료 후 타이틀로 이동한다.
2. 타이틀에서 새로 시작을 누르면 새 게임으로 가고, 확인하면 계절 시작으로 이동한다.
3. 타이틀에서 이어하기를 누르면 가장 최근 슬롯을 불러와 저장된 지점의 메인 플레이로 곧바로 이동한다. 계절 시작 화면은 건너뛴다.
4. 계절 시작에서 시작을 누르면 메인 플레이로 이동한다.
5. 메인 플레이는 하루를 20번 반복한다. 하루는 아침 소식, 오전, 오후, 저녁 슬롯, 밤 정산 모달 순이며 모두 같은 화면에서 일어난다.
6. 20일이 끝나면 계절 결산으로 이동한다.
7. 계절 결산에서 확인하면 다음 계절이 있을 경우 계절 시작으로 이동하고, 12번째 계절이었다면 엔딩으로 이동한다.
8. 엔딩이 끝나면 타이틀로 돌아간다. 연대기가 갱신되어 다음 캠페인에 반영된다.

보조 흐름
- 메인 플레이에서 하단 탭으로 인벤토리, 인물, 일지를 시트로 연다. 닫으면 같은 상태로 돌아온다.
- 타이틀과 메인 플레이 상단의 톱니 버튼에서 설정을 연다. 설정은 모달 스택으로 쌓이며 게임 상태를 건드리지 않는다.
- 메인 플레이 중 중단하기를 누르면 즉시 저장하고 타이틀로 이동한다.
- 계절 시작 시점 체크포인트에서 그 계절부터 다시 살기를 선택하면 해당 체크포인트를 불러와 계절 시작으로 이동한다.

한 손 조작 규칙
- 모든 확정 버튼은 하단 3분의 1에 둔다. 시트는 아래에서 올라오며 위쪽 닫기 버튼 대신 아래로 스와이프해서 닫는다.
- 손 방향 설정이 left이면 선택 영역의 주요 버튼 정렬과 플로팅 메뉴 위치를 좌우 반전한다.
- 뒤로가기 제스처는 시스템 기본 동작만 사용한다. 메인 플레이에서는 뒤로가기가 중단하기 확인 창을 띄운다.

# 6. 세이브와 로드

## 6-1. 저장 방식

- 저장소는 expo-sqlite를 쓴다. Expo Go에서도 동작하고 트랜잭션으로 저장 도중 앱이 꺼져도 깨지지 않는다.
- 테이블 구성
  - save_slot: slotId(기본 키), schemaVersion, contentVersion, updatedAt, summaryJson, stateJson
  - checkpoint: slotId, seasonIndex, stateJson, createdAt. 계절 시작마다 1개씩 보존한다
  - meta: key, valueJson. 도감, 연대기, 설정을 저장한다
  - meta_version: 마이그레이션 번호
- stateJson은 GameState를 JSON.stringify한 값이다. GameState가 직렬화 가능한 순수 데이터라서 별도 변환이 필요 없다.
- 슬롯은 기본 3개다. 이어하기는 updatedAt이 가장 최신인 슬롯을 연다.

## 6-2. 저장 시점

- 자동 저장: 선택 확정 직후(beginChoice 후), 결과 확정 후(commitChoice 후), 슬롯 이동 후, 밤 정산 후, 앱이 백그라운드로 갈 때
- 계절 시작 때 checkpoint에 상태를 복사한다. 체크포인트는 슬롯당 최근 4개만 유지한다
- 저장은 단일 트랜잭션이며 쓰기 큐로 직렬화한다. 빠르게 연속 호출되어도 마지막 상태만 확실히 기록한다
- 저장 실패 시 화면에 조용한 경고 배너를 띄우고 재시도한다. 게임 진행은 막지 않는다

## 6-3. 불러오기 절차

1. save_slot에서 행을 읽고 JSON을 파싱한다. 파싱 실패 시 해당 슬롯을 손상으로 표시하고 가장 최근 checkpoint 복구를 제안한다.
2. schemaVersion이 현재 버전보다 낮으면 migrations.ts의 마이그레이션 함수를 순서대로 적용한다. 각 함수는 한 버전씩 올리는 순수 함수다.
3. contentVersion이 달라졌으면 상태 안의 id들이 새 콘텐츠에 존재하는지 확인한다. 사라진 이벤트 id는 seen에서 무시하고 사라진 아이템은 보상 코인으로 치환한다.
4. 검증을 통과한 상태를 gameStore에 주입하고 slotContext가 있으면 그 화면 상태로 복원한다.
5. pendingRoll이 있으면 저장된 주사위 값을 그대로 쓴다. 불러오기로 결과를 바꿀 수 없다.

## 6-4. 난수와 부정 방지

- RngState는 seed와 cursor만 저장한다. 주사위는 선택 확정 시점에 굴려 pendingRoll로 저장되므로, 선택 직전 저장으로 되돌려도 같은 선택에서는 같은 결과가 나온다.
- 다른 선택지를 고르면 다른 난수 순서를 쓰지 않는다. 난수 순서는 cursor 기준이라 선택 순서에 따라 달라지지만, 이는 의도된 동작이다.
- 부정 방지는 엄격하게 하지 않는다. 싱글 플레이 게임이므로 되돌리기는 계절 체크포인트 롤백이라는 정식 기능으로만 제공한다.

## 6-5. 메타 데이터와 백업

- 도감, 연대기, 설정은 슬롯과 별개로 meta 테이블에 저장한다. 캠페인을 삭제해도 도감은 유지된다.
- 내보내기: 모든 슬롯과 meta를 하나의 JSON 파일로 만들어 expo-file-system과 expo-sharing으로 공유한다. 파일에는 schemaVersion과 체크섬을 넣는다.
- 가져오기: 파일을 선택해 체크섬과 버전을 검증한 뒤, 덮어쓸 슬롯을 사용자가 고른다. 덮어쓰기 전에 기존 슬롯을 임시 백업한다.
- 클라우드 동기화는 v1.x 범위로 미루고, 기기 이전은 우선 내보내기와 가져오기로 해결한다.

## 6-6. 마이그레이션 규칙

- 저장 포맷이 바뀌면 schemaVersion을 올리고 migrations.ts에 함수를 추가한다. 이미 배포된 마이그레이션은 수정하지 않는다.
- 테스트 폴더에 과거 버전 세이브 샘플을 보관하고, 최신 버전까지 연속 마이그레이션해서 불러오기가 성공하는지 CI에서 검사한다.

# 7. 구현 순서 (제안)

1. 프로젝트 초기화, 폴더와 타입 작성, 빌드 스크립트 뼈대
2. 엔진: rng, check, effects, resolve를 테스트와 함께 구현
3. 이벤트 3개 예시를 콘텐츠로 올려 엔진 단위로 한 계절 시뮬레이션
4. 스토어와 메인 플레이 화면 최소 구현 (텍스트와 버튼만)
5. 세이브와 로드, 마이그레이션 뼈대
6. 계절 시작, 결산, 엔딩 화면과 나머지 메뉴
7. 연출(주사위, 햅틱, 사운드)과 접근성 옵션
8. 콘텐츠 제작과 밸런스 시뮬레이션 반복
