import type { JobId } from "@/core/types";

/** 새 게임 직업 카드의 한 줄 특징 (짧은 명사형). 규칙 수치는 core/jobPerks.ts와 맞춘다 */
export const JOB_PERK: Record<JobId, string> = {
  farmer: "넉넉한 식량, 쉬운 밭일",
  smith: "수리비 반값, 망치 소지",
  hunter: "활과 추적, 낮은 평판",
  herbalist: "경상 치료, 늪 판정 +1",
  recruit: "방어 자세 +1",
  soldier_child: "숙련 성장 +50%",
  woodcutter: "숲 탐험 피로 −1",
  errand: "평판 획득 +1, 여관 물건값 −50%",
  peddler: "대장간·약초방 −20%, 시작 평판 0",
  acolyte: "밤에 피로 1 더 회복, 시작 평판 15",
};
