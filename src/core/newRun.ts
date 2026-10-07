import { SKILL_IDS, STAT_IDS } from "./labels";
import type { ContentDB } from "./content";
import {
  INVENTORY_CAPACITY,
  maxHp,
  SAVE_VERSION,
  type Inventory,
  type ItemStack,
  type JobId,
  type RunState,
  type Skills,
  type StatId,
} from "./types";

export interface NewRunOptions {
  /** 시드. 같은 시드·같은 입력이면 같은 회차가 된다 */
  seed: number;
  /** ISO 시각. 코어는 시계를 직접 읽지 않는다 */
  now: string;
}

/** 직업 데이터로 1일차 오전의 RunState를 만든다. */
export function newRun(content: ContentDB, jobId: JobId, name: string, { seed, now }: NewRunOptions): RunState {
  const job = content.jobs[jobId];
  if (!job) throw new Error(`알 수 없는 직업: ${jobId}`);

  const skills = Object.fromEntries(
    SKILL_IDS.map((s) => [s, { rank: job.startSkills[s] ?? 0, xp: 0 }]),
  ) as Skills;
  const statUses = Object.fromEntries(STAT_IDS.map((s) => [s, 0])) as Record<StatId, number>;

  return {
    version: SAVE_VERSION,
    runId: `run_${seed.toString(36)}_${Date.parse(now).toString(36)}`,
    createdAt: now,
    updatedAt: now,
    // 시드 0이면 mulberry32 첫 값이 늘 같으므로 상태는 시드에서 한 번 섞어 시작한다
    rng: { seed, state: seed ^ 0x9e3779b9 },
    player: {
      name: name.trim() || "이름 없는 주민",
      job: jobId,
      stats: { ...job.stats },
      statUses,
      skills,
      skillXpToday: {},
      hp: maxHp(job.stats),
      wound: { level: "none", restCount: 0, treatedDays: null, untreatedDays: 0 },
      traits: [],
      reputation: job.reputation,
    },
    resources: { silver: job.silver, food: job.food, debt: 0, fatigue: 0, hunger: 0, familyHunger: 0 },
    inventory: startInventory(content, job.startItems),
    // 첫날은 아침 이벤트 없이 오전 행동부터. 아침 이벤트는 날이 바뀔 때 연다 (evening.ts beginDay)
    time: { day: 1, phase: "am", skipNextAm: false, restsToday: 0, collapsedToday: false },
    flags: {},
    eventHistory: {},
    activeEvent: null,
    combat: null,
    ending: null,
    stats: {
      checksRolled: 0, crits: 0, fumbles: 0, combatsWon: 0, timesFled: 0,
      deathSavesSurvived: 0, silverEarned: 0, lowestHp: null,
    },
  };
}

function startInventory(content: ContentDB, items: { itemId: string; qty: number; equip?: boolean }[]): Inventory {
  const inv: Inventory = {
    slots: Array(INVENTORY_CAPACITY).fill(null),
    capacity: INVENTORY_CAPACITY,
    equipment: { weapon: null, armor: null, shield: null },
  };
  let next = 0;
  for (const { itemId, qty, equip } of items) {
    const def = content.items[itemId];
    if (!def) throw new Error(`시작 아이템이 콘텐츠에 없음: ${itemId}`);
    const stack: ItemStack = { itemId, qty };
    if ("durabilityMax" in def) stack.durability = def.durabilityMax;
    if (equip && (def.category === "weapon" || def.category === "armor" || def.category === "shield")) {
      inv.equipment[def.category] = stack;
    } else {
      // 시작 아이템은 몇 개뿐이라 칸이 모자랄 일도, 겹칠 일도 없다. 겹치기는 items/inventory.ts의 addItem.
      inv.slots[next++] = stack;
    }
  }
  return inv;
}
