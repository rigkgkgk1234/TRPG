# 보리울의 30일

평범한 마을 주민이 노력과 선택만으로 30일을 버티는 모바일 싱글플레이 텍스트 TRPG (iOS · Android · 웹).

변경 마을 보리울에서 하루를 오전·오후·저녁으로 나눠 일하고, 훈련하고, 탐험하고, 이웃을 만난다. 모든 행동은 D20 판정으로 정해지고, 30일째 밤에는 고블린 습격이 온다.

## 게임 한눈에

- 직업 10개: 농부, 견습 대장장이, 사냥꾼, 약초꾼, 경비대 신병, 옛 병사의 자식, 나무꾼, 여관 심부름꾼, 떠돌이 행상, 수도원 견습.
  - 직업마다 능력치·시작 숙련·일하기 판정이 다르다.
  - 고유 규칙도 하나씩 있다(예: 약초꾼 늪 판정 +1, 떠돌이 행상 대장간·약초방 −20%).
- 판정: D20 + 능력치 + 숙련 레벨 + 장비·부상·상황 보정을 목표값과 견준다.
  - 결과는 대성공·성공·부분 성공·실패·대실패 다섯 가지다.
  - 유리함·불리함이 있으면 주사위 2개 중 하나를 고른다.
- 하루: 일하기, 혼자 훈련, 교습, 탐험, 휴식, 마을(가게·주민)을 고른다.
  - 저녁에 식량·세금을 정산하고, 아침·밤 이벤트가 끼어든다.
- 탐험지 5곳: 개암나무 숲, 버려진 감시탑, 회색 늪지, 무너진 은광, 물레방아골 폐허. 날이 갈수록 위험 등급이 오른다.
- 전투: 선공 굴림 → 공격·강타·방어·아이템·도주.
  - 피해는 명중 굴림 하나로 정해진다.
  - 죽음은 싸움에서만 온다(적의 급소 공격).
- 가게: 대장간(구매·수리), 약초방(치료·물건), 여관(구매·판매·빚 갚기). 평판에 따라 값이 달라진다.
- 엔딩: 마을의 방패, 이웃과 함께 떠나다, 로웬의 창병, 용사 일행, 살아남은 자, 빚진 자, 사망.
- 콘텐츠: 이벤트 244개, 적 21종, 아이템 42개, 흔적 4개.
- 저장: 슬롯 하나(아이언맨). 저장·기록은 봉인(HMAC)되고, 규칙으로 나올 수 없는 상태는 불러오지 않는다.

## 문서

- [게임 기획서](docs/GAME_DESIGN.md): 세계관, 직업, NPC, 스토리, 엔딩
- [시스템 상세 설계서](docs/SYSTEM_SPEC.md): 판정·자원·전투·아이템 규칙과 수치. 타입의 원본이다.
- [구현 아키텍처 & 로드맵](docs/ARCHITECTURE.md): Expo + TypeScript + Zustand, 화면 흐름, 8주 로드맵

## 개발

```bash
npm install
npm start
npx expo start --web --port 8090 < /dev/null
```

| 명령 | 내용 |
|------|------|
| `npm test` | 코어 테스트 (vitest) |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint (`src/core`의 React/RN/Expo import 금지 규칙 포함) |
| `npm run gen:types` | `docs/SYSTEM_SPEC.md`의 ```ts 블록 → `src/core/types.ts` 다시 만들기 |
| `npm run gen:schemas` | 타입 → `schemas/*.schema.json` |
| `npm run build:content` | 이벤트·적·아이템 JSON 검사 → `src/data/content.generated.json` |
| `npm run simulate` | 단순 AI로 30일 자동 플레이 → 직업별 엔딩·사망 원인·은화 곡선 |
| `npm run simulate:combat` | 직업별 1:1 전투 승률·사망률 (시작 캐릭터 / 20일차 가정) |

`simulate`에 줄 수 있는 옵션은 다음과 같다.

```bash
npm run simulate -- --runs 500 --ai smart --jobs herbalist,peddler --seed 0
```

| 옵션 | 내용 |
|------|------|
| `--runs` | 직업마다 몇 판 돌릴지 (기본 1,000) |
| `--ai` | AI 성향 (기본 `basic`). `cautious` 조심, `bold` 대담, `worker` 돈벌이, `trader` 전리품 팔기, `smart` 장비 사기·고유 규칙 노리기 |
| `--jobs` | 고른 직업만 돌린다 |
| `--seed` | 시드 시작점. 다른 시드로 돌려 결과가 얼마나 흔들리는지 본다 |

규칙:
- `src/core/types.ts`는 직접 고치지 않는다. 설계서를 고친 뒤 `npm run gen:types`를 돌린다.
- 이벤트 JSON을 고치면 `npm run build:content`를 돌리고, 결과 파일도 커밋한다. 테스트가 원본과 같은지 확인한다.

## 폴더

- `src/app/`: 화면 (Expo Router). 타이틀, 새 게임, 게임(하루·가방·상태), 기록
- `src/core/`: 게임 로직. 순수 TypeScript이고 UI 의존이 없다.
  - 진입점은 `engine.ts`의 `dispatch(state, cmd, content)`다.
  - 판정(`check/`), 하루(`day/`), 이벤트(`events/`), 전투(`combat/`), 아이템·가게(`items/`), 저장(`save/`), 엔딩(`story/`)
  - 직업 고유 규칙 수치는 `jobPerks.ts`에 있다.
- `src/data/`: 콘텐츠
  - `events/<지역>/`: 이벤트 하나가 JSON 파일 하나
  - `items.json`·`enemies.json`·`traits.json`
  - 직업은 설계서의 `JOBS`에 있다.
- `src/store/`: Zustand 스토어. 회차를 들고 명령을 `dispatch`에 넘긴다. 저장을 먼저 하고 연출은 그 다음에 한다.
- `src/ui/`: 컴포넌트·뷰·테마 (다크 테마, Pretendard, Phosphor 아이콘)
- `schemas/`: 콘텐츠 JSON 스키마
- `scripts/`: 타입·스키마·콘텐츠 생성, 시뮬레이터
- `tests/core/`: 코어 테스트
