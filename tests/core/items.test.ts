import { describe, expect, it } from "vitest";
import type { Ctx } from "@/core/commands";
import { combatStep, finishCombat, playerDefense, startCombat } from "@/core/combat/combat";
import { dispatch } from "@/core/engine";
import { discard, equip, equipBlock, unequip } from "@/core/items/equipment";
import { adjustedPrice, buy, repair, repairPrice, sell, sellPrice, treat } from "@/core/items/shop";
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
    expect(equipBlock(farmer, CONTENT, 0)).toBe("쇠스랑을 든 채로는 방패를 들 수 없다");

    const ctx = ctxOf(withBag(edit(start("smith"), (s) => { s.inventory.equipment.shield = gear("wooden_shield"); }), gear("pitchfork")));
    expect(equip(ctx, 0)).toBeNull();
    expect(ctx.draft.inventory.equipment).toMatchObject({ weapon: { itemId: "pitchfork" }, shield: null });
    expect(ctx.draft.inventory.slots.filter(Boolean).map((x) => x!.itemId).sort()).toEqual(["old_hammer", "wooden_shield"]);
  });

  it("장궁은 근력 1이 있어야 든다", () => {
    expect(equipBlock(withBag(start("hunter"), gear("longbow")), CONTENT, 0)).toBe("근력 1 필요");
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

  it("전투 밖에서 소모품 쓰기: 쓴 약차 → 피로 −2, 싸우는 중에는 막는다", () => {
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
    expect(ctx.draft.resources.silver).toBe(5);
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
    expect(sellPrice(CONTENT.items.rusty_sword)).toBe(7);
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
    expect(treat(ctxOf(edit(run, (s) => { s.player.wound.level = "critical"; })))).toBe("할멈 손으로는 어렵다. 치유 물약이 필요하다");
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
    // 빗나감 → 멧돼지 15 + 3 ≥ 12 명중(피해 1d6+1) → 도주 성공
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
    expect(ctx.feed).toContainEqual({ kind: "text", text: "쇠스랑이 망가졌다. 대장간에서 고쳐야 한다." });

    // 망가진 쇠스랑: 1d6(=6) + 근력 1 − 2 = 5
    const hit = fight(ctx.draft, seq(f20(15), 0.99, f20(2)));
    combatStep(hit, { type: "attack", targetId: "boar_1" });
    expect(hit.draft.combat!.enemies[0].hp).toBe(10 - 5);
  });
});
