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
