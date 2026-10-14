# 효과음 넣을 곳

지금은 주사위 소리만 있다(`src/ui/sound.ts`, `TurnCard`). 아래는 효과음을 넣을 순간과 소리를 낼 코드 위치다.

소리를 내는 자리는 두 갈래다.

- 결과 카드에 글이 드러나는 박자(`TurnCard`의 beats 타이머): 글과 소리가 같이 난다.
- 연출 없이 바로 반영되는 누름(가게·장비·가방 버튼 핸들러): 누른 순간에 난다.

## 1. 전투

전투 소리는 `gameStore.playFx`(`src/store/gameStore.ts`)에서 낸다. 맞는 연출과 같은 순간에 나게 하기 위해서다. 활 연사는 `volley.ts`가 화살을 나눌 때 발마다 낸다.

| 순간 | 코드 위치 |
|---|---|
| 검으로 베어 맞힘 | `playFx` (player, blade, hit) |
| 둔기·주먹으로 맞힘 | `playFx` (blunt, fist) |
| 활로 맞힘 | `playFx` (bow), 연사는 `volley.ts` |
| 내 공격이 빗나감 | `playFx` (player, hit false) |
| 대성공 맞힘 | `playFx` (crit) |
| 적에게 맞음 | `playFx` (foe, hit) |
| 적의 급소 공격 | `playFx` (foe, crit) |
| 적 공격을 피함 | `playFx` (foe, hit false) |
| 전투 시작 | 전투 화면이 처음 뜰 때 (`CombatView`) |
| 적이 달아남 | `RoutFade` |
| 전투가 끝났다 알림 | `routNotice` |
| 도주 성공·실패 | 도주 결과 카드 |
| 방어 자세 | 방어 결과 카드 |
| 전투 중 아이템 사용 | 아이템 사용 결과 카드 |

## 2. 결과 카드 줄

| 순간 | 코드 위치 |
|---|---|
| 판정 대성공·대실패 | `TurnCard` 주사위가 멈출 때 (`roll.outcome`) |
| 레벨 상승 | `TurnCard` 줄 (`mark: levelUp`) |
| 부상 입음 | `TurnCard` 줄 (`mark: wound`) |
| 부상이 나음 | `TurnCard` 줄 (`mark: heal`) |
| 은화가 늘거나 줄어듦 | `TurnCard` 바뀐 값 (silver) |
| 물건을 얻음 | `TurnCard` 바뀐 값 (item +) |
| 가방이 가득 참 | 정리 창이 뜰 때 (`OverflowPanel`) |

## 3. 가게·가방

| 순간 | 코드 위치 |
|---|---|
| 사기·팔기·빚 갚기 | `ShopView`·`ShopControls` |
| 수리 | `ShopView` (repair) |
| HP 회복·치료 | `ShopView` (heal·treat·stabilize) |
| 가게 들어가기 | `PickPanel` (shop 단계) |
| 가게에서 나오기 | `PickPanel` (뒤로) |
| 무기 장착·내리기 | `inventory.tsx` (equip·unequip) |
| 방어구·방패 장착 | `inventory.tsx` (equip) |
| 아이템 사용 | `inventory.tsx`·`OverflowPanel` (useItem) |
| 버리기 | `useDiscardConfirm` |
| 정리 창 넣기 | `OverflowPanel` (takeOverflow) |
| 가방 열기 | 가방 버튼 |

## 4. 하루 흐름

| 순간 | 코드 위치 |
|---|---|
| 탐험 떠나기 | `PickPanel` (탐험지 고름) |
| 더 깊이 들어간다 | `goDeeper` (yes) |
| 이벤트 장면이 바뀜 | `EventView` (새 장면) |
| 주민 찾아가기 | `PickPanel` (주민 고름) |
| 휴식 | 휴식 결과 카드 |
| 저녁 정산·잠자리 | `EveningView` (잠자리) |
| 새 날 아침 | `beginDay` 뒤 첫 화면 |
| 30일차 습격 시작 | 습격 이벤트 |
| 엔딩 | 엔딩 화면 |
| 죽음 | 사망 엔딩 |

## 5. 화면·버튼

| 순간 | 코드 위치 |
|---|---|
| 버튼 누름 | `Buttons.tsx` (`ActionButton`), 아주 작게 |
| 직업 카드 고름·풀림 | 새 게임 화면 |
| 첫날을 시작한다 | 새 게임 화면 |
| 기록 화면 | 기록 화면 |
| 거절 토스트 | 토스트 |
| 이벤트 창 접기·펴기 | `EventView` 바텀시트 |

## 넣는 순서

1. 전투: 맞음·빗나감·맞음당함·달아남. `playFx` 한 곳에서 거의 다 된다.
2. 은화·물건 변화, 가게 사고팔기, 장비.
3. 레벨 상승·부상·대성공·대실패.
4. 하루 흐름: 탐험·가게 드나들기·잠자리·장면 넘김.
5. 버튼 누름, 소리 켜기·끄기 설정. 설정 화면을 만들 때 같이 한다.

## 구현 방식

- `src/ui/sound.ts`의 `SOURCES`에 이름을 늘리고, 파일은 `assets/sounds/`에 둔다.
- 원본 ogg는 macOS `afconvert`로 잘라 모노 m4a로 바꾼다(iOS가 ogg를 읽지 못한다). 첫 소리가 파일 맨 앞에 오게 자르고 끝은 줄인다.
- 소리 여러 개를 겹치거나 이어 붙여도 된다. 이를 위해 `playSound`에 지연·음량 옵션을 둔다.
- 결과 카드를 눌러 건너뛰면(`skipped`) 남은 소리는 내지 않는다.

## 확인

- 단계마다 `npx tsc --noEmit`, `npx expo lint`, `npm test`를 돌린다.
- 웹에서 `HTMLMediaElement.play`를 감싸 재생 시각을 기록하고, 연출 박자와 맞는지 본다.
- 소리 크기와 어울림은 폰에서 직접 듣고 정한다.
