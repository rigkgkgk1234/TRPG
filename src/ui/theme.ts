import type { TextStyle } from "react-native";

/**
 * 디자인 토큰. 화면에서는 숫자·색을 직접 쓰지 말고 이 값을 쓴다.
 * 방향: 회색이 살짝 섞인 검은 바탕 + 무채색 회색 + 푸른 강조색(코발트). 주황·노랑 계열은 쓰지 않는다.
 * 판정 결과의 성공(초록)·실패(빨강)만 의미 색으로 따로 두고, 그 밖에 색이 들어가는 곳은 푸른 계열로 맞춘다.
 * 상자는 꼭 필요한 곳(누를 수 있는 것, 떠 있는 창)에만 쓰고, 나머지는 여백과 가는 선으로 나눈다.
 * 게임은 다크 테마 하나로 고정한다 (app.json userInterfaceStyle: dark).
 */
export const colors = {
  bg: "#0b0b0d",
  surface: "#141416",
  surfaceRaised: "#1e1e22",
  border: "#28282d",
  borderStrong: "#393940",
  text: "#eceef1",
  textDim: "#a3a8b1",
  /** 지난 기록처럼 한 단계 물러난 글자 */
  textFaint: "#7a7f89",
  accent: "#5b8def",
  accentText: "#0a1426",
  accentSoft: "rgba(91, 141, 239, 0.14)",
  success: "#4fc07f",
  /** 부분 성공·주의: 옅은 푸른색 */
  partial: "#8fb0f5",
  /** 옅은 푸른 바탕 위의 글자 (식량 사기처럼 놓치면 안 되는 버튼) */
  partialText: "#0b1630",
  fail: "#ef5f5a",
  /** 대성공: 하늘색 */
  crit: "#7ec8f2",
  fumble: "#e0443f",
  /** 의미 색 위에 까는 옅은 바탕 */
  goodBg: "rgba(79, 192, 127, 0.12)",
  badBg: "rgba(239, 95, 90, 0.12)",
  critBg: "rgba(126, 200, 242, 0.13)",
  neutralBg: "#1e1e22",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * 모서리 규칙: 안쪽일수록 좁게. 떠 있는 창 = lg(20), 버튼·카드 = md(10), 카드 안의 작은 상자 = sm(6), 칩·막대 = pill.
 * 화면 아래에 붙은 패널은 모서리를 굴리지 않고 가는 윗선만 둔다.
 */
export const radius = { sm: 6, md: 10, lg: 20, pill: 999 } as const;

/** 가는 선 굵기 (상자 대신 나누는 선) */
export const hairline = 1;

/** Pretendard. 안드로이드는 fontWeight로 굵기를 고르지 못하므로 굵기마다 다른 family를 쓴다. */
export const fonts = {
  regular: "Pretendard-Regular",
  semibold: "Pretendard-SemiBold",
  bold: "Pretendard-Bold",
} as const;

export const FONT_FILES = {
  [fonts.regular]: require("../../assets/fonts/Pretendard-Regular.otf"),
  [fonts.semibold]: require("../../assets/fonts/Pretendard-SemiBold.otf"),
  [fonts.bold]: require("../../assets/fonts/Pretendard-Bold.otf"),
};

/** 글자 스타일 묶음. 한글 본문은 글자 크기의 1.5배 줄 간격, 큰 제목은 자간을 살짝 좁힌다. */
export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 42, letterSpacing: -0.8 },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, letterSpacing: -0.4 },
  /** 작은 머리글: 자간을 넓혀 장부의 항목 이름처럼 */
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.6 },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  number: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, fontVariant: ["tabular-nums"] },
} satisfies Record<string, TextStyle>;

/** 엄지로 누르기 편한 최소 높이 */
export const TOUCH_MIN = 48;

/** 아이콘 크기와 굵기는 한 가지로 통일 */
export const icon = { sm: 16, md: 20, lg: 24, weight: "bold" } as const;

/** 결과 연출 시간(ms). GAME_DESIGN: 주사위 0.8초 */
export const motion = { dice: 800, settle: 250, stagger: 180, fade: 220, press: 0.97 } as const;
