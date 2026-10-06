# 보리울의 30일

평범한 마을 주민이 노력과 선택만으로 30일을 버티는 모바일 싱글플레이 텍스트 TRPG (iOS · Android).

## 문서
- [게임 기획서](docs/GAME_DESIGN.md)
- [시스템 상세 설계서](docs/SYSTEM_SPEC.md) — 타입의 원본
- [구현 아키텍처 & 로드맵](docs/ARCHITECTURE.md) — Expo + TypeScript + Zustand

## 개발

```bash
npm install
npm start            # Expo 개발 서버 → 폰의 Expo Go로 QR 스캔
npm run web          # 브라우저에서 실행
```

| 명령 | 내용 |
|------|------|
| `npm test` | 코어 단위 테스트 (vitest) |
| `npm run typecheck` | 타입 검사 |
| `npm run lint` | ESLint (`src/core`의 React/RN/Expo import 금지 규칙 포함) |
| `npm run gen:types` | `docs/SYSTEM_SPEC.md` → `src/core/types.ts` 재생성 |
| `npm run simulate` | 하루 루프 30일 자동 플레이 → 직업·방침별 은화·피로 곡선 (`-- --runs 500`) |

`src/core/types.ts`는 직접 고치지 말고 설계서를 고친 뒤 `npm run gen:types`를 실행한다.

## 폴더
- `src/app/` 화면 (Expo Router)
- `src/core/` 게임 로직 — 순수 TypeScript, UI 의존 없음. 진입점은 `engine.ts`의 `dispatch`
- `src/data/` 콘텐츠 JSON (아이템·흔적). 직업은 설계서의 `JOBS`
- `src/store/` Zustand 스토어 — 회차를 들고 명령을 `dispatch`에 넘기기만 한다
- `src/ui/` 컴포넌트·뷰·테마
- `tests/core/` 코어 테스트
