import type { NpcId, PlaceId } from "@/core/labels";
import type { RegionId } from "@/core/types";

/**
 * 탐험·마을 볼일을 고르기 전에 보여 줄 안내 (화면 가운데 창).
 * 무엇이 나올 수 있는지 감만 잡히게 짧게 쓴다. 실제로 나오는 일은 이벤트 데이터가 정한다.
 */
export interface PlaceInfo {
  /** 고르기 칸의 한 줄 */
  tagline: string;
  /** 한두 문장 소개 */
  summary: string;
  /** 얻을 수 있는 것 */
  gains: string[];
  /** 조심할 것 */
  risks: string[];
}

export const REGION_INFO: Partial<Record<RegionId, PlaceInfo>> = {
  forest: {
    tagline: "약초, 사냥감이 많다. 늑대와 멧돼지가 산다",
    summary: "마을 바로 뒤의 개암나무 숲. 약초와 버섯, 토끼가 흔하다. 요즘은 숲 동쪽에서 이상한 발자국이 보인다고 한다.",
    gains: ["약초, 버섯, 사냥감", "나무꾼, 행상 돕기", "고블린의 흔적"],
    risks: ["늑대, 멧돼지", "도적", "깊은 곳의 고블린"],
  },
  watchtower: {
    tagline: "옛 병사의 물건이 남았다. 도적과 고블린이 드나든다",
    summary: "숲 너머 언덕의 버려진 감시탑. 옛 병사들의 물건이 남아 있지만, 도적이 숨어들고 날이 갈수록 고블린이 드나든다.",
    gains: ["옛 병사의 장비, 은화", "약초, 화살", "고블린의 계획"],
    risks: ["무너지는 계단, 마루", "도적, 늑대", "고블린 전사"],
  },
};

export interface NpcInfo {
  /** 어떤 사람인지 (이름 아래 한 줄) */
  role: string;
  /** 한두 문장 소개 */
  summary: string;
  /** 대화하면 생길 수 있는 일 */
  gains: string[];
}

export const NPC_INFO: Record<NpcId, NpcInfo> = {
  hamon: {
    role: "보리울의 촌장",
    summary: "마을의 어른. 마을 일을 맡기고 이곳저곳의 소식을 모은다.",
    gains: ["마을 일 돕기 → 평판", "숲에서 본 것 알리기", "살림이 어려우면 도움"],
  },
  brock: {
    role: "솜씨 좋은 대장장이",
    summary: "말수는 적고 손은 빠르다. 일손이 모자라면 수고비를 넉넉히 쳐준다.",
    gains: ["불 지피기, 망치질 → 은화", "날 세우는 법 → 대장일 경험", "싸게 넘기는 중고 무기"],
  },
  lena: {
    role: "국경에서 돌아온 옛 병사",
    summary: "지금은 마을 경비를 맡고 있다. 무뚝뚝하지만 배우려는 사람은 마다하지 않는다.",
    gains: ["목검 대련 → 검술, 방어 경험", "과녁 내기 → 은화", "국경 이야기 → 방어 경험"],
  },
  magda: {
    role: "의원 겸 약초상",
    summary: "마을의 상처는 다 할멈 손을 거친다. 잔소리가 많지만 솜씨는 확실하다.",
    gains: ["약초 손질 → 은화, 약초", "약초 공부 → 약초 경험", "진찰 → 경상 치료, 약초차", "늪 약초 → 치유 물약"],
  },
  toby: {
    role: "인심 좋은 여관 주인",
    summary: "마을의 소문은 다 이 여관으로 모인다. 일손이 필요할 때가 많다.",
    gains: ["장작, 부엌일 → 은화, 식량", "손님들에게 들은 소문", "싸움 말리기 → 평판"],
  },
};

export interface VillagePlaceInfo {
  /** 이름 아래 한 줄 */
  subtitle: string;
  summary: string;
  gains: string[];
  risks: string[];
}

/** 결투장·의뢰 중개소: 명성을 얻는 곳 */
export const PLACE_INFO: Record<PlaceId, VillagePlaceInfo> = {
  arena: {
    subtitle: "이기면 명성과 상금",
    summary: "광장 뒤 공터에 밧줄을 둘러 만든 결투장. 명성이 오를수록 센 상대가 나선다.",
    gains: ["마을 장정 → 명성 +4, 은화 2", "떠돌이 용병(명성 10) → 명성 +7, 은화 4", "우승자 가렛(명성 30) → 명성 +12, 은화 8"],
    risks: ["져도 죽지는 않지만 경상을 입고 명성이 깎인다", "도망칠 수 없다", "하루에 한 번만 들어갈 수 있다", "숙련 경험은 쌓이지 않는다 (명성만 오른다)"],
  },
  guild: {
    subtitle: "명성에 맞는 의뢰를 맡는다",
    summary: "여관 옆 작은 중개소. 이름이 알려질수록 품삯이 큰 일을 내준다.",
    gains: ["배달, 쥐 소탕(명성 10)", "늑대 퇴치(명성 20)", "도적 현상금(명성 30), 고블린 토벌(명성 40)"],
    risks: ["의뢰 전투는 진짜 싸움이다", "도망치면 명성 -1"],
  },
};
