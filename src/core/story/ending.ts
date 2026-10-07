import type { ContentDB } from "../content";
import { REGION_LABEL, SKILL_IDS } from "../labels";
import { DEBT_ENDING_THRESHOLD, type EndingId, type RegionId, type RunRecord, type RunState } from "../types";

/** 엔딩 판정에 쓰는 기준 (GAME_DESIGN 7장) */
export const SHIELD_REPUTATION = 60;
export const FLEE_REPUTATION = 40;

/**
 * 엔딩 판정 표: 위에서부터 처음 맞는 것. 기본값(살아남은 자)은 항상 마지막. (ARCHITECTURE 6주차)
 * 플래그는 스토리 이벤트가 세운다: route_* (21일차 결정), raid_won (습격을 막아 냄), fled_together (이웃과 함께 떠남) 등.
 */
const ENDING_RULES: { id: EndingId; when: (s: RunState) => boolean }[] = [
  { id: "rowen_spearman", when: (s) => s.flags.route_rowen === true && s.flags.recruit_passed === true },
  { id: "shield_of_village", when: (s) => s.flags.raid_won === true && s.player.reputation >= SHIELD_REPUTATION },
  { id: "flee_together", when: (s) => s.flags.fled_together === true && s.player.reputation >= FLEE_REPUTATION },
  { id: "survivor", when: () => true },
];

export function resolveEnding(s: RunState): EndingId {
  if (s.player.hp <= 0) return "death";
  if (s.resources.debt >= DEBT_ENDING_THRESHOLD) return "debtor";
  return ENDING_RULES.find((r) => r.when(s))!.id;
}

/** 엔딩 화면의 한 단락 */
export function endingText(s: RunState): string {
  switch (s.ending) {
    case "shield_of_village":
      return "고블린들은 목책 앞에서 무너졌다. 노래로 남을 일은 아니지만, 보리울 사람들은 그날 밤 누가 앞에 섰는지 오래 기억할 것이다.";
    case "flee_together":
      return "보리울은 불탔다. 그래도 수레마다 사람이 타고 있었다. 마을은 잃었지만 이웃은 잃지 않았다.";
    case "rowen_spearman":
      return "로웬으로 가는 길에 마지막으로 고개를 돌렸다. 기사는 되지 못하겠지만, 창을 쥔 손은 이제 떨리지 않는다.";
    case "survivor":
      if (s.flags.raid_won) return "습격은 막아 냈지만 마을 사람들은 그 밤의 이야기를 하지 않는다. 살아남았다. 그것으로 됐다.";
      if (s.flags.fled_together) return "수레는 떠났지만 따라나선 이웃은 몇 되지 않았다. 남은 사람들의 소식은 끝내 듣지 못했다.";
      return "날이 밝자 마을 곳곳에 연기가 피어올랐다. 살아남았다. 그것 말고는 아무것도 장담할 수 없다.";
    case "debtor":
      return "징수관이 빚 문서를 흔들었다. 영지의 노역장으로 끌려가며, 서른 날을 다 채우지 못한 것이 못내 아쉬웠다.";
    case "death":
      return "보리울의 서른 날은 여기서 끝났다.";
    default:
      return "";
  }
}

/** 사망 원인: 마지막 상태를 보고 정한다 */
export interface DeathInfo { cause: string; region: RegionId; day: number }

/**
 * 회차 기록을 만든다. before는 마지막 명령 직전 상태 (전투 중이었는지, 어디 있었는지 알 수 있다).
 * 포기한 회차는 abandoned로.
 */
export function makeRecord(
  run: RunState,
  content: Pick<ContentDB, "enemies" | "events">,
  finishedAt: string,
  before?: RunState,
  abandoned = false,
): RunRecord {
  const best = SKILL_IDS
    .map((skill) => ({ skill, rank: run.player.skills[skill].rank }))
    .filter((x) => x.rank > 0)
    .sort((a, b) => b.rank - a.rank)[0] ?? null;
  const record: RunRecord = {
    runId: run.runId,
    job: run.player.job,
    ending: abandoned ? "abandoned" : run.ending ?? "survivor",
    daysSurvived: run.time.day,
    traits: [...run.player.traits],
    bestSkill: best,
    finishedAt,
  };
  if (!abandoned && run.ending === "death") record.death = deathInfo(run, content, before);
  return record;
}

function deathInfo(run: RunState, content: Pick<ContentDB, "enemies" | "events">, before?: RunState): DeathInfo {
  const day = run.time.day;
  const active = before?.activeEvent;
  const region = active?.explore?.region ?? (active ? content.events[active.eventId]?.region : undefined) ?? "village";
  const enemy = before?.combat?.enemies[0];
  if (enemy) return { cause: content.enemies[enemy.defId]?.name ?? "짐승", region, day };
  if (before?.player.wound.level === "critical") return { cause: "상처", region: "village", day };
  return { cause: "굶주림", region: "village", day };
}

/** 묘비문: "12일차, 개암나무 숲에서 늑대에게 쓰러지다" */
export function epitaph(r: RunRecord, name?: string): string {
  if (!r.death) return "";
  const who = name ? `${name}, ` : "";
  const where = REGION_LABEL[r.death.region];
  switch (r.death.cause) {
    case "굶주림": return `${who}${r.death.day}일차, 주린 배를 안고 잠든 채 깨어나지 못하다`;
    case "상처": return `${who}${r.death.day}일차, 아물지 않은 상처를 끝내 이기지 못하다`;
    default: return `${who}${r.death.day}일차, ${where}에서 ${r.death.cause}에게 쓰러지다`;
  }
}
