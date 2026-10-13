import { describe, expect, it } from "vitest";
import type { Ctx } from "@/core/commands";
import { buildCheckContext } from "@/core/check/modifiers";
import { gainSkillXp } from "@/core/check/progress";
import { attackSpec, combatStep, startCombat } from "@/core/combat/combat";
import { handleAction } from "@/core/day/actions";
import { runEvening } from "@/core/day/evening";
import { changeReputation } from "@/core/day/resources";
import { consumeItem } from "@/core/items/inventory";
import { entryPrice, healPrice, sellPrice, SHOPS } from "@/core/items/shop";
import { skillXpToNext } from "@/core/jobPerks";
import { newRun } from "@/core/newRun";
import { validateRun } from "@/core/save/validate";
import type { JobId, Rng, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { withoutDailyEvents } from "./fixtures";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (job: JobId, seed = 1) => newRun(CONTENT, job, "하람", { seed, now: NOW });
const ctxOf = (run: RunState, rng: Rng = () => 0.99): Ctx => ({ draft: structuredClone(run), content: CONTENT, rng, feed: [] });
const JOB_IDS = Object.keys(CONTENT.jobs) as JobId[];

describe("직업 열 가지", () => {
  it("모든 직업이 새 회차를 만들고, 저장 검사를 통과한다", () => {
    expect(JOB_IDS).toHaveLength(10);
    for (const job of JOB_IDS) {
      const run = start(job);
      expect(validateRun(run, CONTENT), job).toBeNull();
      expect(run.player.skills.haggle).toBeDefined();
    }
    expect(start("peddler").player.skills.haggle.rank).toBe(2);
  });

  it("약초꾼은 약초로 경상을 늘 고친다 (다른 직업은 50%)", () => {
    const hurt = (job: JobId) => {
      const run = start(job);
      run.player.wound.level = "light";
      if (!run.inventory.slots.some((s) => s?.itemId === "herb")) run.inventory.slots[5] = { itemId: "herb", qty: 1 };
      return run;
    };
    const herbalist = ctxOf(hurt("herbalist"));
    consumeItem(herbalist, "herb", false);
    expect(herbalist.draft.player.wound.level).toBe("none");
    const farmer = ctxOf(hurt("farmer"));
    consumeItem(farmer, "herb", false);
    expect(farmer.draft.player.wound.level).toBe("light");
  });

  it("약초꾼은 늪 탐험 중의 판정 +1", () => {
    const run = start("herbalist");
    const spec = { stat: "per", dc: 10 } as const;
    const inMarsh = { ...run, activeEvent: { eventId: "x", sceneId: "start", explore: { region: "marsh" as const, cardsDrawn: 1, deep: false } } };
    expect(buildCheckContext(inMarsh, spec, CONTENT).modifiers).toContainEqual({ label: "늪 지리", value: 1 });
    expect(buildCheckContext(run, spec, CONTENT).modifiers.some((m) => m.label === "늪 지리")).toBe(false);
  });

  it("경비대 신병의 방어 자세는 +1 더 단단하다", () => {
    const ctx = ctxOf(start("recruit"), () => 0.5);
    startCombat(ctx, { enemies: ["wolf"], initiative: "player", canFlee: true, onVictory: "win", onFled: "fled" });
    combatStep(ctx, { type: "defend" });
    // 기본 2 + 방어 2레벨 + 신병 1
    expect(ctx.feed.some((f) => f.kind === "text" && f.text.includes("방어도 +5"))).toBe(true);
  });

  it("옛 병사의 자식은 숙련이 50% 빨리 오른다 (필요 XP 3 → 2)", () => {
    const grow = (job: JobId) => {
      const ctx = ctxOf(start(job));
      gainSkillXp(ctx, "blade", 2);
      return ctx.draft.player.skills.blade.rank;
    };
    expect(start("soldier_child").player.skills.blade.rank).toBe(0);
    expect(grow("soldier_child")).toBe(1);
    expect(grow("farmer")).toBe(0);
    expect([0, 1, 2, 3, 4].map((r) => skillXpToNext("soldier_child", r))).toEqual([2, 4, 7, 10, 14]);
  });

  it("강타 명중 불리 보정은 모든 직업이 −2", () => {
    const enemy = { instanceId: "wolf_1", defId: "wolf", hp: 10, maxHp: 10 } as never;
    expect(attackSpec(start("soldier_child"), CONTENT, enemy, true).situational).toBe(-2);
  });

  it("나무꾼은 숲 탐험이 덜 지친다", () => {
    const content = withoutDailyEvents(CONTENT);
    const explore = (job: JobId) => {
      const ctx: Ctx = { draft: start(job), content, rng: () => 0.5, feed: [] };
      handleAction(ctx, "explore", { region: "forest" });
      return ctx.draft.resources.fatigue;
    };
    expect(explore("farmer") - explore("woodcutter")).toBe(1);
  });

  it("여관 심부름꾼은 평판이 더 오르고 여관 물건이 반값", () => {
    const errand = ctxOf(start("errand"));
    changeReputation(errand, 2);
    // 2 + 말솜씨 2 보너스 1 + 심부름꾼 1
    expect(errand.draft.player.reputation).toBe(14);
    const stew = SHOPS.inn.stock.find((e) => e.itemId === "hot_stew")!;
    expect(entryPrice(start("errand"), CONTENT, stew, "inn")).toBe(2);
    expect(entryPrice(start("farmer"), CONTENT, stew, "inn")).toBe(3);
  });

  it("떠돌이 행상은 대장간·약초방에서 20% 싸게 산다 (올림, 여관은 그대로)", () => {
    // 평판 보정을 빼고 비교하려고 평판을 같게 맞춘다
    const at10 = (job: JobId) => {
      const run = start(job);
      run.player.reputation = 10;
      return run;
    };
    const entry = (shop: "smithy" | "healer" | "inn", itemId: string) => SHOPS[shop].stock.find((e) => e.itemId === itemId)!;
    expect(entryPrice(at10("peddler"), CONTENT, entry("smithy", "rusty_sword"), "smithy")).toBe(8);
    expect(entryPrice(at10("farmer"), CONTENT, entry("smithy", "rusty_sword"), "smithy")).toBe(10);
    expect(entryPrice(at10("peddler"), CONTENT, entry("inn", "hot_stew"), "inn")).toBe(3);
    expect(healPrice(at10("peddler"), 10)).toBe(8);
    // 파는 값은 그대로
    expect(sellPrice(CONTENT.items.rusty_sword)).toBe(5);
  });

  it("수도원 견습은 밤에 피로가 1 더 풀린다", () => {
    const sleep = (job: JobId) => {
      const run = start(job);
      run.time.phase = "evening";
      run.resources.fatigue = 6;
      run.resources.food = 10;
      const ctx = ctxOf(run);
      runEvening(ctx);
      return ctx.draft.resources.fatigue;
    };
    expect(sleep("farmer") - sleep("acolyte")).toBe(1);
  });
});
