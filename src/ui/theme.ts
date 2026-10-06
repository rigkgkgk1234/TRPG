/** 색·여백·글자 크기 토큰. 화면에서는 숫자를 직접 쓰지 말고 이 값을 쓴다. */
export const colors = {
  bg: "#16130f",
  surface: "#221d17",
  surfaceRaised: "#2e271f",
  border: "#3d342a",
  text: "#ede4d3",
  textDim: "#a89a84",
  accent: "#d9a441",
  accentText: "#1a1408",
  success: "#7fb069",
  partial: "#d9a441",
  fail: "#c8553d",
  crit: "#f2d16b",
  fumble: "#9e2a2b",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const font = { sm: 13, md: 15, lg: 18, xl: 24, dice: 64 } as const;

export const radius = { sm: 6, md: 10, lg: 16 } as const;

/** 엄지로 누르기 편한 최소 높이 */
export const TOUCH_MIN = 48;
