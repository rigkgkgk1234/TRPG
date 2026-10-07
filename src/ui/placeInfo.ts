import type { NpcId } from "@/core/labels";
import type { RegionId } from "@/core/types";

/**
 * 탐험·마을 볼일을 고르기 전에 보여 줄 안내 (화면 가운데 창).
 * 무엇이 나올 수 있는지 감만 잡히게 짧게 쓴다. 실제로 나오는 일은 이벤트 데이터가 정한다.
 */
export interface PlaceInfo {
  /** 한두 문장 소개 */
  summary: string;
  /** 얻을 수 있는 것 */
  gains: string[];
  /** 조심할 것 */
  risks: string[];
}

export const REGION_INFO: Partial<Record<RegionId, PlaceInfo>> = {
  forest: {
    summary: "마을 바로 뒤의 개암나무 숲. 약초와 버섯, 토끼가 흔하다. 요즘은 숲 동쪽에서 이상한 발자국이 보인다고 한다.",
    gains: ["약초·버섯·사냥감", "나무꾼·행상 돕기", "고블린의 흔적"],
    risks: ["늑대·멧돼지", "도적", "깊은 곳의 고블린"],
  },
  watchtower: {
    summary: "숲 너머 언덕의 버려진 감시탑. 옛 병사들의 물건이 남아 있지만, 도적이 숨어들고 날이 갈수록 고블린이 드나든다.",
    gains: ["옛 병사의 장비·은화", "약초·화살", "고블린의 계획"],
    risks: ["무너지는 계단·마루", "도적·늑대", "고블린 전사"],
  },
};

export interface NpcInfo extends PlaceInfo {
  /** 어떤 사람인지 (이름 아래 한 줄) */
  role: string;
}

export const NPC_INFO: Record<NpcId, NpcInfo> = {
  hamon: {
    role: "보리울의 촌장",
    summary: "마을의 어른. 마을 일을 맡기고 이곳저곳의 소식을 모은다.",
    gains: ["마을 일 돕기 → 평판", "숲에서 본 것 알리기", "살림이 어려우면 도움"],
    risks: ["다툼 중재에 실패하면 평판이 깎인다"],
  },
  brock: {
    role: "솜씨 좋은 대장장이",
    summary: "말수는 적고 손은 빠르다. 일손이 모자라면 품삯을 넉넉히 쳐준다.",
    gains: ["풀무질·망치질 → 은화", "날 세우는 법 → 대장일 경험", "싸게 넘기는 중고 무기"],
    risks: ["힘이 달리면 품삯이 줄어든다"],
  },
  lena: {
    role: "국경에서 돌아온 퇴역병",
    summary: "지금은 마을 경비를 맡고 있다. 무뚝뚝하지만 배우려는 사람은 마다하지 않는다.",
    gains: ["목검 대련 → 검술·방어 경험", "과녁 내기 → 은화", "국경 이야기 → 방어 경험"],
    risks: ["대련에서 얻어맞을 수 있다"],
  },
  magda: {
    role: "의원 겸 약초상",
    summary: "마을의 상처는 다 할멈 손을 거친다. 잔소리가 많지만 솜씨는 확실하다.",
    gains: ["약초 손질 → 은화·약초", "약초 공부 → 약초 경험", "진맥 → 경상 치료·약차", "늪 약초 → 치유 물약"],
    risks: ["독초를 섞으면 잔소리를 듣는다"],
  },
  toby: {
    role: "인심 좋은 여관 주인",
    summary: "마을의 소문은 다 이 여관으로 모인다. 일손이 필요할 때가 많다.",
    gains: ["장작·부엌일 → 은화·식량", "손님들에게 들은 소문", "싸움 말리기 → 평판"],
    risks: ["술꾼 싸움에 휘말리면 다칠 수 있다"],
  },
};
