import type { TextStyle } from "react-native";

/**
 * 디자인 토큰. 화면에서는 숫자·색을 직접 쓰지 말고 이 값을 쓴다.
 * 방향: 차가운 무채색 다크 바탕 + 강조색 하나(코발트). 판정 결과 색(성공·실패 등)은 의미 색이라 강조색과 따로 둔다.
 * 게임은 다크 테마 하나로 고정한다 (app.json userInterfaceStyle: dark).
 */
export const colors = {
  bg: "#0c0d0f",
  surface: "#15171a",
  surfaceRaised: "#1e2125",
  border: "#272a30",
  borderStrong: "#383c44",
  text: "#eceef1",
  textDim: "#a3a8b1",
  /** 지난 기록처럼 한 단계 물러난 글자 */
  textFaint: "#7a7f89",
  accent: "#5b8def",
  accentText: "#0a1426",
  accentSoft: "rgba(91, 141, 239, 0.14)",
  success: "#4fc07f",
  partial: "#e2a24c",
  fail: "#ef5f5a",
  crit: "#f2c94c",
  fumble: "#e0443f",
  /** 의미 색 위에 까는 옅은 바탕 */
  goodBg: "rgba(79, 192, 127, 0.12)",
  badBg: "rgba(239, 95, 90, 0.12)",
  critBg: "rgba(242, 201, 76, 0.12)",
  neutralBg: "#1e2125",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * 모서리 규칙 (하나만 쓴다): 버튼·카드·입력칸 = md(14), 칩·배지·막대 = pill, 카드 안의 작은 상자 = sm(8).
 */
export const radius = { sm: 8, md: 14, pill: 999 } as const;

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
