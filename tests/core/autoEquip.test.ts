import { describe, expect, it } from "vitest";
import { autoEquipSlot } from "@/core/items/equipment";
import { newRun } from "@/core/newRun";
import type { RunState } from "@/core/types";
import { CONTENT } from "@/data";

const NOW = "2026-10-15T00:00:00.000Z";
const held = (weapon: string | null, offHand: string | null): RunState => {
  const run = newRun(CONTENT, "farmer", "보리", { seed: 1, now: NOW });
  return {
    ...run,
    inventory: {
      ...run.inventory,
      equipment: { ...run.inventory.equipment, weapon: weapon ? { itemId: weapon, qty: 1, durability: 20 } : null, offHand: offHand ? { itemId: offHand, qty: 1, durability: 20 } : null },
    },
  };
};
const slot = (run: RunState, id: string) => autoEquipSlot(run, CONTENT, CONTENT.items[id]);

describe("가방에서 장착할 손", () => {
  it("한 손 무기: 오른손이 비었으면 오른손, 오른손에 한 손 무기가 있으면 왼손", () => {
    expect(slot(held(null, null), "club")).toBe("weapon");
    expect(slot(held("rusty_sword", null), "club")).toBe("offHand");
  });

  it("두 손이 다 찼으면 어느 손인지 묻는다", () => {
    expect(slot(held("rusty_sword", "club"), "hand_axe")).toBe("ask");
    expect(slot(held("rusty_sword", "wooden_shield"), "hand_axe")).toBe("ask");
  });

  it("양손 무기를 들고 있거나 양손 무기·방패를 장착하면 정해진 칸", () => {
    expect(slot(held("pitchfork", null), "club")).toBe("weapon");
    expect(slot(held("rusty_sword", "club"), "pitchfork")).toBe("weapon");
    expect(slot(held("rusty_sword", null), "wooden_shield")).toBe("offHand");
  });
});
