import type { Ctx } from "../commands";
import { rollCheck, type CheckResult, type CheckSpec } from "../types";
import { buildCheckContext, type ExtraSources } from "./modifiers";
import { gainSkillXp } from "./progress";

/**
 * 상태를 읽어 판정을 굴리고, 판정이 남기는 기록(능력치 사용 횟수·숙련 XP·통계)을 반영한다.
 * 결과에 따른 보상·벌칙은 호출한 쪽이 처리한다.
 * 반환값의 xpGained는 하루 상한(과 xpCap: 전투 한 번의 상한)을 적용한 실제 획득량이다 (숙련 없는 판정은 0).
 */
export function performCheck(ctx: Ctx, spec: CheckSpec, label: string, extra?: ExtraSources, xpCap = Infinity): CheckResult {
  const s = ctx.draft;
  const raw = rollCheck(spec, buildCheckContext(s, spec, ctx.content, extra), ctx.rng);
  const result: CheckResult = { ...raw, xpGained: 0 };

  s.stats.checksRolled += 1;
  if (result.outcome === "critSuccess") s.stats.crits += 1;
  if (result.outcome === "critFail") s.stats.fumbles += 1;
  s.player.statUses[spec.stat] += 1;

  // 굴림을 먼저 피드에 넣어야 등급 상승 연출이 굴림 뒤에 나온다
  ctx.feed.push({ kind: "roll", label, result });
  if (spec.skill) result.xpGained = gainSkillXp(ctx, spec.skill, Math.min(raw.xpGained, xpCap));
  return result;
}
