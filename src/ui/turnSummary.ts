import type { FeedItem, GameCommand, ResourceKey } from "@/core/commands";
import { jobOf } from "@/core/day/actions";
import { EXERCISE_LABEL, isExerciseStat, isNpcId, josa, NPC_LABEL, PHASE_LABEL, REGION_LABEL, SKILL_LABEL, STAT_LABEL, WOUND_LABEL } from "@/core/labels";
import { equippedWeapon, isBow } from "@/core/combat/combat";
import type { CheckOutcome, CheckResult, CombatAction, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import type { LogGroup } from "@/store/gameStore";
import { colors } from "./theme";

export type Tone = "good" | "bad" | "neutral" | "crit";

export const TONE_COLOR: Record<Tone, string> = {
  good: colors.success,
  bad: colors.fail,
  neutral: colors.text,
  crit: colors.crit,
};

export const OUTCOME_COLOR: Record<CheckOutcome, string> = {
  critSuccess: colors.crit,
  success: colors.success,
  partial: colors.partial,
  fail: colors.fail,
  critFail: colors.fumble,
};

export const OUTCOME_TONE: Record<CheckOutcome, Tone> = {
  critSuccess: "crit",
  success: "good",
  partial: "neutral",
  fail: "bad",
  critFail: "bad",
};

const RESOURCE_LABEL: Record<ResourceKey, string> = {
  silver: "은화",
  food: "식량",
  hp: "HP",
  fatigue: "피로",
  reputation: "평판",
  debt: "빚",
};

/** 표시 순서: 벌이 → 먹을 것 → 몸 → 관계 → 빚 */
const RESOURCE_ORDER: ResourceKey[] = ["silver", "food", "hp", "fatigue", "reputation", "debt"];

/** 늘어나면 나쁜 자원 */
const COST_KEYS = new Set<ResourceKey>(["fatigue", "debt"]);

/** key: 자원 이름, 아이템이면 "item:herb" */
export interface Change { key: string; label: string; delta: number; tone: Tone }
/** mark: 문장 앞에 붙일 아이콘 종류 */
export interface Line { text: string; tone: Tone; mark?: "levelUp" | "wound" | "heal" }

/** 명령 하나의 결과를 "무엇을 했고 → 판정이 어땠고 → 무엇이 바뀌었고 → 무슨 일이 있었나"로 정리한 것 */
export interface TurnSummary {
  /** "3일차 오전" */
  when: string;
  /** "밭일", "혼자 훈련(활)", "하루 정산" */
  title: string;
  roll?: CheckResult;
  /** 자원별로 합친 변화 (0은 뺀다) */
  changes: Change[];
  /** 문장·등급 상승·부상을 일어난 순서대로 */
  events: Line[];
  /** 거절 사유 (토스트) */
  notices: string[];
}

export function summarizeTurn(group: LogGroup): TurnSummary {
  const run = group.before;
  const totals = new Map<ResourceKey, number>();
  const items = new Map<string, { name: string; delta: number }>();
  const events: Line[] = [];
  const notices: string[] = [];
  let roll: CheckResult | undefined;

  for (const item of group.items) {
    switch (item.kind) {
      case "resource": totals.set(item.key, (totals.get(item.key) ?? 0) + item.delta); break;
      case "item": {
        const prev = items.get(item.itemId);
        items.set(item.itemId, { name: item.name, delta: (prev?.delta ?? 0) + item.delta });
        break;
      }
      case "roll": roll ??= item.result; break;
      case "toast": notices.push(item.text); break;
      default: events.push(eventLine(item));
    }
  }

  const changes = RESOURCE_ORDER.flatMap((key): Change[] => {
    const delta = totals.get(key) ?? 0;
    if (delta === 0) return [];
    const good = COST_KEYS.has(key) ? delta < 0 : delta > 0;
    return [{ key, label: RESOURCE_LABEL[key], delta, tone: good ? "good" : "bad" }];
  });
  for (const [id, { name, delta }] of items) {
    if (delta !== 0) changes.push({ key: `item:${id}`, label: name, delta, tone: delta > 0 ? "good" : "bad" });
  }

  // 휴식처럼 문장이 없는 행동도 무엇이 일어났는지 한 줄은 있게
  if (events.length === 0 && notices.length === 0 && group.cmd.type === "chooseAction" && group.cmd.action === "rest") {
    events.push({ text: "몸을 누이고 한숨 돌렸다.", tone: "neutral" });
  }

  const when = `${run.time.day}일차 ${PHASE_LABEL[run.time.phase]}`;
  const event = eventTitle(group.cmd, run);
  return { when: event ? `${when}, ${event}` : when, title: commandTitle(group.cmd, run), roll, changes, events, notices };
}

/** 지난 기록용 변화 요약: "은화 +3, 식량 +1, 피로 +2" (없으면 첫 사건이나 거절 사유) */
export function changesLine(s: TurnSummary): string {
  if (s.changes.length > 0) return s.changes.map((c) => `${c.label} ${signed(c.delta)}`).join(", ");
  return s.events[0]?.text ?? s.notices[0] ?? "";
}

export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function commandTitle(cmd: GameCommand, run: RunState): string {
  switch (cmd.type) {
    case "chooseAction": {
      if (cmd.action === "work") return jobOf(CONTENT, run).work.label;
      const skill = cmd.skill ? `(${SKILL_LABEL[cmd.skill]})` : "";
      if (cmd.action === "trainSolo") return cmd.stat && isExerciseStat(cmd.stat) ? `혼자 훈련(${EXERCISE_LABEL[cmd.stat]})` : "혼자 훈련";
      if (cmd.action === "trainLesson") return `레나의 교습${skill}`;
      if (cmd.action === "rest") return "휴식";
      if (cmd.action === "explore" && cmd.region) return `${REGION_LABEL[cmd.region]} 탐험`;
      if (cmd.action === "village" && cmd.npc && isNpcId(cmd.npc)) return `${NPC_LABEL[cmd.npc]} 찾아가기`;
      return cmd.action;
    }
    case "chooseChoice": {
      const a = run.activeEvent;
      const scene = a && CONTENT.events[a.eventId]?.scenes[a.sceneId];
      return scene?.choices.find((c) => c.id === cmd.choiceId)?.label ?? "선택";
    }
    case "continue": return "계속";
    case "goDeeper": return cmd.yes ? "더 깊이 들어간다" : "마을로 돌아간다";
    case "combat": return combatTitle(cmd.action, run);
    case "endDay": return "하루 정산";
    case "shop": return shopTitle(cmd, run);
    case "equip": {
      const name = itemName(run.inventory.slots[cmd.slotIndex]?.itemId);
      return `${name} 장착`;
    }
    case "unequip": return `${itemName(run.inventory.equipment[cmd.slot]?.itemId)} ${cmd.slot === "armor" ? "벗기" : "내려놓기"}`;
    case "useItem": return `${itemName(cmd.itemId)} 사용`;
    case "discard": return `${itemName(run.inventory.slots[cmd.slotIndex]?.itemId)} 버리기`;
  }
}

const itemName = (id: string | undefined) => (id && CONTENT.items[id]?.name) || "물건";

function shopTitle(cmd: Extract<GameCommand, { type: "shop" }>, run: RunState): string {
  switch (cmd.op) {
    case "buyFood": return "식량 사기";
    case "payDebt": return "빚 갚기";
    case "buy": return `${itemName(cmd.target)} 사기`;
    case "sell": return `${itemName(run.inventory.slots[Number(cmd.target)]?.itemId)} 팔기`;
    case "repair": return "장비 수리";
    case "treat": return "상처 치료";
    case "stabilize": return "응급 처치";
  }
}

/** "공격: 늑대", "조준 사격: 늑대", "방어 자세", "약초 사용", "도주" */
function combatTitle(a: CombatAction, run: RunState): string {
  const c = run.combat;
  const target = (id: string) => {
    const e = c?.enemies.find((x) => x.instanceId === id);
    return e ? CONTENT.enemies[e.defId]?.name : undefined;
  };
  const bow = isBow(equippedWeapon(run, CONTENT));
  switch (a.type) {
    case "attack": return withTarget(bow ? "활 쏘기" : "공격", target(a.targetId));
    case "powerAttack": return withTarget(bow ? "조준 사격" : "강타", target(a.targetId));
    case "defend": return "방어 자세";
    case "useItem": return `${CONTENT.items[a.itemId]?.name ?? "아이템"} 사용`;
    case "flee": return "도주";
  }
}

const withTarget = (action: string, name?: string) => (name ? `${action}: ${name}` : action);

/** 이벤트 안에서 한 일이면 그 이벤트 제목 (카드 윗줄에 시각과 함께) */
function eventTitle(cmd: GameCommand, run: RunState): string | null {
  if (cmd.type !== "chooseChoice" && cmd.type !== "continue" && cmd.type !== "combat") return null;
  const a = run.activeEvent;
  return (a && CONTENT.events[a.eventId]?.title) ?? null;
}

function eventLine(item: Exclude<FeedItem, { kind: "resource" | "item" | "roll" | "toast" }>): Line {
  switch (item.kind) {
    case "text":
      return { text: item.text, tone: "neutral" };
    case "levelUp":
      return item.skill
        ? { text: `${SKILL_LABEL[item.skill]} ${item.newValue}등급이 되었다`, tone: "crit", mark: "levelUp" }
        : { text: `${josa(STAT_LABEL[item.stat!], "이/가")} 올랐다 (${signed(item.newValue)})`, tone: "crit", mark: "levelUp" };
    case "wound":
      return item.level === "none"
        ? { text: "상처가 다 나았다.", tone: "good", mark: "heal" }
        : { text: `부상을 입었다: ${WOUND_LABEL[item.level]}`, tone: "bad", mark: "wound" };
  }
}
