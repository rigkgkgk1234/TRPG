import type { JobId } from "@/core/types";

/** 새 게임 직업 카드의 한 줄 특징 (짧은 명사형). 규칙 수치는 core/jobPerks.ts와 맞춘다 */
export const JOB_PERK: Record<JobId, string> = {
  farmer: "넉넉한 식량, 쉬운 밭일",
  smith: "수리비 반값, 처음부터 망치",
  hunter: "활과 추적, 낮은 평판",
  herbalist: "약초로 경상 확실히 치료, 늪 판정 +1",
  recruit: "방어 자세 +1, 습격 때 자경단 +1명",
  soldier_child: "강타 명중 벌점 −1",
  woodcutter: "숲 탐험 피로 −1, 혼자 울타리 세우기",
  errand: "평판이 오를 때 +1, 여관 물건값 반값",
  peddler: "판매가 +20%, 평판 0에서 시작",
  acolyte: "밤에 피로 1 더 회복, 평판 15에서 시작",
};
