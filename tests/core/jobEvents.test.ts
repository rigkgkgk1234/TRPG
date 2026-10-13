import { describe, expect, it } from "vitest";
import type { Ctx } from "@/core/commands";
import { dispatch } from "@/core/engine";
import { evalAll } from "@/core/events/conditions";
import { handleChoice, sceneView } from "@/core/events/runner";
import { countItem } from "@/core/items/inventory";
import { newRun } from "@/core/newRun";
import type { JobId, Rng, RunState } from "@/core/types";
import { CONTENT } from "@/data";

const NOW = "2026-10-14T00:00:00.000Z";
const start = (job: JobId) => {
  const run = newRun(CONTENT, job, "하람", { seed: 1, now: NOW });
  run.time.day = 10;
  run.resources.silver = 20;
  return run;
};
const at = (run: RunState, eventId: string): RunState => ({ ...run, activeEvent: { eventId, sceneId: "start" } });
/** 굴림을 정해 선택지를 고른다: 0.99면 주사위 20(대성공), 0.01이면 1(대실패) */
const choose = (run: RunState, choiceId: string, rng: Rng) => {
  const ctx: Ctx = { draft: structuredClone(run), content: CONTENT, rng, feed: [] };
  const ok = handleChoice(ctx, choiceId);
  return { ok, ctx };
};
const ROLLS: Rng[] = [() => 0.99, () => 0.01];
/** 지금 장면에 보이는 선택지 id */
const choiceIds = (run: RunState): string[] => {
  const view = sceneView(run, CONTENT);
  return view?.kind === "choices" ? view.choices.map((c) => c.id) : [];
};

/** 직업 전용 이벤트 */
const JOB_EVENTS: [string, JobId][] = [
  ["marsh_herbalist_bog_01", "herbalist"],
  ["forest_woodcutter_oak_01", "woodcutter"],
  ["watchtower_recruit_post_01", "recruit"],
  ["npc_lena_father", "soldier_child"],
  ["npc_toby_market_day", "errand"],
  ["npc_toby_peddler_friend", "peddler"],
  ["npc_hamon_chapel", "acolyte"],
];

/** 기존 이벤트에 넣은 직업 전용 선택지 */
const JOB_CHOICES: [string, string, JobId][] = [
  ["marsh_leech_pool_01", "herb_paste", "herbalist"],
  ["npc_magda_rare_herb", "brew_self", "herbalist"],
  ["npc_hamon_watch", "drill", "recruit"],
  ["npc_lena_militia", "train", "recruit"],
  ["npc_lena_sparring", "father_stance", "soldier_child"],
  ["watchtower_soldier_bones_01", "insignia", "soldier_child"],
  ["npc_toby_firewood", "split_grain", "woodcutter"],
  ["npc_hamon_fence", "new_logs", "woodcutter"],
  ["npc_toby_gossip", "rounds", "errand"],
  ["npc_toby_kitchen", "both", "errand"],
  ["npc_brock_old_sword", "haggle", "peddler"],
  ["npc_magda_bundles", "sell_bundles", "peddler"],
  ["npc_magda_checkup", "tend_neighbors", "acolyte"],
  ["watchtower_soldier_bones_01", "pray", "acolyte"],
];

describe("직업 전용 콘텐츠", () => {
  it("전용 이벤트는 그 직업일 때만 나오고, 모든 선택지가 성공·실패 모두 이벤트를 끝낸다", () => {
    for (const [id, job] of JOB_EVENTS) {
      const ev = CONTENT.events[id]!;
      expect(ev, id).toBeDefined();
      expect(evalAll(ev.conditions, start(job)), `${id}: ${job}`).toBe(true);
      expect(evalAll(ev.conditions, start(job === "farmer" ? "smith" : "farmer")), `${id}: 다른 직업`).toBe(false);
      const run = at(start(job), id);
      if (job === "peddler") run.resources.silver = 4;
      for (const c of ev.scenes.start.choices) {
        for (const rng of ROLLS) {
          const { ok, ctx } = choose(run, c.id, rng);
          expect(ok, `${id}/${c.id}`).toBe(true);
          expect(ctx.draft.activeEvent, `${id}/${c.id}가 끝나지 않는다`).toBeNull();
        }
      }
    }
  });

  it("기존 이벤트의 직업 선택지는 그 직업에게만 보이고, 성공·실패 모두 처리된다", () => {
    for (const [id, choiceId, job] of JOB_CHOICES) {
      const mine = at(start(job), id);
      const other = at(start(job === "farmer" ? "smith" : "farmer"), id);
      // 레나의 자경단·보초 순번은 21일 결정(방어) 뒤에만 나오는 이벤트라 그 상태를 만든다
      for (const r of [mine, other]) { r.flags.route_defend = true; r.time.day = 23; r.inventory.slots[8] = { itemId: "rare_herb", qty: 1 }; }
      expect(choiceIds(mine), `${id}/${choiceId}: ${job}`).toContain(choiceId);
      expect(choiceIds(other), `${id}/${choiceId}: 다른 직업`).not.toContain(choiceId);
      for (const rng of ROLLS) expect(choose(mine, choiceId, rng).ok, `${id}/${choiceId}`).toBe(true);
    }
  });

  it("행상의 녹슨 검 흥정: 성공하면 은화 6개에 사고, 실패하면 돈을 돌려받고 다시 흥정할 수 없다", () => {
    const run = at(start("peddler"), "npc_brock_old_sword");
    const won = choose(run, "haggle", () => 0.99).ctx.draft;
    expect(won.resources.silver).toBe(14);
    expect(countItem(won.inventory, "rusty_sword")).toBe(2);

    const lost = choose(run, "haggle", () => 0.01).ctx.draft;
    expect(lost.resources.silver).toBe(20);
    expect(lost.activeEvent?.sceneId).toBe("start");
    expect(choiceIds(lost)).toEqual(["buy", "leave"]);
  });

  it("전용 이벤트가 있어도 무작위 진행이 막히지 않는다 (엔진으로 고르기)", () => {
    // 행상 꾸러미는 은화가 모자라면 잠긴다
    const poor = at(start("peddler"), "npc_toby_peddler_friend");
    poor.resources.silver = 2;
    expect(dispatch(poor, { type: "chooseChoice", choiceId: "deal" }, CONTENT).feed).toEqual([{ kind: "toast", text: "은화 4 필요" }]);
  });
});
