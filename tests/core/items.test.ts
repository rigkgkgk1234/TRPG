import { describe, expect, it } from "vitest";
import type { Ctx } from "@/core/commands";
import { combatStep, finishCombat, playerDefense, startCombat } from "@/core/combat/combat";
import { dispatch } from "@/core/engine";
import { discard, equip, equipBlock, unequip } from "@/core/items/equipment";
import { canUseItem, consumeItem } from "@/core/items/inventory";
import { adjustedPrice, buy, repair, repairPrice, sell, sellPrice, SHOPS, stabilize, treat } from "@/core/items/shop";
import { newRun } from "@/core/newRun";
import type { ItemStack, JobId, Rng, RunState } from "@/core/types";
import { CONTENT } from "@/data";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (job: JobId = "farmer", seed = 1) => newRun(CONTENT, job, "하람", { seed, now: NOW });

function edit(run: RunState, fn: (s: RunState) => void): RunState {
  const copy = structuredClone(run);
  fn(copy);
  return copy;
}
function seq(...xs: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= xs.length) throw new Error("seq: 준비한 값이 바닥났습니다");
    return xs[i++];
  };
}
const f20 = (face: number) => (face - 1) / 20 + 0.001;
const ctxOf = (run: RunState, rng: Rng = seq()): Ctx => ({ draft: structuredClone(run), content: CONTENT, rng, feed: [] });
const gear = (itemId: string, durability?: number): ItemStack => {
  const def = CONTENT.items[itemId]!;
  return { itemId, qty: 1, durability: durability ?? ("durabilityMax" in def ? def.durabilityMax : undefined) };
};
/** 가방 i번 칸에 물건을 넣은 상태 */
const withBag = (run: RunState, ...stacks: (ItemStack | null)[]) => edit(run, (s) => { stacks.forEach((x, i) => { s.inventory.slots[i] = x; }); });

describe("장착", () => {
  it("가방의 장비를 걸치면 걸쳤던 것과 맞바꾼다", () => {
    const ctx = ctxOf(withBag(start("farmer"), gear("rusty_sword")));
    expect(equip(ctx, 0)).toBeNull();
    expect(ctx.draft.inventory.equipment.weapon?.itemId).toBe("rusty_sword");
    expect(ctx.draft.inventory.slots[0]?.itemId).toBe("pitchfork");
    expect(ctx.feed).toContainEqual({ kind: "text", text: "녹슨 검을 들었다." });
  });

  it("양손 무기를 든 채 방패는 못 들고, 방패를 든 채 양손 무기를 잡으면 방패는 가방으로", () => {
    const farmer = withBag(start("farmer"), gear("wooden_shield"));
    expect(equipBlock(farmer, CONTENT, 0)).toBe("쇠갈퀴를 든 채로는 방패를 들 수 없다");

    const ctx = ctxOf(withBag(edit(start("smith"), (s) => { s.inventory.equipment.shield = gear("wooden_shield"); }), gear("pitchfork")));
    expect(equip(ctx, 0)).toBeNull();
    expect(ctx.draft.inventory.equipment).toMatchObject({ weapon: { itemId: "pitchfork" }, shield: null });
    expect(ctx.draft.inventory.slots.filter(Boolean).map((x) => x!.itemId).sort()).toEqual(["old_hammer", "wooden_shield"]);
  });

  it("긴 활은 근력 1이 있어야 든다", () => {
    expect(equipBlock(withBag(start("hunter"), gear("longbow")), CONTENT, 0)).toBe("근력 1레벨 필요");
    expect(equipBlock(withBag(start("farmer"), gear("longbow")), CONTENT, 0)).toBeNull();
  });

  it("벗으려면 가방에 빈칸이 있어야 하고, 증거물은 버릴 수 없다", () => {
    const full = edit(start("farmer"), (s) => { s.inventory.slots = s.inventory.slots.map(() => ({ itemId: "herb", qty: 1 })); });
    expect(unequip(ctxOf(full), "weapon")).toBe("가방에 자리가 없다");
    expect(discard(ctxOf(withBag(start(), { itemId: "goblin_token", qty: 1 })), 0)).toBe("이건 버릴 수 없다");
    const ctx = ctxOf(withBag(start(), { itemId: "herb", qty: 3 }));
    expect(discard(ctx, 0)).toBeNull();
    expect(ctx.draft.inventory.slots[0]).toBeNull();
  });

  it("전투 밖에서 소모품 쓰기: 쓴 약초차 → 피로 −2, 싸우는 중에는 막는다", () => {
    const run = withBag(edit(start(), (s) => { s.resources.fatigue = 5; }), { itemId: "bitter_tea", qty: 1 });
    const res = dispatch(run, { type: "useItem", itemId: "bitter_tea" }, CONTENT);
    expect(res.state.resources.fatigue).toBe(3);
    expect(res.state.inventory.slots[0]).toBeNull();
  });
});

describe("가게", () => {
  it("평판 60 이상 10% 싸게, 10 미만 10%·5 미만 20% 비싸게 (올림)", () => {
    const at = (rep: number) => edit(start(), (s) => { s.player.reputation = rep; });
    // 시작 평판 10은 보정 없음, 사냥꾼(5)은 10% 비싸게
    expect(adjustedPrice(at(10), 25)).toBe(25);
    expect(adjustedPrice(at(5), 25)).toBe(28);
    expect(adjustedPrice(at(4), 25)).toBe(30);
    expect(adjustedPrice(at(60), 25)).toBe(23);
    expect(adjustedPrice(at(9), 3)).toBe(4);
  });

  it("가죽 갑옷을 사면 몸 칸이 비어 있으니 바로 입는다", () => {
    const ctx = ctxOf(edit(start("farmer"), (s) => { s.resources.silver = 30; s.player.reputation = 30; }));
    expect(buy(ctx, "smithy", "leather_armor")).toBeNull();
    expect(ctx.draft.resources.silver).toBe(6);
    expect(ctx.draft.inventory.equipment.armor).toEqual({ itemId: "leather_armor", qty: 1, durability: 25 });
    expect(playerDefense(ctx.draft, CONTENT, null)).toBe(12);
  });

  it("이미 든 칸이면 가방으로, 은화·자리가 모자라면 거절, 화살은 10개 묶음", () => {
    const ctx = ctxOf(edit(start("farmer"), (s) => { s.resources.silver = 30; s.player.reputation = 30; }));
    expect(buy(ctx, "smithy", "rusty_sword")).toBeNull();
    expect(ctx.draft.inventory.slots[0]?.itemId).toBe("rusty_sword");
    expect(buy(ctx, "smithy", "soldier_sword")).toBe("은화가 모자란다");
    expect(buy(ctx, "inn", "arrow")).toBeNull();
    expect(ctx.draft.inventory.slots[1]).toEqual({ itemId: "arrow", qty: 10 });
    expect(buy(ctx, "healer", "rusty_sword")).toBe("그런 물건은 없다");
  });

  it("팔기: 구매가의 절반(내림), 가죽은 정해진 값, 증거물은 못 판다", () => {
    expect(sellPrice(CONTENT.items.rusty_sword)).toBe(5);
    expect(sellPrice(CONTENT.items.wolf_pelt)).toBe(4);
    expect(sellPrice(CONTENT.items.goblin_token)).toBe(0);
    const ctx = ctxOf(withBag(start(), { itemId: "wolf_pelt", qty: 3 }));
    expect(sell(ctx, 0, 2)).toBeNull();
    expect(ctx.draft.resources.silver).toBe(10 + 8);
    expect(ctx.draft.inventory.slots[0]?.qty).toBe(1);
  });

  it("수리: 내구도 5당 은화 1 (올림), 대장장이 견습은 반값", () => {
    const worn = edit(start("farmer"), (s) => { s.inventory.equipment.weapon!.durability = 5; });
    expect(repairPrice(worn, CONTENT, worn.inventory.equipment.weapon!)).toBe(3);
    const smith = edit(start("smith"), (s) => { s.inventory.equipment.weapon!.durability = 5; });
    expect(repairPrice(smith, CONTENT, smith.inventory.equipment.weapon!)).toBe(2);
    const ctx = ctxOf(worn);
    expect(repair(ctx, "weapon")).toBeNull();
    expect(ctx.draft.inventory.equipment.weapon!.durability).toBe(20);
    expect(ctx.draft.resources.silver).toBe(7);
    expect(repair(ctx, "weapon")).toBe("고칠 데가 없다");
  });

  it("치료: 중상만 은화 5, 치료하면 사흘 뒤 경상", () => {
    expect(treat(ctxOf(start()))).toBe("치료할 큰 상처가 없다");
    const run = edit(start(), (s) => { s.player.wound.level = "serious"; });
    const ctx = ctxOf(run);
    expect(treat(ctx)).toBeNull();
    expect(ctx.draft.player.wound.treatedDays).toBe(0);
    expect(treat(ctx)).toBe("치료할 큰 상처가 없다");
    expect(treat(ctxOf(edit(run, (s) => { s.player.wound.level = "critical"; })))).toBe("치명상은 응급 처치부터 받아야 한다");
  });

  it("응급 처치: 치명상만 은화 12, 피로 +2, 치료받은 중상이 된다", () => {
    expect(stabilize(ctxOf(start()))).toBe("응급 처치할 상처가 없다");
    const critical = edit(start(), (s) => { s.player.wound.level = "critical"; s.resources.silver = 15; });
    const ctx = ctxOf(critical);
    expect(stabilize(ctx)).toBeNull();
    expect(ctx.draft.player.wound).toMatchObject({ level: "serious", treatedDays: 0 });
    expect(ctx.draft.resources).toMatchObject({ silver: 3, fatigue: 2 });
    expect(stabilize(ctxOf(edit(critical, (s) => { s.resources.silver = 11; })))).toBe("은화가 모자란다");
  });

  it("거래는 행동 슬롯을 쓰지 않고, 탐험·전투 중에는 못 한다", () => {
    const run = edit(start(), (s) => { s.resources.silver = 30; });
    const res = dispatch(run, { type: "shop", op: "buy", shop: "smithy", target: "leather_armor" }, CONTENT);
    expect(res.state.time.phase).toBe("am");
    expect(res.save).toBe(true);
    const busy = edit(run, (s) => { s.activeEvent = { eventId: "forest_herb_01", sceneId: "start" }; });
    expect(dispatch(busy, { type: "shop", op: "buy", shop: "smithy", target: "leather_armor" }, CONTENT).feed)
      .toEqual([{ kind: "toast", text: "지금은 살 수 없다" }]);
  });
});

describe("내구도", () => {
  function fight(run: RunState, rng: Rng): Ctx {
    const ctx = ctxOf(run, rng);
    startCombat(ctx, { enemies: ["boar"], initiative: "player", canFlee: true, onVictory: "win" });
    return ctx;
  }

  it("전투 한 번에 공격한 무기 −1, 맞았으면 방어구 −1", () => {
    const run = edit(start("farmer"), (s) => { s.inventory.equipment.armor = gear("leather_armor"); });
    // 빗나감 → 멧돼지 15 + 3 ≥ 12 명중(피해 1d6) → 도주 성공
    const ctx = fight(run, seq(f20(5), f20(15), 0.1, f20(19)));
    combatStep(ctx, { type: "attack", targetId: "boar_1" });
    combatStep(ctx, { type: "flee" });
    finishCombat(ctx);
    expect(ctx.draft.inventory.equipment.weapon!.durability).toBe(19);
    expect(ctx.draft.inventory.equipment.armor!.durability).toBe(24);
  });

  it("대실패가 있었으면 무기 −2, 0이 되면 망가져 피해 −2·방어구 효과 0", () => {
    const run = edit(start("farmer"), (s) => {
      s.inventory.equipment.weapon!.durability = 2;
      s.inventory.equipment.armor = gear("leather_armor", 0);
    });
    expect(playerDefense(run, CONTENT, null)).toBe(10);
    // 대실패 → 멧돼지 빗나감(2) → 도주 성공
    const ctx = fight(run, seq(f20(1), f20(2), f20(19)));
    combatStep(ctx, { type: "attack", targetId: "boar_1" });
    combatStep(ctx, { type: "flee" });
    finishCombat(ctx);
    expect(ctx.draft.inventory.equipment.weapon!.durability).toBe(0);
    expect(ctx.feed).toContainEqual({ kind: "text", text: "쇠갈퀴가 망가졌다. 대장간에서 고쳐야 한다." });

    // 망가진 쇠갈퀴: 1d6(=6) + 근력 1 − 2 = 5
    // 멧돼지 HP 18 → 13 (절반 9보다 많아 사기 굴림 없음)
    const hit = fight(ctx.draft, seq(f20(15), 0.99, f20(2)));
    combatStep(hit, { type: "attack", targetId: "boar_1" });
    expect(hit.draft.combat!.enemies[0].hp).toBe(18 - 5);
  });
});

describe("가게 물건 목록", () => {
  it("가게마다 파는 물건이 모두 콘텐츠에 있고, 값은 은화 1~45 사이", () => {
    for (const shop of Object.values(SHOPS)) {
      for (const e of shop.stock) {
        const def = CONTENT.items[e.itemId];
        expect(def, `${shop.id}: ${e.itemId}`).toBeDefined();
        const price = e.price ?? def!.price * e.qty;
        expect(price, e.itemId).toBeGreaterThanOrEqual(1);
        expect(price, e.itemId).toBeLessThanOrEqual(45);
      }
    }
    // 같은 물건을 한 가게에 두 줄로 두면 buy가 어느 줄인지 모른다
    for (const shop of Object.values(SHOPS)) expect(new Set(shop.stock.map((e) => e.itemId)).size).toBe(shop.stock.length);
  });

  it("되팔아 남는 물건은 없다: 판매가 ≤ 구매가", () => {
    for (const def of Object.values(CONTENT.items)) if (def.price > 0) expect(sellPrice(def), def.id).toBeLessThanOrEqual(def.price);
  });

  it("부목은 중상만 경상으로, 고칠 부상이 없으면 쓰지 않는다", () => {
    const healthy = withBag(start(), { itemId: "splint", qty: 1 });
    expect(canUseItem(healthy, CONTENT, "splint", false)).toBe(false);
    const hurt = ctxOf(edit(healthy, (s) => { s.player.wound.level = "serious"; }));
    expect(consumeItem(hurt, "splint", false)).toBe(true);
    expect(hurt.draft.player.wound.level).toBe("light");
    const critical = edit(healthy, (s) => { s.player.wound.level = "critical"; });
    expect(canUseItem(critical, CONTENT, "splint", false)).toBe(false);
  });

  it("전투 망치는 근력 2가 있어야 든다, 농부는 못 든다", () => {
    const ctx = ctxOf(withBag(start("farmer"), gear("war_hammer")));
    expect(equip(ctx, 0)).toBe("근력 2레벨 필요");
    const smith = ctxOf(withBag(start("smith"), gear("war_hammer")));
    expect(equip(smith, 0)).toBeNull();
  });
});

describe("아이템 값과 쓸모", () => {
  /** 파는 물건만 (전리품·재료는 값이 0) */
  const onSale = Object.values(CONTENT.items).filter((d) => d.price > 0);
  const avg = (dice: string) => {
    const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(dice)!;
    return Number(m[1]) * (Number(m[2]) + 1) / 2 + Number(m[3] ?? 0);
  };
  /** a가 b보다 모든 면에서 같거나 낫고 한 가지라도 나으면 true */
  const dominates = (a: number[], b: number[]) => a.every((x, i) => x >= b[i]) && a.some((x, i) => x > b[i]);

  it("값이 같거나 싼데 모든 면에서 같거나 나은 물건이 없다 (무기·방어구·방패·소모품)", () => {
    const score = (d: (typeof onSale)[number]): { group: string; v: number[] } | null => {
      switch (d.category) {
        case "weapon": {
          const req = Object.values(d.requires ?? {}).reduce((s, x) => s + (x ?? 0), 0);
          // 숙련(검·둔기)은 쓰는 사람에 따라 다르므로 비교하지 않는다. 활은 활끼리
          return { group: d.ammo ? "bow" : "melee", v: [avg(d.damage), d.twoHanded ? 0 : 1, d.durabilityMax, -req] };
        }
        case "armor":
        case "shield":
          return { group: d.category, v: [d.defense, d.durabilityMax, "checkPenalty" in d && d.checkPenalty ? d.checkPenalty.value : 0] };
        case "consumable": {
          const sum = (t: string) => d.use.reduce((s, e) => s + (e.type === t && "delta" in e ? e.delta : 0), 0);
          const heal = (to: string) => (d.use.some((e) => e.type === "healWound" && e.to === to) ? 1 : 0);
          const chanceHeal = d.chanceEffects?.reduce((s, c) => s + c.p, 0) ?? 0;
          return { group: "consumable", v: [sum("hp"), -sum("fatigue"), heal("none") + chanceHeal, heal("light"), heal("serious"), d.usableInCombat ? 1 : 0] };
        }
        default: return null;
      }
    };
    const scored = onSale.map((d) => ({ d, s: score(d) })).filter((x) => x.s !== null);
    for (const a of scored) {
      for (const b of scored) {
        if (a === b || a.s!.group !== b.s!.group) continue;
        const cheaperOrSame = a.d.price <= b.d.price;
        expect(cheaperOrSame && dominates(a.s!.v, b.s!.v), `${a.d.name}(${a.d.price})가 ${b.d.name}(${b.d.price})보다 싸거나 같은 값에 모든 면에서 낫다`).toBe(false);
      }
    }
  });

  it("성능이 똑같은 물건은 값도 같다", () => {
    const key = (d: (typeof onSale)[number]) => JSON.stringify({ ...d, id: "", name: "", description: "", price: 0, skill: "" });
    for (const a of onSale) for (const b of onSale) {
      if (a !== b && key(a) === key(b)) expect(a.price, `${a.name}·${b.name}`).toBe(b.price);
    }
  });
});
