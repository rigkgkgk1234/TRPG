import { Children, type ReactNode } from "react";
import { Text as RNText, type TextProps } from "react-native";

/** 단어 이음표(WORD JOINER): 보이지 않고, 이 자리에서는 줄을 바꾸지 않는다 */
const WJ = "⁠";

/**
 * 띄어쓰기에서만 줄이 바뀌도록 붙어 있는 글자 사이에 단어 이음표를 넣는다.
 * 안드로이드(와 iOS 일부)는 한글을 글자 단위로 끊어 "안녕하 / 세요"처럼 나오기 때문이다.
 * 한 단어가 줄보다 길면 그때는 글자 단위로 끊긴다.
 */
export function keepWords(text: string): string {
  return text.replace(/(\S)(?=\S)/gu, `$1${WJ}`);
}

/** 앱의 모든 글자는 이 Text를 쓴다 (react-native의 Text 대신). 문자열 자식만 바꾸고 안쪽 Text는 그대로 둔다 */
export function Text({ children, ...rest }: TextProps) {
  return (
    <RNText lineBreakStrategyIOS="hangul-word" {...rest}>
      {Children.map(children, (c: ReactNode) => (typeof c === "string" ? keepWords(c) : c))}
    </RNText>
  );
}
