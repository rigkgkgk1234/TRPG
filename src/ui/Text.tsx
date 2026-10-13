import { Children, useState, type ReactNode } from "react";
import { Text as RNText, StyleSheet, type LayoutChangeEvent, type TextProps } from "react-native";
import { keepWords, WJ } from "@/ui/keepWords";

/**
 * 앱의 모든 글자는 이 Text를 쓴다 (react-native의 Text 대신).
 * JSX에서 나뉜 글자 조각("(", note, ")"나 "피로 ", 2)은 하나로 이어 붙인 뒤 줄바꿈 자리를 정한다. 안쪽 Text는 그대로 둔다.
 * sentences: 여러 문장으로 된 글. 한 줄에 다 들어가는 문장은 중간에서 끊지 않아, 남은 자리에 안 들어가면 통째로 다음 줄로 넘어간다.
 */
export function Text({ children, sentences, onLayout, ...rest }: TextProps & { sentences?: boolean }) {
  // 글 상자의 너비. 문장이 한 줄에 들어가는지 볼 때 쓴다 (줄바꿈이 바뀌어 상자가 좁아져도 넓었던 값을 그대로 둔다)
  const [width, setWidth] = useState(0);
  const layout = sentences
    ? (e: LayoutChangeEvent) => {
        const w = e.nativeEvent.layout.width;
        if (w > width + 1) setWidth(w);
        onLayout?.(e);
      }
    : onLayout;
  const shown = sentences && width > 0 ? keepSentencesIn(children, width, StyleSheet.flatten(rest.style) ?? {}) : children;
  return (
    <RNText lineBreakStrategyIOS="hangul-word" {...rest} onLayout={layout}>
      {joinText(shown)}
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

const NBSP = "\u00a0";
/** 문장이 끝나는 낱말: 마침표·물음표·느낌표·말줄임표로 끝난다 (닫는 따옴표·괄호까지) */
const SENTENCE_END = /[.!?…]["”’')\]]?$/;
/** 어림잡은 너비가 실제보다 작을 때를 대비해 줄 너비를 조금 덜 쓴다 */
const FIT_RATIO = 0.96;

function keepSentencesIn(children: ReactNode, width: number, style: { fontSize?: number; letterSpacing?: number; fontFamily?: string }): ReactNode {
  const size = style.fontSize ?? 14;
  const spacing = style.letterSpacing ?? 0;
  const heavy = /Bold|SemiBold/.test(style.fontFamily ?? "") ? 1.03 : 1;
  const fits = (s: string) => estimateWidth(s, size, spacing) * heavy <= width * FIT_RATIO;
  return Children.map(children, (c) => (typeof c === "string" ? keepSentences(c, fits) : c));
}

/** 한 줄에 들어가는 문장은 안의 띄어쓰기를 줄바꿈 없는 띄어쓰기로 바꾼다. 줄보다 긴 문장은 그대로 둬 보통처럼 끊는다 */
export function keepSentences(text: string, fits: (sentence: string) => boolean): string {
  let out = "";
  let sentence = "";
  const flush = () => {
    out += sentence.includes(" ") && fits(sentence) ? sentence.replace(/ /g, NBSP) : sentence;
    sentence = "";
  };
  // 짝수 칸은 낱말, 홀수 칸은 그 사이 띄어쓰기
  const tokens = text.split(/(\s+)/);
  tokens.forEach((t, i) => {
    if (i % 2 === 1 && SENTENCE_END.test(tokens[i - 1])) {
      flush();
      out += t;
    } else sentence += t;
  });
  flush();
  return out;
}

/**
 * 글자 폭을 어림한다 (Pretendard 기준, 글자 크기에 대한 비율). 화면에 그리기 전에 줄에 들어가는지만 보면 되므로 넉넉하게 잡는다.
 * 한글 0.86, 숫자 0.58, 라틴 0.52, 띄어쓰기 0.25를 웹에서 재고 조금씩 올렸다.
 */
function estimateWidth(s: string, size: number, spacing: number): number {
  let em = 0;
  for (const ch of s) {
    if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(ch)) em += 0.9;
    else if (/\s/.test(ch)) em += 0.27;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else if (/[.,:;'"’”!?()[\]·]/.test(ch)) em += 0.36;
    else if (/[A-Za-z]/.test(ch)) em += 0.62;
    else em += 0.9;
  }
  return em * size + spacing * [...s].length;
}
