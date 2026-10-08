import { describe, expect, it } from "vitest";
import type { Ctx } from "@/core/commands";
import type { ContentDB } from "@/core/content";
import { attackSpec, combatStep, combatView, finishCombat, playerDefense, startCombat } from "@/core/combat/combat";
import { parseDice, rollDice } from "@/core/combat/dice";
import { runEvening } from "@/core/day/evening";
import { dispatch } from "@/core/engine";
import { handleCombat } from "@/core/events/runner";
import { consumeItem } from "@/core/items/inventory";
import { newRun } from "@/core/newRun";
import type { CombatSetup, EnemyId, EventDef, JobId, Rng, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { d20Sequence, withoutDailyEvents } from "./fixtures";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (job: JobId = "farmer", seed = 1) => newRun(CONTENT, job, "하람", { seed, now: NOW });

function edit(run: RunState, fn: (s: RunState) => void): RunState {
  const copy = structuredClone(run);
  fn(copy);
  return copy;
}

/** 원하는 0~1 값을 순서대로 내놓는 RNG (D20이 아닌 굴림까지 정할 때) */
function seq(...xs: number[]): Rng {
  let i = 0;
  return () => {
    if (i >= xs.length) throw new Error("seq: 준비한 값이 바닥났습니다");
    return xs[i++];
  };
}
/** D20 눈 → rng 값 */
const f20 = (face: number) => (face - 1) / 20 + 0.001;
/** dN 눈 → rng 값 */
const fd = (face: number, sides: number) => (face - 1) / sides + 0.001;

function setup(enemies: EnemyId[], extra: Partial<CombatSetup> = {}): CombatSetup {
  return { enemies, initiative: "player", canFlee: true, onVictory: "win", onFled: "fled", ...extra };
}

function ctxOf(run: RunState, rng: Rng, content: ContentDB = CONTENT): Ctx {
  return { draft: structuredClone(run), content, rng, feed: [] };
}

function inCombat(run: RunState, enemies: EnemyId[], extra: Partial<CombatSetup> = {}): RunState {
  const ctx = ctxOf(run, () => 0.5);
  startCombat(ctx, setup(enemies, extra));
  return ctx.draft;
}

const texts = (ctx: Ctx) => ctx.feed.filter((f) => f.kind === "text").map((f) => (f as { text: string }).text);

describe("주사위 표기", () => {
  it("1d6+1 해석, 대성공은 주사위 개수만 2배", () => {
    expect(parseDice("1d6+1")).toEqual({ count: 1, sides: 6, mod: 1 });
    expect(parseDice("2d4-1")).toEqual({ count: 2, sides: 4, mod: -1 });
    expect(rollDice("1d6+1", seq(fd(6, 6)))).toBe(7);
    expect(rollDice("1d6+1", seq(fd(6, 6), fd(3, 6)), true)).toBe(10);
  });
});

describe("전투 수치", () => {
  it("방어도 = 10 + 민첩 + 방어구 (+ 방어 자세)", () => {
    const hunter = start("hunter");
    expect(playerDefense(hunter, CONTENT, null)).toBe(12);
    const armored = edit(hunter, (s) => { s.inventory.equipment.armor = { itemId: "leather_armor", qty: 1, durability: 25 }; });
    expect(playerDefense(armored, CONTENT, null)).toBe(14);
  });

  it("공격 판정: 근접은 근력, 활은 민첩 + 무기 숙련 vs 적 방어도, 강타는 −2", () => {
    const farmer = inCombat(start("farmer"), ["wolf"]);
    const target = farmer.combat!.enemies[0];
    expect(attackSpec(farmer, CONTENT, target, false)).toMatchObject({ stat: "str", skill: "blunt", dc: 11, tags: ["beast"] });
    expect(attackSpec(farmer, CONTENT, target, true).situational).toBe(-2);
    const hunter = inCombat(start("hunter"), ["wolf"]);
    expect(attackSpec(hunter, CONTENT, hunter.combat!.enemies[0], false)).toMatchObject({ stat: "agi", skill: "bow" });
  });

  it("시작 사냥꾼의 늑대 공격 확률 70%, 농부 도주 35% (SYSTEM_SPEC 2-5, 3-4)", () => {
    const hunter = combatView(inCombat(start("hunter"), ["wolf"]), CONTENT)!;
    expect(hunter.actions.find((a) => a.type === "attack")!.chance).toBeCloseTo(0.7);
    const farmer = combatView(inCombat(start("farmer"), ["wolf"]), CONTENT)!;
    expect(farmer.actions.find((a) => a.type === "flee")!.chance).toBeCloseTo(0.35);
  });

  it("화살이 떨어지면 맨주먹으로 싸우고, 도주 불가 전투는 사유를 보여 준다", () => {
    const noArrows = edit(start("hunter"), (s) => { s.inventory.slots = s.inventory.slots.map((x) => (x?.itemId === "arrow" ? null : x)); });
    const run = inCombat(noArrows, ["wolf"], { canFlee: false, noFleeReason: "등 뒤에 가족이 있다" });
    const v = combatView(run, CONTENT)!;
    const attack = v.actions.find((a) => a.type === "attack")!;
    expect(attack).toMatchObject({ label: "공격", lockedReason: null });
    expect(attack.detail).toEqual(["피해 1d2", "화살이 없어 맨주먹"]);
    expect(attackSpec(run, CONTENT, run.combat!.enemies[0], false)).toMatchObject({ stat: "str", skill: "blunt" });
    expect(v.actions.find((a) => a.type === "flee")!.lockedReason).toBe("등 뒤에 가족이 있다");
  });
});

describe("전투 진행", () => {
  it("선공 굴림: D20 + 민첩 ≥ 10 + 적 최고 속도면 내가 먼저", () => {
    const first = ctxOf(start("hunter"), seq(f20(12)));
    startCombat(first, setup(["wolf"], { initiative: "roll" }));
    expect(first.draft.combat!.phase).toBe("playerTurn");
    expect(texts(first)[0]).toBe("늑대가 덤비기 전에 먼저 움직였다.");

    // 2 + 2 < 14 → 늑대 먼저: 늑대 굴림 10 + 3 = 13 ≥ 방어도 12, 피해 4 (사냥꾼 HP 20)
    const late = ctxOf(start("hunter"), seq(f20(2), f20(10), fd(4, 6)));
    startCombat(late, setup(["wolf"], { initiative: "roll" }));
    expect(texts(late)).toEqual(["늑대가 먼저 덮쳐 왔다!", "늑대가 달려들어 팔을 물었다. 피해 4."]);
    expect(late.draft.player.hp).toBe(16);
    expect(late.draft.combat).toMatchObject({ round: 2, phase: "playerTurn" });
  });

  it("공격 명중 → 피해 = 무기 주사위 + 근력, 쓰러뜨리면 승리", () => {
    // 농부: 근력 1 + 둔기 0, 15 + 1 = 16 ≥ 11, 쇠갈퀴 1d6 → 5 + 1 = 6 → 남은 HP 6인 늑대가 쓰러진다
    const ctx = ctxOf(edit(inCombat(start("farmer"), ["wolf"]), (s) => { s.combat!.enemies[0].hp = 6; }), seq(f20(15), fd(5, 6)));
    expect(combatStep(ctx, { type: "attack", targetId: "wolf_1" })).toBeNull();
    expect(ctx.draft.combat!.result).toBe("victory");
    expect(texts(ctx)).toEqual(["늑대에게 일격을 먹였다. 피해 6.", "늑대가 쓰러졌다."]);
  });

  it("강타는 피로 +1, 맞히면 피해 +3", () => {
    // 멧돼지 HP 18 → 13 (절반 9보다 많아 사기 굴림 없음)
    const ctx = ctxOf(inCombat(start("farmer"), ["boar"]), seq(f20(18), fd(1, 6), f20(1)));
    combatStep(ctx, { type: "powerAttack", targetId: "boar_1" });
    expect(ctx.draft.combat!.enemies[0].hp).toBe(18 - (1 + 1 + 3));
    expect(ctx.draft.resources.fatigue).toBe(1);
  });

  it("대성공은 피해 주사위 2배, 근접 대실패는 그 라운드 방어도 −2", () => {
    const crit = ctxOf(inCombat(start("farmer"), ["boar"]), seq(f20(20), fd(3, 6), fd(4, 6), f20(1)));
    combatStep(crit, { type: "attack", targetId: "boar_1" });
    expect(crit.draft.combat!.enemies[0].hp).toBe(18 - (3 + 4 + 1));

    // 대실패 뒤 멧돼지 굴림 7 + 3 = 10: 평소 방어도 10이면 맞지만, −2라 8 → 역시 명중. 6 + 3 = 9는 −2일 때만 명중
    const fumble = ctxOf(inCombat(start("farmer"), ["boar"]), seq(f20(1), f20(6), fd(2, 6)));
    combatStep(fumble, { type: "attack", targetId: "boar_1" });
    expect(texts(fumble)).toContain("중심을 잃고 비틀거렸다. (이번 라운드 방어도 −2)");
    expect(fumble.draft.player.hp).toBe(24 - 2);
    expect(fumble.draft.combat!.defensePenalty).toBe(0); // 라운드가 끝나면 풀린다
  });

  it("방어 자세: 방어도 +2 + 방어 숙련, 막아 내면 방어 경험 +1", () => {
    // 농부 방어도 10 + 2 = 12, 늑대 8 + 3 = 11 → 막음
    const ctx = ctxOf(inCombat(start("farmer"), ["wolf"]), seq(f20(8)));
    combatStep(ctx, { type: "defend" });
    expect(texts(ctx)).toEqual(["몸을 낮추고 방어 자세를 잡았다. (방어도 +2)", "늑대의 공격을 막아 냈다."]);
    expect(ctx.draft.player.skills.guard.xp).toBe(1);
  });

  it("도주 성공은 전투 끝, 실패하면 그 라운드 적이 유리함", () => {
    const ok = ctxOf(inCombat(start("hunter"), ["wolf"]), seq(f20(15)));
    combatStep(ok, { type: "flee" });
    expect(ok.draft.combat!.result).toBe("fled");

    // 실패 → 늑대 주사위 2개 중 높은 것(3, 17) → 17 + 3 = 20 명중
    const fail = ctxOf(inCombat(start("hunter"), ["wolf"]), seq(f20(2), f20(3), f20(17), fd(2, 6)));
    combatStep(fail, { type: "flee" });
    expect(fail.draft.player.hp).toBe(20 - 2);
  });

  it("적의 대성공: 피해 2배 + 부상 한 단계", () => {
    const ctx = ctxOf(inCombat(start("farmer"), ["wolf"]), seq(f20(2), f20(20), fd(2, 6)));
    combatStep(ctx, { type: "attack", targetId: "wolf_1" });
    expect(ctx.draft.player.hp).toBe(24 - 4);
    expect(ctx.draft.player.wound.level).toBe("light");
  });

  it("HP가 처음 1/3 이하가 되면 부상 한 단계, 한 번 맞아 두 조건이 겹쳐도 한 단계", () => {
    const low = ctxOf(inCombat(edit(start("farmer"), (s) => { s.player.hp = 6; }), ["wolf"]), seq(f20(2), f20(15), fd(3, 6)));
    combatStep(low, { type: "attack", targetId: "wolf_1" });
    expect(low.draft.player.hp).toBe(3);
    expect(low.draft.player.wound.level).toBe("light");
    expect(texts(low)).toContain("피를 너무 많이 흘렸다.");

    const both = ctxOf(inCombat(edit(start("farmer"), (s) => { s.player.hp = 8; }), ["wolf"]), seq(f20(2), f20(20), fd(3, 6)));
    combatStep(both, { type: "attack", targetId: "wolf_1" });
    expect(both.draft.player.hp).toBe(2);
    expect(both.draft.player.wound.level).toBe("light");
  });

  it("사기: HP 절반 이하인 적은 라운드 끝에 확률로 달아나고, 모두 없어지면 승리", () => {
    // 남은 HP 9인 늑대(최대 12)에 쇠갈퀴 2 + 1 = 3 → 6 (절반), 늑대 빗나감, 사기 굴림 0.1 < 0.5 → 달아남
    const ctx = ctxOf(edit(inCombat(start("farmer"), ["wolf"]), (s) => { s.combat!.enemies[0].hp = 9; }), seq(f20(15), fd(2, 6), f20(2), 0.1));
    combatStep(ctx, { type: "attack", targetId: "wolf_1" });
    expect(ctx.draft.combat!.result).toBe("victory");
    expect(texts(ctx)).toContain("늑대가 겁을 먹고 달아났다.");
  });

  it("고블린 정찰병이 달아나면 플래그", () => {
    const ctx = ctxOf(edit(inCombat(start("smith"), ["goblin_scout"]), (s) => { s.combat!.enemies[0].hp = 6; }), seq(f20(15), fd(1, 6), f20(2), 0.1));
    combatStep(ctx, { type: "attack", targetId: "goblin_scout_1" });
    expect(ctx.draft.flags.goblin_alerted).toBe(true);
  });

  it("여러 적: 공격 대상을 고르고, 쓰러진 적은 고를 수 없다", () => {
    const run = inCombat(start("farmer"), ["wolf", "wolf"]);
    const v = combatView(run, CONTENT, "wolf_2")!;
    expect(v.targetId).toBe("wolf_2");
    const down = edit(run, (s) => { s.combat!.enemies[0].hp = 0; });
    expect(combatStep(ctxOf(down, seq()), { type: "attack", targetId: "wolf_1" })).toBe("그 상대는 이미 싸울 수 없다");
  });

  it("한 전투에서 같은 숙련 경험은 4까지", () => {
    let run = inCombat(start("farmer"), ["boar"]);
    run = edit(run, (s) => { s.combat!.enemies[0].hp = 99; });
    // 빗나감(경험 2) → 빗나감(경험 2) → 빗나감(0). 멧돼지는 매번 빗나감
    const ctx = ctxOf(run, seq(f20(3), f20(2), f20(3), f20(2), f20(3), f20(2)));
    for (let i = 0; i < 3; i++) combatStep(ctx, { type: "attack", targetId: "boar_1" });
    expect(ctx.draft.combat!.xpThisCombat.blunt).toBe(4);
  });

  it("결투(knockout)는 숙련 경험이 쌓이지 않는다", () => {
    let run = inCombat(start("farmer"), ["boar"], { knockout: true });
    run = edit(run, (s) => { s.combat!.enemies[0].hp = 99; });
    const ctx = ctxOf(run, seq(f20(3), f20(2), f20(3), f20(2)));
    for (let i = 0; i < 2; i++) combatStep(ctx, { type: "attack", targetId: "boar_1" });
    expect(ctx.draft.combat!.xpThisCombat.blunt).toBeUndefined();
    expect(ctx.draft.player.skills.blunt).toEqual(run.player.skills.blunt);
  });
});

describe("전투 끝", () => {
  it("이기면 공격에 쓴 무기 숙련 경험 +1 (방어 숙련은 아니다)", () => {
    const run = edit(inCombat(start("farmer"), ["boar"]), (s) => {
      s.combat!.result = "victory";
      s.combat!.xpThisCombat = { blunt: 2, guard: 3 };
    });
    const ctx = ctxOf(run, seq(0.9));
    finishCombat(ctx);
    expect(ctx.draft.player.skills.blunt.xp).toBe(run.player.skills.blunt.xp + 1);
    expect(ctx.draft.player.skills.guard.xp).toBe(run.player.skills.guard.xp);
  });

  it("결투에서 이겨도 승리 경험 +1은 없다", () => {
    const run = edit(inCombat(start("farmer"), ["arena_brawler"], { knockout: true }), (s) => {
      s.combat!.result = "victory";
      s.combat!.xpThisCombat = { blunt: 2 };
    });
    const ctx = ctxOf(run, seq(0.9, 0.9));
    finishCombat(ctx);
    expect(ctx.draft.player.skills.blunt).toEqual(run.player.skills.blunt);
  });

  it("공격하지 않고 이기면 승리 경험은 없다", () => {
    const run = edit(inCombat(start("farmer"), ["boar"]), (s) => { s.combat!.result = "victory"; });
    const ctx = ctxOf(run, seq(0.9));
    finishCombat(ctx);
    expect(ctx.draft.player.skills.blunt).toEqual(run.player.skills.blunt);
  });

  it("승리: 피로 +1, 쏜 화살 절반 회수, 전리품", () => {
    const run = edit(inCombat(start("hunter"), ["wolf"]), (s) => {
      s.combat!.result = "victory";
      s.combat!.arrowsFired = 3;
      s.inventory.slots[0]!.qty = 7;
    });
    const ctx = ctxOf(run, seq(0.1));
    expect(finishCombat(ctx)).toBe("win");
    expect(ctx.draft.combat).toBeNull();
    expect(ctx.draft.resources.fatigue).toBe(1);
    expect(ctx.draft.inventory.slots[0]!.qty).toBe(8);
    expect(ctx.draft.resources.food).toBe(start("hunter").resources.food + 1);
    expect(ctx.draft.inventory.slots.some((x) => x?.itemId === "wolf_pelt")).toBe(true);
  });

  it("사망 굴림 성공: HP 1, 최소 중상, 은화 30% 잃음, 흔적, 그날은 끝", () => {
    const run = edit(inCombat(start("farmer"), ["wolf"]), (s) => { s.combat!.result = "defeated"; s.player.hp = 0; });
    const ctx = ctxOf(run, seq(f20(10)));
    expect(finishCombat(ctx)).toBe("END");
    expect(ctx.draft.player).toMatchObject({ hp: 1, wound: { level: "serious" }, traits: ["survivor"] });
    expect(ctx.draft.resources.silver).toBe(7);
    expect(ctx.draft.time.phase).toBe("evening");
    expect(texts(ctx)[0]).toBe("눈앞이 캄캄해진다. 사망 굴림: 주사위 10, 합계 12 (목표 10)");
  });

  it("결투(knockout)에서 지면 사망 굴림 없이 HP 1·경상, 은화는 그대로", () => {
    const run = edit(inCombat(start("farmer"), ["arena_brawler"], { knockout: true, onDefeat: "lose" }), (s) => { s.combat!.result = "defeated"; s.player.hp = 0; });
    const ctx = ctxOf(run, seq()); // 주사위를 쓰지 않는다
    expect(finishCombat(ctx)).toBe("lose");
    expect(ctx.draft.player).toMatchObject({ hp: 1, wound: { level: "light" }, traits: [] });
    expect(ctx.draft.resources.silver).toBe(run.resources.silver);
    expect(ctx.draft.ending).toBeNull();
  });

  it("결투에서 졌어도 적 HP를 30% 이하로 몰아붙였으면 closeDefeat 장면으로", () => {
    const close = { enemyHpRatio: 0.3, scene: "close" };
    const lost = (hp: number) => {
      const run = edit(inCombat(start("farmer"), ["hero_adel"], { knockout: true, closeDefeat: close, onDefeat: "lost" }), (s) => {
        s.combat!.result = "defeated"; s.player.hp = 0; s.combat!.enemies[0].hp = hp;
      });
      return finishCombat(ctxOf(run, seq()));
    };
    expect(lost(9)).toBe("close"); // 32의 28%
    expect(lost(10)).toBe("lost"); // 31%
  });

  it("사망 굴림 자연 20은 경상으로 일어서고, 실패하면 사망 엔딩", () => {
    const run = edit(inCombat(start("hunter"), ["wolf"]), (s) => { s.combat!.result = "defeated"; s.player.hp = 0; });
    const miracle = ctxOf(run, seq(f20(20)));
    finishCombat(miracle);
    expect(miracle.draft.player.wound.level).toBe("light");
    // 사냥꾼 체력 +1: 8 + 1 = 9 < 10
    const dead = ctxOf(run, seq(f20(8)));
    expect(finishCombat(dead)).toBeNull();
    expect(dead.draft.ending).toBe("death");
  });

  it("도적에게 지면 죽지 않고 은화 절반과 소지품 하나를 빼앗긴다", () => {
    const run = edit(inCombat(start("hunter"), ["bandit"]), (s) => { s.combat!.result = "defeated"; s.player.hp = 0; s.resources.silver = 9; });
    const ctx = ctxOf(run, seq(0.99));
    expect(finishCombat(ctx)).toBe("END");
    expect(ctx.draft.ending).toBeNull();
    expect(ctx.draft.resources.silver).toBe(5);
    expect(ctx.draft.player).toMatchObject({ hp: 1, wound: { level: "light" } });
    expect(ctx.feed.some((f) => f.kind === "item" && f.delta === -1)).toBe(true);
  });

  it("치명상을 방치하면 아침마다 사망 굴림 (D20 + 체력 ≥ 8)", () => {
    const run = edit(start("hunter"), (s) => { s.time.phase = "evening"; s.player.wound.level = "critical"; s.resources.food = 2; });
    // 사냥꾼 체력 +1: 7 + 1 = 8 버팀, 6 + 1 = 7 사망
    const quiet = withoutDailyEvents(CONTENT);
    const live = { ...ctxOf(run, d20Sequence(7)), content: quiet };
    expect(runEvening(live)).toBe(true);
    const die = { ...ctxOf(run, d20Sequence(6)), content: quiet };
    expect(runEvening(die)).toBe(false);
    expect(die.draft.ending).toBe("death");
  });
});

describe("아이템 사용", () => {
  it("약초: HP +4, 경상이면 50%로 낫고, 중상은 못 고친다", () => {
    const hurt = edit(start("farmer"), (s) => {
      s.player.hp = 5;
      s.player.wound.level = "light";
      s.inventory.slots[0] = { itemId: "herb", qty: 2 };
    });
    const ctx = ctxOf(hurt, seq(0.1));
    expect(consumeItem(ctx, "herb", true)).toBe(true);
    expect(ctx.draft.player).toMatchObject({ hp: 9, wound: { level: "none" } });
    const serious = ctxOf(edit(hurt, (s) => { s.player.wound.level = "serious"; }), seq(0.1));
    consumeItem(serious, "herb", true);
    expect(serious.draft.player.wound.level).toBe("serious");
  });

  it("전투 중에는 전투용만 (붕대는 안 됨)", () => {
    const run = edit(start("farmer"), (s) => { s.inventory.slots[0] = { itemId: "bandage", qty: 1 }; });
    expect(consumeItem(ctxOf(run, seq()), "bandage", true)).toBe(false);
  });
});

describe("이벤트와 전투", () => {
  const ev: EventDef = {
    id: "ambush", category: "explore", region: "forest", title: "매복", conditions: [], weight: 1, repeat: { mode: "always" }, startScene: "start",
    scenes: {
      start: { text: "덤불이 흔들린다.", choices: [{ id: "go", label: "다가간다", outcome: { next: "fight" } }] },
      fight: { text: "늑대가 튀어나왔다!", onEnter: [{ type: "startCombat", combat: setup(["wolf"]) }], choices: [] },
      win: { text: "이겼다.", choices: [] },
      fled: { text: "달아났다.", choices: [] },
    },
  };
  const content: ContentDB = { ...CONTENT, events: { ambush: ev } };

  const exploring = (job: JobId) => edit(start(job), (s) => {
    s.activeEvent = { eventId: "ambush", sceneId: "start", explore: { region: "forest", cardsDrawn: 1, deep: false } };
  });

  it("싸움 장면 글은 결과 카드에 남고, 이기면 onVictory 장면으로", () => {
    const res = dispatch(exploring("farmer"), { type: "chooseChoice", choiceId: "go" }, content);
    expect(res.feed).toContainEqual({ kind: "text", text: "늑대가 튀어나왔다!" });
    expect(res.state.combat).not.toBeNull();
    // 15 + 1 ≥ 11, 피해 5 + 1 = 6 → 남은 HP 6인 늑대를 쓰러뜨림, 전리품 굴림 0.1
    const ctx = ctxOf(edit(res.state, (s) => { s.combat!.enemies[0].hp = 6; }), seq(f20(15), fd(5, 6), 0.1), content);
    expect(handleCombat(ctx, { type: "attack", targetId: "wolf_1" })).toBe(true);
    expect(ctx.draft.combat).toBeNull();
    expect(ctx.draft.activeEvent).toMatchObject({ sceneId: "win", explore: { cardsDrawn: 1 } });
  });

  it("도주하면 onFled 장면으로 가고, 탐험의 남은 카드는 버린다", () => {
    const run = dispatch(exploring("hunter"), { type: "chooseChoice", choiceId: "go" }, content).state;
    const ctx = ctxOf(run, seq(f20(18)), content);
    handleCombat(ctx, { type: "flee" });
    expect(ctx.draft.activeEvent).toMatchObject({ sceneId: "fled", explore: { cardsDrawn: 3, deep: true } });
    expect(ctx.draft.stats.timesFled).toBe(1);
  });

  it("탐험 중 쓰러져 실려 오면 남은 카드 없이 그날 저녁으로", () => {
    const run = dispatch(exploring("farmer"), { type: "chooseChoice", choiceId: "go" }, content).state;
    const weak = edit(run, (s) => { s.player.hp = 1; });
    // 빗나감 → 늑대 명중 → HP 0 → 사망 굴림 10 + 2 = 12 성공
    const ctx = ctxOf(weak, seq(f20(2), f20(15), fd(3, 6), f20(10)), content);
    handleCombat(ctx, { type: "attack", targetId: "wolf_1" });
    expect(ctx.draft.activeEvent).toBeNull();
    expect(ctx.draft.time.phase).toBe("evening");
    expect(texts(ctx)).not.toContain("마을로 돌아왔다.");
  });

  it("싸우는 중에는 선택지·행동 명령이 먹지 않는다", () => {
    const run = dispatch(edit(start(), (s) => { s.activeEvent = { eventId: "ambush", sceneId: "start" }; }), { type: "chooseChoice", choiceId: "go" }, content).state;
    expect(run.combat).not.toBeNull();
    expect(dispatch(run, { type: "continue" }, content).state).toBe(run);
    expect(dispatch(run, { type: "chooseAction", action: "rest" }, content).state).toBe(run);
  });
});
