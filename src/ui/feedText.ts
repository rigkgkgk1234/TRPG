import type { FeedItem, ResourceKey } from "@/core/commands";
import { formatSigned, OUTCOME_LABEL, SKILL_LABEL, STAT_LABEL, WOUND_LABEL } from "@/core/labels";
import type { CheckOutcome } from "@/core/types";
import { colors } from "./theme";

const RESOURCE_LABEL: Record<ResourceKey, string> = {
  silver: "은화",
  food: "식량",
  hp: "HP",
  fatigue: "피로",
  reputation: "평판",
  debt: "빚",
};

export const OUTCOME_COLOR: Record<CheckOutcome, string> = {
  critSuccess: colors.crit,
  success: colors.success,
  partial: colors.partial,
  fail: colors.fail,
  critFail: colors.fumble,
};

export interface Line { text: string; color: string }

/**
 * 명령 하나의 피드를 화면 줄로 바꾼다: 판정 → 자원 변화(종류별로 합쳐 한 줄) → 나머지(문장·등급 상승·부상)를 일어난 순서대로.
 * 판정이 원인, 자원이 결과, 문장은 그 뒤의 사건(탈진·세금·다음 날)이라 이 순서가 읽기 자연스럽다.
 * 8주차 연출(주사위 애니메이션)이 생기기 전까지의 표시 방식.
 */
export function feedLines(items: FeedItem[]): Line[] {
  const rolls: Line[] = [];
  const rest: Line[] = [];
  const totals = new Map<ResourceKey, number>();
  for (const item of items) {
    if (item.kind === "resource") totals.set(item.key, (totals.get(item.key) ?? 0) + item.delta);
    else (item.kind === "roll" ? rolls : rest).push(feedLine(item));
  }
  const changes = [...totals].filter(([, delta]) => delta !== 0);
  const summary: Line[] = changes.length === 0 ? [] : [{
    text: changes.map(([key, delta]) => `${RESOURCE_LABEL[key]} ${formatSigned(delta)}`).join(" · "),
    color: colors.textDim,
  }];
  return [...rolls, ...summary, ...rest];
}

function feedLine(item: Exclude<FeedItem, { kind: "resource" }>): Line {
  switch (item.kind) {
    case "text":
      return { text: item.text, color: colors.text };
    case "toast":
      return { text: item.text, color: colors.textDim };
    case "roll": {
      const r = item.result;
      const mods = r.modifierTotal === 0 ? "" : ` ${formatSigned(r.modifierTotal)}`;
      const xp = r.xpGained > 0 ? ` · 경험 +${r.xpGained}` : "";
      return {
        text: `🎲 ${item.label}: ${r.kept}${mods} = ${r.total} vs ${r.spec.dc} → ${OUTCOME_LABEL[r.outcome]}${xp}`,
        color: OUTCOME_COLOR[r.outcome],
      };
    }
    case "levelUp":
      if (item.skill) return { text: `▲ ${SKILL_LABEL[item.skill]} ${item.newValue}등급`, color: colors.crit };
      return { text: `▲ ${STAT_LABEL[item.stat!]} ${formatSigned(item.newValue)}`, color: colors.crit };
    case "wound":
      return item.level === "none"
        ? { text: "상처가 다 나았다.", color: colors.success }
        : { text: `부상: ${WOUND_LABEL[item.level]}`, color: colors.fail };
  }
}
