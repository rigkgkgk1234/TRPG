import { describe, expect, it } from "vitest";
import type { Ctx } from "@/core/commands";
import { startCombat } from "@/core/combat/combat";
import { runEvening } from "@/core/day/evening";
import { dispatch } from "@/core/engine";
import { handleChoice, sceneView } from "@/core/events/runner";
import { newRun } from "@/core/newRun";
import { addRecord, emptyMeta, loadMeta, saveMeta } from "@/core/save/meta";
import type { KeyValueStore } from "@/core/save/serialize";
import { epitaph, makeRecord, resolveEnding } from "@/core/story/ending";
import { SAVE_KEYS, type JobId, type Rng, type RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { d20Sequence, withoutDailyEvents } from "./fixtures";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (job: JobId = "farmer", seed = 1) => newRun(CONTENT, job, "하람", { seed, now: NOW });
function edit(run: RunState, fn: (s: RunState) => void): RunState {
  const copy = structuredClone(run);
  fn(copy);
  return copy;
}
const ctxOf = (run: RunState, rng: Rng = () => 0.5): Ctx => ({ draft: structuredClone(run), content: CONTENT, rng, feed: [] });
const send = (run: RunState, cmd: Parameters<typeof dispatch>[1]) => dispatch(run, cmd, CONTENT).state;
const texts = (feed: Ctx["feed"]) => feed.flatMap((f) => (f.kind === "text" ? [f.text] : []));

describe("스토리 발생", () => {
  it("때가 되면 행동을 고르기 전에 스토리가 끼어든다 (3일차 사라진 양)", () => {
    const day3 = edit(start(), (s) => { s.time.day = 3; });
    const run = send(day3, { type: "chooseAction", action: "rest" });
    expect(run.time.phase).toBe("pm");
    expect(run.activeEvent?.eventId).toBe("story_missing_sheep");
    // 한 번 본 스토리는 다시 나오지 않는다
    const after = send(send(run, { type: "chooseChoice", choiceId: "sorry" }), { type: "chooseAction", action: "rest" });
    expect(after.activeEvent).toBeNull();
  });

  it("거절된 명령 뒤에는 끼어들지 않는다", () => {
    const day3 = edit(start(), (s) => { s.time.day = 3; });
    const res = dispatch(day3, { type: "chooseAction", action: "village" }, CONTENT);
    expect(res.state).toBe(day3);
  });

  it("여럿이 조건을 만족하면 priority가 높은 것부터 (21일차 회의가 모집관보다 먼저)", () => {
    const day21 = edit(start(), (s) => {
      s.time.day = 21;
      for (const id of ["story_missing_sheep", "story_recruiter_return"]) s.eventHistory[id] = { count: 1, lastDay: 3 };
    });
    expect(send(day21, { type: "chooseAction", action: "rest" }).activeEvent?.eventId).toBe("story_decision");
  });

  it("지역 스토리는 그 지역 탐험의 카드보다 먼저 나온다", () => {
    const run = edit(start(), (s) => { s.time.day = 4; s.flags.sheep_quest = true; s.eventHistory.story_missing_sheep = { count: 1, lastDay: 3 }; });
    const explored = send(run, { type: "chooseAction", action: "explore", region: "forest" });
    expect(explored.activeEvent).toMatchObject({ eventId: "story_sheep_remains", explore: { cardsDrawn: 1 } });
  });

  it("가족 굶주림 3이면 다음 날 「동생이 앓아눕다」", () => {
    const ctx = { ...ctxOf(edit(start(), (s) => { s.time.phase = "evening"; s.resources.food = 0; s.resources.familyHunger = 2; }), d20Sequence()), content: withoutDailyEvents(CONTENT) };
    runEvening(ctx, "selfFirst");
    expect(ctx.draft.flags.sister_sick).toBe(true);
    const next = send(ctx.draft, { type: "chooseAction", action: "rest" });
    expect(next.activeEvent?.eventId).toBe("story_sister_sick");
  });
});

describe("최종 습격", () => {
  const raidNight = (fn: (s: RunState) => void = () => {}) =>
    edit(start(), (s) => { s.time.day = 30; s.time.phase = "evening"; s.resources.food = 2; fn(s); });

  it("30일차 저녁: 정산 뒤 습격 → 숨으면 살아남은 자", () => {
    let run = send(raidNight(), { type: "endDay" });
    expect(run.activeEvent?.eventId).toBe("story_raid");
    const view = sceneView(run, CONTENT);
    expect(view?.kind === "choices" && view.choices.map((c) => c.id)).toEqual(["fight", "hide"]);
    run = send(run, { type: "chooseChoice", choiceId: "hide" });
    expect(run.ending).toBe("survivor");
    expect(run.activeEvent).toBeNull();
  });

  it("피난을 준비했고 평판 40이면 이웃과 함께 떠나다, 평판이 모자라면 살아남은 자", () => {
    const ready = raidNight((s) => { s.flags.flee_organized = true; s.player.reputation = 40; });
    let run = send(send(ready, { type: "endDay" }), { type: "chooseChoice", choiceId: "flee" });
    expect(run.ending).toBe("flee_together");
    run = send(send(edit(ready, (s) => { s.player.reputation = 39; }), { type: "endDay" }), { type: "chooseChoice", choiceId: "flee" });
    expect(run.ending).toBe("survivor");
  });

  it("마을의 준비가 약탈단 두목 전투에 보태진다: 자경단·나무 울타리·작전 정보", () => {
    const ctx = ctxOf(edit(start(), (s) => {
      s.player.reputation = 65;
      s.flags.palisade_built = true;
      s.flags.goblin_plan_known = true;
    }));
    startCombat(ctx, { enemies: ["raid_leader"], initiative: "enemy", canFlee: false, onVictory: "won", onDefeat: "lost" });
    const c = ctx.draft.combat!;
    expect(c.enemies[0].hp).toBe(18 - 3 * 3);
    expect(c.setup).toMatchObject({ playerDefenseBonus: 2, initiative: "player", firstAttackAdvantage: true });
    expect(c.phase).toBe("playerTurn");
    expect(texts(ctx.feed)[0]).toBe("마을 사람 3명이 함께 버티며 약탈단 두목을 몰아붙였다. (약탈단 두목 HP −9)");
  });

  it("약탈단 두목에게 져도 죽지 않고 습격은 실패로 끝난다", () => {
    let run = send(raidNight(), { type: "endDay" });
    run = send(run, { type: "chooseChoice", choiceId: "fight" });
    run = edit(run, (s) => { s.player.hp = 1; s.combat!.enemies[0].hp = 99; });
    for (let i = 0; i < 100 && run.combat; i++) run = send(run, { type: "combat", action: { type: "defend" } });
    expect(run.ending).toBe("survivor");
    expect(run.flags.raid_lost).toBe(true);
    expect(run.player.hp).toBe(1);
  });
});

describe("엔딩 판정", () => {
  it("표의 위에서부터: 사망 → 빚 → 로웬 → 방패 → 피난 → 살아남은 자", () => {
    const base = start();
    expect(resolveEnding(edit(base, (s) => { s.player.hp = 0; }))).toBe("death");
    expect(resolveEnding(edit(base, (s) => { s.resources.debt = 20; }))).toBe("debtor");
    expect(resolveEnding(edit(base, (s) => { s.flags.route_rowen = true; s.flags.recruit_passed = true; }))).toBe("rowen_spearman");
    expect(resolveEnding(edit(base, (s) => { s.flags.raid_won = true; s.player.reputation = 60; }))).toBe("shield_of_village");
    expect(resolveEnding(edit(base, (s) => { s.flags.raid_won = true; s.player.reputation = 59; }))).toBe("survivor");
    expect(resolveEnding(base)).toBe("survivor");
  });

  it("로웬으로 떠나면 로웬의 창병", () => {
    const run = edit(start(), (s) => { s.time.day = 27; s.flags.route_rowen = true; s.flags.recruit_passed = true; });
    let next = send(run, { type: "chooseAction", action: "rest" });
    expect(next.activeEvent?.eventId).toBe("story_rowen_departure");
    next = send(next, { type: "chooseChoice", choiceId: "go" });
    expect(next.ending).toBe("rowen_spearman");
  });
});

describe("기록", () => {
  it("싸우다 죽으면 상대와 장소로 묘비문", () => {
    const before = edit(start(), (s) => {
      s.time.day = 12;
      s.activeEvent = { eventId: "forest_wolf_01", sceneId: "fight", explore: { region: "forest", cardsDrawn: 1, deep: false } };
      s.combat = { setup: { enemies: ["wolf"], initiative: "roll", canFlee: true, onVictory: "win" }, enemies: [{ instanceId: "wolf_1", defId: "wolf", hp: 3, maxHp: 6, routed: false }],
        round: 2, phase: "playerTurn", defendBonus: 0, defensePenalty: 0, enemyAdvantageThisRound: false, arrowsFired: 0, lowHpWoundApplied: true, xpThisCombat: {}, log: [] };
    });
    const dead = edit(before, (s) => { s.ending = "death"; s.player.hp = 0; s.combat = null; s.activeEvent = null; });
    const r = makeRecord(dead, CONTENT, NOW, before);
    expect(r.death).toEqual({ cause: "늑대", region: "forest", day: 12 });
    expect(epitaph(r, "하람")).toBe("하람, 12일차, 개암나무 숲에서 늑대에게 쓰러지다");
  });

  it("기록 더하기: 본 엔딩·흔적 모으기, 포기는 엔딩에 안 넣음, 같은 회차는 한 번만", () => {
    const run = edit(start(), (s) => { s.ending = "survivor"; s.player.traits = ["survivor"]; });
    let meta = addRecord(emptyMeta(), makeRecord(run, CONTENT, NOW));
    meta = addRecord(meta, makeRecord(run, CONTENT, NOW));
    expect(meta).toMatchObject({ endingsSeen: ["survivor"], traitsSeen: ["survivor"], totalRuns: 1 });
    meta = addRecord(meta, makeRecord(start("hunter", 2), CONTENT, NOW, undefined, true));
    expect(meta.endingsSeen).toEqual(["survivor"]);
    expect(meta.history[0].ending).toBe("abandoned");
    expect(meta.totalRuns).toBe(2);
  });

  it("기록 저장·불러오기, 깨졌으면 빈 기록", async () => {
    const data = new Map<string, string>();
    const kv: KeyValueStore = { getItem: async (k) => data.get(k) ?? null, setItem: async (k, v) => { data.set(k, v); }, removeItem: async (k) => { data.delete(k); } };
    const meta = addRecord(emptyMeta(), makeRecord(edit(start(), (s) => { s.ending = "debtor"; }), CONTENT, NOW));
    await saveMeta(kv, meta);
    expect(await loadMeta(kv)).toEqual(meta);
    // 봉인이라 글자로 찾아 고칠 수 없다. 한 글자라도 바뀌면 빈 기록
    const sealed = data.get(SAVE_KEYS.meta)!;
    expect(sealed).not.toContain("debtor");
    data.set(SAVE_KEYS.meta, sealed.slice(0, 30) + (sealed[30] === "A" ? "B" : "A") + sealed.slice(31));
    expect(await loadMeta(kv)).toEqual(emptyMeta());
    // 기록에 없는 엔딩을 본 것처럼 꾸민 기록도 버린다
    await saveMeta(kv, { ...meta, endingsSeen: ["debtor", "hero_party"] });
    expect(await loadMeta(kv)).toEqual(emptyMeta());
  });
});

describe("용사 일행", () => {
  /** 9일차 오전: 행동 하나를 하면 용사 일행이 끼어든다 */
  const arrive = (job: JobId) => {
    const day9 = edit(start(job), (s) => { s.time.day = 9; s.eventHistory.story_missing_sheep = { count: 1, lastDay: 3 }; });
    return send(day9, { type: "chooseAction", action: "rest" });
  };
  const choiceIds = (run: RunState) => {
    const v = sceneView(run, CONTENT);
    return v?.kind === "choices" ? v.choices.map((c) => c.id) : [];
  };

  it("9일차에 찾아오고, 직업마다 할 수 있는 일이 다르다", () => {
    const farmer = arrive("farmer");
    expect(farmer.activeEvent?.eventId).toBe("story_heroes_arrive");
    expect(farmer.flags.heroes_met).toBe(true);
    expect(choiceIds(farmer)).toEqual(["sell_food", "talk", "watch"]);
    expect(choiceIds(arrive("smith"))).toEqual(["repair", "talk", "watch"]);
    expect(choiceIds(arrive("hunter"))).toEqual(["escort", "talk", "watch"]);

    const sold = send(farmer, { type: "chooseChoice", choiceId: "sell_food" });
    expect(sold.resources).toMatchObject({ food: 6, silver: 16 }); // 식구 몫이 아니라 밭의 곡식을 판다
    expect(sold.flags.heroes_helped).toBe(true);
    expect(send(sold, { type: "continue" }).activeEvent).toBeNull();
  });

  it("돌아온 일행의 시험은 무기 숙련 3이 있어야 보고, 붙으면 합류를 제안받는다", () => {
    const back = edit(start("hunter"), (s) => {
      s.time.day = 19;
      s.flags.heroes_met = true;
      s.flags.route_rowen = true;
      s.activeEvent = { eventId: "story_heroes_return", sceneId: "ask" };
    });
    const locked = sceneView(back, CONTENT);
    expect(locked?.kind === "choices" && locked.choices.find((c) => c.id === "bow")?.lockedReason).toBe("활 3 필요 (일행을 도왔다면 2)");

    const skilled = edit(back, (s) => { s.player.skills.bow.rank = 3; });
    const ctx = ctxOf(skilled, d20Sequence(15)); // 15 + 민첩 2 + 활 3 = 20 ≥ 13
    handleChoice(ctx, "bow");
    expect(ctx.draft.activeEvent?.sceneId).toBe("offer");
    handleChoice(ctx, "accept");
    expect(ctx.draft.flags).toMatchObject({ route_hero: true, route_rowen: false });
  });

  it("9일차에 일행을 도왔으면 무기 숙련 2로도 시험을 볼 수 있다", () => {
    const back = edit(start("farmer"), (s) => {
      s.time.day = 19;
      s.flags.heroes_met = true;
      s.player.skills.blunt.rank = 2;
      s.activeEvent = { eventId: "story_heroes_return", sceneId: "ask" };
    });
    const blunt = (run: typeof back) => {
      const v = sceneView(run, CONTENT);
      return v?.kind === "choices" ? v.choices.find((c) => c.id === "blunt") : undefined;
    };
    expect(blunt(back)?.lockedReason).toBe("둔기 3 필요 (일행을 도왔다면 2)");
    expect(blunt(edit(back, (s) => { s.flags.heroes_helped = true; }))?.lockedReason).toBeNull();
    expect(blunt(edit(back, (s) => { s.flags.heroes_helped = true; s.player.skills.blunt.rank = 1; }))?.lockedReason).not.toBeNull();
  });

  it("9일차에 곡식을 판 농부는 고드윈에게 둔기를 배운다", () => {
    const run = edit(start("farmer"), (s) => { s.activeEvent = { eventId: "story_heroes_arrive", sceneId: "start" }; });
    const ctx = ctxOf(run);
    handleChoice(ctx, "sell_food");
    expect(ctx.draft.player.skills.blunt).toEqual({ rank: 1, xp: 0 }); // 경험 3 = 0등급 → 1등급
    expect(ctx.draft.flags.heroes_helped).toBe(true);
  });

  it("26일차에 따라나서면 「용사 일행」, 남으면 방어에 힘을 보탠다", () => {
    const ready = edit(start(), (s) => { s.time.day = 26; s.flags.route_hero = true; });
    const departing = send(ready, { type: "chooseAction", action: "rest" });
    expect(departing.activeEvent?.eventId).toBe("story_heroes_departure");
    expect(send(departing, { type: "chooseChoice", choiceId: "go" }).ending).toBe("hero_party");
    const stayed = send(departing, { type: "chooseChoice", choiceId: "stay" });
    expect(stayed.ending).toBeNull();
    expect(stayed.flags).toMatchObject({ route_hero: false, route_defend: true });
  });

  it("용사 일행에 합류했으면 로웬보다 먼저 판정한다", () => {
    const both = edit(start(), (s) => { s.flags.route_hero = true; s.flags.route_rowen = true; s.flags.recruit_passed = true; });
    expect(resolveEnding(both)).toBe("hero_party");
  });
});
