import { Children, type ReactNode } from "react";
import { Text as RNText, type TextProps } from "react-native";
import { keepWords, WJ } from "@/ui/keepWords";

/**
 * 앱의 모든 글자는 이 Text를 쓴다 (react-native의 Text 대신).
 * JSX에서 나뉜 글자 조각("(", note, ")"나 "피로 ", 2)은 하나로 이어 붙인 뒤 줄바꿈 자리를 정한다. 안쪽 Text는 그대로 둔다.
 */
export function Text({ children, ...rest }: TextProps) {
  return (
    <RNText lineBreakStrategyIOS="hangul-word" {...rest}>
      {joinText(children)}
    </RNText>
  );
}

function joinText(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  let run = "";
  // 앞뒤 끝에도 이음표를 붙여, 바로 옆 Text 조각("1"과 작은 글씨 "(늑대 사냥꾼)")과 붙은 곳에서도 끊지 않는다
  const flush = () => {
    if (run) out.push(`${/^\S/.test(run) ? WJ : ""}${keepWords(run)}${/\S$/.test(run) ? WJ : ""}`);
    run = "";
  };
  for (const c of Children.toArray(children)) {
    if (typeof c === "string" || typeof c === "number") run += String(c);
    else {
      flush();
      out.push(c);
    }
  }
  flush();
  return out;
}
