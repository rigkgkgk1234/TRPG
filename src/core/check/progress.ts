import type { Ctx } from "../commands";
import { STAT_IDS } from "../labels";
import {
  SKILL_MAX_RANK,
  SKILL_XP_CAP_PER_DAY,
  SKILL_XP_TO_NEXT,
  STAT_GROWTH_USES,
  STAT_NATURAL_CAP,
  type PlayerState,
  type SkillId,
} from "../types";

/** 오늘 이 숙련에 더 쌓을 수 있는 XP (하루 상한 6) */
export function skillXpRoomToday(player: PlayerState, skill: SkillId): number {
  return Math.max(0, SKILL_XP_CAP_PER_DAY - (player.skillXpToday[skill] ?? 0));
}

/**
 * 숙련 XP를 더하고 필요치를 채우면 레벨을 올린다. (SYSTEM_SPEC 1-4)
 * 하루 상한을 넘는 몫은 버린다. 레벨이 오르면 XP는 0으로 (넘친 XP는 이월하지 않음).
 * @returns 실제로 쌓인 XP
 */
export function gainSkillXp(ctx: Ctx, skill: SkillId, amount: number): number {
  const p = ctx.draft.player;
  const progress = p.skills[skill];
  if (progress.rank >= SKILL_MAX_RANK) return 0;

  const gained = Math.min(amount, skillXpRoomToday(p, skill));
  if (gained <= 0) return 0;
  p.skillXpToday[skill] = (p.skillXpToday[skill] ?? 0) + gained;
  progress.xp += gained;

  if (progress.xp >= SKILL_XP_TO_NEXT[progress.rank]) {
    progress.rank += 1;
    progress.xp = 0;
    ctx.feed.push({ kind: "levelUp", skill, newValue: progress.rank });
  }
  return gained;
}

/**
 * 저녁 정산 6단계: 판정에 15회 쓴 능력치는 +1 하고 카운트를 0으로. 자연 성장 상한(+4)이면 오르지 않는다.
 * 화면이 "성장까지 15/15"로 다 찼다고 보여 주므로 굴림 없이 반드시 오른다.
 */
export function growStats(ctx: Ctx): void {
  const p = ctx.draft.player;
  for (const stat of STAT_IDS) {
    if (p.statUses[stat] < STAT_GROWTH_USES || p.stats[stat] >= STAT_NATURAL_CAP) continue;
    p.stats[stat] += 1;
    p.statUses[stat] = 0;
    ctx.feed.push({ kind: "levelUp", stat, newValue: p.stats[stat] });
  }
}
