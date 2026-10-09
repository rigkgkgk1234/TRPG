import type { ContentDB } from "../content";
import { EQUIP_SLOTS, slotsFor, type EquipSlot } from "../items/equipment";
import { isVisitId, SKILL_IDS, STAT_IDS } from "../labels";
import {
  FAME_MAX,
  FATIGUE_MAX,
  INVENTORY_CAPACITY,
  LAST_DAY,
  maxHp,
  SKILL_MAX_RANK,
  SKILL_XP_TO_NEXT,
  STAT_NATURAL_CAP,
  type ItemStack,
  type RunState,
} from "../types";

/**
 * 불러온 회차가 게임 규칙으로 나올 수 있는 상태인지 본다. 서명(seal)을 뚫더라도 말이 안 되는 수치
 * (은화 99999, 능력치 9, 이미 정해진 엔딩 등)는 받지 않는다.
 * @returns 문제가 있으면 그 이유, 없으면 null
 */
export function validateRun(run: RunState, content: Pick<ContentDB, "items" | "traits" | "events" | "enemies" | "jobs">): string | null {
  const p = run.player;
  const r = run.resources;
  const t = run.time;
  const int = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;

  if (run.ending !== null) return "이미 끝난 회차";
  if (!content.jobs[p.job]) return "직업";
  if (!int(t.day, 1, LAST_DAY) || !["morning", "am", "pm", "evening"].includes(t.phase)) return "날짜";
  if (!int(t.restsToday, 0, 3)) return "휴식 횟수";
  if (run.rng.lastD20 !== undefined && !int(run.rng.lastD20, 1, 20)) return "주사위";

  for (const s of STAT_IDS) {
    // 시작 능력치는 -1~+2, 자연 성장 상한 +4, 오래된 상처로 -1
    if (!int(p.stats[s], -3, STAT_NATURAL_CAP)) return `능력치 ${s}`;
    if (!int(p.statUses[s], 0, 99)) return `능력치 사용 ${s}`;
  }
  for (const s of SKILL_IDS) {
    const sk = p.skills[s];
    if (!sk || !int(sk.rank, 0, SKILL_MAX_RANK)) return `숙련 ${s}`;
    const need = SKILL_XP_TO_NEXT[sk.rank] ?? 0;
    if (!int(sk.xp, 0, Math.max(0, need - 1))) return `숙련 경험 ${s}`;
  }
  if (!int(p.hp, 0, maxHp(p.stats))) return "HP";
  if (!["none", "light", "serious", "critical"].includes(p.wound.level)) return "부상";
  if (!int(p.reputation, 0, 100)) return "평판";
  if (!int(p.fame, 0, FAME_MAX)) return "명성";
  if (!p.traits.every((id) => content.traits[id])) return "흔적";
  if (new Set(p.traits).size !== p.traits.length) return "흔적 중복";

  if (!int(r.silver, 0, 9999) || !int(r.food, 0, 999) || !int(r.debt, 0, 999)) return "자원";
  if (!int(r.fatigue, 0, FATIGUE_MAX) || !int(r.hunger, 0, 99) || !int(r.familyHunger, 0, 99)) return "피로·굶주림";

  const inv = run.inventory;
  if (inv.slots.length !== INVENTORY_CAPACITY) return "가방 칸";
  const stackOk = (s: ItemStack | null, slot?: string) => {
    if (!s) return true;
    const def = content.items[s.itemId];
    if (!def || !int(s.qty, 1, def.stackMax)) return false;
    if (slot && !slotsFor(def).includes(slot as EquipSlot)) return false;
    if (s.durability !== undefined) {
      const max = "durabilityMax" in def ? def.durabilityMax : 0;
      if (!int(s.durability, 0, max)) return false;
    }
    return true;
  };
  if (!inv.slots.every((s) => stackOk(s))) return "가방 물건";
  for (const slot of EQUIP_SLOTS) if (!stackOk(inv.equipment[slot] ?? null, slot)) return `장비 ${slot}`;
  const main = inv.equipment.weapon ? content.items[inv.equipment.weapon.itemId] : undefined;
  if (main?.category === "weapon" && main.twoHanded && inv.equipment.offHand) return "양손 무기와 왼손";

  for (const v of Object.values(run.flags)) if (typeof v !== "boolean" && typeof v !== "number") return "플래그";
  for (const [id, h] of Object.entries(run.eventHistory)) {
    if (!content.events[id] || !int(h.count, 1, 999) || !int(h.lastDay, 1, LAST_DAY)) return "이벤트 기록";
  }

  const a = run.activeEvent;
  if (a) {
    const ev = content.events[a.eventId];
    if (!ev) return "진행 중 이벤트";
    if (!ev.scenes[a.sceneId] && !a.explore) return "진행 중 장면";
    if (ev.npc !== undefined && !isVisitId(ev.npc)) return "마을 볼일";
  }
  const c = run.combat;
  if (c) {
    if (!a) return "이벤트 밖 전투";
    for (const e of c.enemies) {
      const def = content.enemies[e.defId];
      if (!def || !int(e.hp, -99, def.hp) || !int(e.maxHp, 1, def.hp)) return "적";
    }
  }
  return null;
}
