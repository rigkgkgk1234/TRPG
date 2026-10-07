import type { ContentDB } from "@/core/content";
import type { Rng } from "@/core/types";

/** 원하는 D20 눈을 순서대로 내놓는 RNG. faces가 바닥나면 오류. */
export function d20Sequence(...faces: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= faces.length) throw new Error("d20Sequence: 준비한 주사위가 바닥났습니다");
    const face = faces[i++];
    return (face - 1) / 20 + 0.001;
  };
}

export { blankSubject as makeSubject } from "@/core/check/subject";

/**
 * 아침·밤 이벤트를 뺀 콘텐츠. 저녁 정산만 보고 싶은 테스트가 쓴다
 * (그대로 두면 아침 이벤트 추첨이 주사위를 하나 더 쓰고 이벤트 화면이 열린다).
 */
export function withoutDailyEvents(content: ContentDB): ContentDB {
  const events = Object.fromEntries(Object.entries(content.events).filter(([, ev]) => ev.category !== "morning" && ev.category !== "night"));
  return { ...content, events };
}
