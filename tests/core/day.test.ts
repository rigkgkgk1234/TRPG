import { describe, expect, it } from "vitest";
import type { Ctx, GameCommand } from "@/core/commands";
import { gainSkillXp, rollStatGrowth } from "@/core/check/progress";
import { actionStatus, handleAction } from "@/core/day/actions";
import { previewEvening, runEvening } from "@/core/day/evening";
import { buyFood, payDebt } from "@/core/day/town";
import { dispatch } from "@/core/engine";
import { sceneView } from "@/core/events/runner";
import { newRun } from "@/core/newRun";
import type { JobId, Rng, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { d20Sequence, withoutDailyEvents } from "./fixtures";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (job: JobId = "farmer", seed = 1) => newRun(CONTENT, job, "하람", { seed, now: NOW });

/** 아침·밤 이벤트 없이 하루 규칙만 본다 */
const QUIET = withoutDailyEvents(CONTENT);

/** 정해 둔 주사위로 코어 함수를 직접 부른다. draft 대신 깊은 복사본을 고친다. */
function withDice(run: RunState, rng: Rng = d20Sequence()): Ctx {
  return { draft: structuredClone(run), content: QUIET, rng, feed: [] };
}

function edit(run: RunState, fn: (s: RunState) => void): RunState {
  const copy = structuredClone(run);
  fn(copy);
  return copy;
}

describe("newRun", () => {
  it("농부: 기획서 시작값과 쇠스랑 장착", () => {
    const r = start("farmer");
    expect(r.player.stats).toEqual({ str: 1, agi: 0, con: 2, per: 1, cha: 0 });
    expect(r.player.hp).toBe(12);
    expect(r.player.skills.farming).toEqual({ rank: 2, xp: 0 });
    expect(r.player.skills.blade).toEqual({ rank: 0, xp: 0 });
    expect(r.resources).toMatchObject({ silver: 10, food: 6, debt: 0, fatigue: 0 });
    expect(r.inventory.equipment.weapon).toEqual({ itemId: "pitchfork", qty: 1, durability: 20 });
    expect(r.time).toEqual({ day: 1, phase: "am", skipNextAm: false, restsToday: 0, collapsedToday: false });
  });

  it("사냥꾼: 활은 장착, 화살·사냥칼은 가방에", () => {
    const r = start("hunter");
    expect(r.inventory.equipment.weapon?.itemId).toBe("hunting_bow");
    expect(r.inventory.slots.filter(Boolean)).toEqual([
      { itemId: "arrow", qty: 10 },
      { itemId: "hunting_knife", qty: 1, durability: 20 },
    ]);
  });

  it("모든 직업의 시작 아이템이 콘텐츠에 있다", () => {
    for (const job of Object.values(CONTENT.jobs)) {
      for (const it of job!.startItems) expect(CONTENT.items[it.itemId], it.itemId).toBeDefined();
    }
  });

  it("빈 이름은 기본 이름, 없는 직업은 오류", () => {
    expect(newRun(CONTENT, "farmer", "  ", { seed: 1, now: NOW }).player.name).toBe("이름 없는 주민");
    expect(() => newRun(CONTENT, "errand", "x", { seed: 1, now: NOW })).toThrow();
  });
});

describe("일하기", () => {
  it("농부 성공: 은화 2+1, 식량 +1, 피로 +2, 농사 XP +1, 오후로", () => {
    const ctx = withDice(start("farmer"), d20Sequence(7)); // 7 + 근력1 + 농사2 = 10
    handleAction(ctx, "work");
    const s = ctx.draft;
    expect(s.resources).toMatchObject({ silver: 13, food: 7, fatigue: 2 });
    expect(s.player.skills.farming.xp).toBe(1);
    expect(s.player.statUses.str).toBe(1);
    expect(s.stats).toMatchObject({ checksRolled: 1, silverEarned: 3 });
    expect(s.time.phase).toBe("pm");
  });

  it("실패는 기본 수입만, 대성공은 추가분 2배", () => {
    const fail = withDice(start("farmer"), d20Sequence(6));
    handleAction(fail, "work");
    expect(fail.draft.resources).toMatchObject({ silver: 12, food: 6 });
    expect(fail.draft.player.skills.farming.xp).toBe(2);

    const crit = withDice(start("farmer"), d20Sequence(20));
    handleAction(crit, "work");
    expect(crit.draft.resources).toMatchObject({ silver: 14, food: 8 });
  });

  it("대장장이 대실패: HP -2, 경상, 피로 3+1. 이미 다쳤으면 부상은 그대로", () => {
    const ctx = withDice(start("smith"), d20Sequence(1));
    handleAction(ctx, "work");
    expect(ctx.draft.player.wound.level).toBe("light");
    expect(ctx.draft.player.hp).toBe(start("smith").player.hp - 2);
    expect(ctx.draft.resources.fatigue).toBe(4);
    expect(ctx.draft.resources.silver).toBe(8 + 3);

    const hurt = withDice(edit(start("smith"), (s) => { s.player.wound.level = "serious"; }), d20Sequence(1, 1)); // 중상은 불리함
    handleAction(hurt, "work");
    expect(hurt.draft.player.wound.level).toBe("serious");
  });

  it("대장간 일에 성공하면 둔기 경험 +1 (망치질), 실패하면 없다", () => {
    const ok = withDice(start("smith"), d20Sequence(15)); // 15 + 근력2 + 대장일2 = 19
    handleAction(ok, "work");
    expect(ok.draft.player.skills.blunt.xp).toBe(start("smith").player.skills.blunt.xp + 1);
    const fail = withDice(start("smith"), d20Sequence(3));
    handleAction(fail, "work");
    expect(fail.draft.player.skills.blunt.xp).toBe(start("smith").player.skills.blunt.xp);
  });

  it("지친 상태(피로 7+)면 불리함으로 굴린다", () => {
    const ctx = withDice(edit(start("farmer"), (s) => { s.resources.fatigue = 7; }), d20Sequence(18, 3));
    handleAction(ctx, "work");
    const roll = ctx.feed.find((f) => f.kind === "roll");
    expect(roll?.kind === "roll" && roll.result.kept).toBe(3);
  });
});

describe("훈련·휴식", () => {
  it("혼자 훈련은 운동(능력치)을 골라야 하고, 능력치만으로 DC 10. 성공하면 판정 횟수 +3", () => {
    const run = start("hunter");
    expect(actionStatus(run, CONTENT, "trainSolo")).toMatchObject({ available: false });
    const ctx = withDice(run, d20Sequence(8)); // 8 + 민첩2 = 10
    handleAction(ctx, "trainSolo", { stat: "agi" });
    expect(ctx.draft.player.statUses.agi).toBe(3);
    expect(ctx.draft.player.skills.bow.xp).toBe(0);
    expect(ctx.draft.resources.fatigue).toBe(2);
  });

  it("운동은 실패해도 판정 횟수 +2, 대실패는 피로 +1 추가 (SYSTEM_SPEC 2-4)", () => {
    const fail = withDice(start("hunter"), d20Sequence(5));
    handleAction(fail, "trainSolo", { stat: "str" });
    expect(fail.draft.player.statUses.str).toBe(2);
    const crit = withDice(start("hunter"), d20Sequence(1));
    handleAction(crit, "trainSolo", { stat: "str" });
    expect(crit.draft.resources.fatigue).toBe(3);
    expect(crit.draft.player.statUses.str).toBe(2);
  });

  it("운동은 성장 굴림 기준(15)을 넘겨 쌓지 않고, 채웠거나 자연 상한이면 막는다. 말솜씨 운동은 없다", () => {
    const ctx = withDice(edit(start("hunter"), (s) => { s.player.statUses.con = 13; }), d20Sequence(20));
    handleAction(ctx, "trainSolo", { stat: "con" });
    expect(ctx.draft.player.statUses.con).toBe(15);
    expect(actionStatus(ctx.draft, CONTENT, "trainSolo", { stat: "con" })).toEqual({ available: false, reason: "저녁에 성장 기회가 온다" });
    const capped = edit(start("hunter"), (s) => { s.player.stats.per = 4; });
    expect(actionStatus(capped, CONTENT, "trainSolo", { stat: "per" }).available).toBe(false);
    expect(actionStatus(start(), CONTENT, "trainSolo", { stat: "cha" })).toEqual({ available: false, reason: "그런 운동은 없다" });
  });

  it("교습: 은화 3, XP +3, 피로 +3, 등급이 오르면 XP 0", () => {
    const ctx = withDice(start("farmer"));
    handleAction(ctx, "trainLesson", { skill: "guard" });
    const s = ctx.draft;
    expect(s.resources.silver).toBe(7);
    expect(s.resources.fatigue).toBe(3);
    expect(s.player.skills.guard).toEqual({ rank: 1, xp: 0 });
    expect(ctx.feed).toContainEqual({ kind: "levelUp", skill: "guard", newValue: 1 });
  });

  it("교습은 레나가 가르치는 숙련만, 은화 3 이상", () => {
    expect(actionStatus(start("farmer"), CONTENT, "trainLesson", { skill: "farming" })).toMatchObject({ available: false });
    const poor = edit(start("farmer"), (s) => { s.resources.silver = 2; });
    expect(actionStatus(poor, CONTENT, "trainLesson", { skill: "blade" })).toEqual({ available: false, reason: "은화 3 필요" });
  });

  it("휴식: HP +2(최대치까지), 피로 -3, 경상은 휴식 2회로 회복", () => {
    const hurt = edit(start("farmer"), (s) => {
      s.player.hp = 5;
      s.resources.fatigue = 5;
      s.player.wound.level = "light";
    });
    const ctx = withDice(hurt);
    handleAction(ctx, "rest");
    expect(ctx.draft.player.hp).toBe(7);
    expect(ctx.draft.resources.fatigue).toBe(2);
    expect(ctx.draft.player.wound).toMatchObject({ level: "light", restCount: 1 });
    handleAction(ctx, "rest");
    expect(ctx.draft.player.wound.level).toBe("none");
    expect(ctx.draft.time).toMatchObject({ phase: "evening", restsToday: 2 });
  });

  it("중상이면 훈련·교습 불가, 일하기·휴식은 가능", () => {
    const run = edit(start("farmer"), (s) => { s.player.wound.level = "serious"; });
    expect(actionStatus(run, CONTENT, "trainSolo", { stat: "str" }).available).toBe(false);
    expect(actionStatus(run, CONTENT, "trainLesson", { skill: "blade" }).available).toBe(false);
    expect(actionStatus(run, CONTENT, "work").available).toBe(true);
    expect(actionStatus(run, CONTENT, "rest").available).toBe(true);
  });

  it("없는 숙련 ID는 크래시 없이 거절", () => {
    const run = start();
    const res = dispatch(run, { type: "chooseAction", action: "trainLesson", skill: "constructor" as never }, CONTENT);
    expect(res.state).toBe(run);
    expect(res.feed).toEqual([{ kind: "toast", text: "그런 기술은 없다" }]);
  });

  it("마을 볼일은 찾아갈 사람을, 탐험은 지역을 골라야 한다", () => {
    expect(actionStatus(start(), CONTENT, "village")).toEqual({ available: false, reason: "찾아갈 사람을 고른다" });
    expect(actionStatus(start(), CONTENT, "village", { npc: "nobody" })).toEqual({ available: false, reason: "그런 사람은 없다" });
    expect(actionStatus(start(), CONTENT, "village", { npc: "toby" })).toEqual({ available: true });
    expect(actionStatus(start(), CONTENT, "explore")).toEqual({ available: false, reason: "갈 곳을 고른다" });
  });
});

describe("숙련 XP 상한과 능력치 성장", () => {
  it("하루 같은 숙련 XP는 최대 6", () => {
    const ctx = withDice(start("farmer"));
    expect(gainSkillXp(ctx, "blade", 2)).toBe(2); // 0→1등급 (필요 3 미만)
    expect(gainSkillXp(ctx, "blade", 3)).toBe(3); // 등급 1, XP 0 (넘친 XP 버림)
    expect(gainSkillXp(ctx, "blade", 3)).toBe(1);
    expect(gainSkillXp(ctx, "blade", 3)).toBe(0);
    expect(ctx.draft.player.skills.blade).toEqual({ rank: 1, xp: 1 });
  });

  it("15회 사용 시 D20 + 능력치 ≤ 15면 +1, 실패면 카운트 10", () => {
    const run = edit(start("farmer"), (s) => { s.player.statUses.str = 15; s.player.statUses.per = 15; });
    const ctx = withDice(run, d20Sequence(14, 15)); // 근력: 14+1=15 성공, 감각: 15+1=16 실패
    rollStatGrowth(ctx);
    expect(ctx.draft.player.stats.str).toBe(2);
    expect(ctx.draft.player.statUses.str).toBe(0);
    expect(ctx.draft.player.stats.per).toBe(1);
    expect(ctx.draft.player.statUses.per).toBe(10);
  });

  it("자연 성장 상한 +4면 굴리지 않는다", () => {
    const run = edit(start(), (s) => { s.player.stats.str = 4; s.player.statUses.str = 20; });
    const ctx = withDice(run); // 주사위를 쓰면 d20Sequence가 오류를 던진다
    rollStatGrowth(ctx);
    expect(ctx.draft.player.stats.str).toBe(4);
  });
});

describe("피로와 탈진", () => {
  it("피로 10이면 그날 끝 → 수면 대신 피로 6 → 다음 날 오후부터", () => {
    const ctx = withDice(edit(start("farmer"), (s) => { s.resources.fatigue = 8; }), d20Sequence(10, 10));
    handleAction(ctx, "work");
    expect(ctx.draft.resources.fatigue).toBe(10);
    expect(ctx.draft.time).toMatchObject({ phase: "evening", collapsedToday: true, skipNextAm: true });

    runEvening(ctx);
    expect(ctx.draft.resources.fatigue).toBe(6);
    expect(ctx.draft.time).toMatchObject({ day: 2, phase: "pm", skipNextAm: false, collapsedToday: false });
  });
});

describe("저녁 정산", () => {
  const evening = (fn: (s: RunState) => void = () => {}) =>
    edit(start("farmer"), (s) => { s.time.phase = "evening"; fn(s); });

  it("식량 2를 먹고, 수면 -3, HP +1, 다음 날 아침", () => {
    const ctx = withDice(evening((s) => { s.resources.fatigue = 4; s.player.hp = 10; s.player.skillXpToday = { farming: 3 }; }));
    expect(runEvening(ctx)).toBe(true);
    const s = ctx.draft;
    expect(s.resources).toMatchObject({ food: 4, hunger: 0, familyHunger: 0, fatigue: 1 });
    expect(s.player.hp).toBe(11);
    expect(s.time).toMatchObject({ day: 2, phase: "am", restsToday: 0 });
    expect(s.player.skillXpToday).toEqual({});
  });

  it("식량 1이면 먹이는 순서대로", () => {
    const self = withDice(evening((s) => { s.resources.food = 1; }));
    runEvening(self, "selfFirst");
    expect(self.draft.resources).toMatchObject({ food: 0, hunger: 0, familyHunger: 1 });

    const family = withDice(evening((s) => { s.resources.food = 1; }));
    runEvening(family, "familyFirst");
    expect(family.draft.resources).toMatchObject({ food: 0, hunger: 1, familyHunger: 0 });
  });

  it("굶주림 1이면 수면 회복 -1, 휴식했으면 +1", () => {
    const hungry = withDice(evening((s) => { s.resources.food = 0; s.resources.fatigue = 6; }));
    runEvening(hungry);
    expect(hungry.draft.resources.fatigue).toBe(4);

    const rested = withDice(evening((s) => { s.resources.fatigue = 6; s.time.restsToday = 1; }));
    runEvening(rested);
    expect(rested.draft.resources.fatigue).toBe(2);
  });

  it("굶주림 3+면 HP -2, HP 0이면 사망 엔딩", () => {
    const ctx = withDice(evening((s) => { s.resources.food = 0; s.resources.hunger = 2; s.player.hp = 2; }));
    expect(runEvening(ctx)).toBe(false);
    expect(ctx.draft.player.hp).toBe(0);
    expect(ctx.draft.ending).toBe("death");
  });

  it("중상은 HP가 차지 않고, 방치 5일이면 경상 + 「오래된 상처」(민첩 -1)", () => {
    const ctx = withDice(evening((s) => {
      s.player.hp = 5;
      s.player.wound = { level: "serious", restCount: 0, treatedDays: null, untreatedDays: 4 };
    }));
    runEvening(ctx);
    expect(ctx.draft.player.hp).toBe(5);
    expect(ctx.draft.player.wound.level).toBe("light");
    expect(ctx.draft.player.traits).toEqual(["old_wound"]);
    expect(ctx.draft.player.stats.agi).toBe(-1);
  });

  it("7일차 세금 5", () => {
    const ctx = withDice(evening((s) => { s.time.day = 7; }));
    runEvening(ctx);
    expect(ctx.draft.resources.silver).toBe(5);
  });

  it("세금이 모자라면 부족분 + 이자 2가 빚, 평판 -5", () => {
    const run = evening((s) => { s.time.day = 14; s.resources.silver = 3; });
    expect(previewEvening(run)).toMatchObject({ taxDue: 5, taxShort: true, debtEnding: false });
    const ctx = withDice(run);
    runEvening(ctx);
    expect(ctx.draft.resources).toMatchObject({ silver: 0, debt: 4 });
    expect(ctx.draft.player.reputation).toBe(5);
  });

  it("빚 20 이상으로 납세일을 맞으면 「빚진 자」", () => {
    const ctx = withDice(evening((s) => { s.time.day = 21; s.resources.debt = 20; }));
    expect(runEvening(ctx)).toBe(false);
    expect(ctx.draft.ending).toBe("debtor");
  });

  it("30일차 저녁 정산 뒤에는 날이 바뀌지 않고 최종 습격이 시작된다", () => {
    const ctx = withDice(evening((s) => { s.time.day = 30; }));
    expect(runEvening(ctx)).toBe(false);
    expect(ctx.draft.activeEvent?.eventId).toBe("story_raid");
    expect(ctx.draft.ending).toBeNull();
    expect(ctx.draft.time.day).toBe(30);
  });
});

describe("마을 거래", () => {
  it("식량 1 = 은화 1, 행동 슬롯을 쓰지 않는다", () => {
    const ctx = withDice(start("farmer"));
    expect(buyFood(ctx, 3)).toBe(true);
    expect(ctx.draft.resources).toMatchObject({ silver: 7, food: 9 });
    expect(ctx.draft.time.phase).toBe("am");
    expect(buyFood(ctx, 8)).toBe(false);
  });

  it("NaN·0·음수 수량은 거절하고 상태를 그대로 둔다", () => {
    const run = edit(start(), (s) => { s.resources.debt = 5; });
    for (const qty of [NaN, Infinity, 0, -3]) {
      for (const op of ["buyFood", "payDebt"] as const) {
        const res = dispatch(run, { type: "shop", op, qty }, CONTENT);
        expect(res.state, `${op} ${qty}`).toBe(run);
        expect(res.save).toBe(false);
      }
    }
  });

  it("빚 갚기 거절 사유가 실제 원인과 맞는다", () => {
    const noDebt = withDice(start());
    payDebt(noDebt, 5);
    expect(noDebt.feed).toEqual([{ kind: "toast", text: "갚을 빚이 없다" }]);
    const broke = withDice(edit(start(), (s) => { s.resources.debt = 5; s.resources.silver = 0; }));
    payDebt(broke, 5);
    expect(broke.feed).toEqual([{ kind: "toast", text: "갚을 은화가 없다" }]);
  });

  it("빚은 가진 은화만큼만 갚는다", () => {
    const ctx = withDice(edit(start(), (s) => { s.resources.debt = 15; }));
    expect(payDebt(ctx, 99)).toBe(true);
    expect(ctx.draft.resources).toMatchObject({ silver: 0, debt: 5 });
    expect(payDebt(ctx, 1)).toBe(false);
  });
});

describe("dispatch", () => {
  const send = (run: RunState, cmd: GameCommand) => dispatch(run, cmd, CONTENT);

  it("원본 상태를 바꾸지 않는다", () => {
    const run = start();
    const before = structuredClone(run);
    const res = send(run, { type: "chooseAction", action: "work" });
    expect(run).toEqual(before);
    expect(res.state).not.toBe(run);
    expect(res.save).toBe(true);
  });

  it("불가능한 명령은 상태를 그대로 두고 사유만 남긴다", () => {
    const run = start();
    const res = send(run, { type: "endDay" });
    expect(res.state).toBe(run);
    expect(res.save).toBe(false);
    expect(res.feed).toEqual([{ kind: "toast", text: "아직 할 일이 남았다" }]);
  });

  it("하루를 넘기면 체크포인트", () => {
    const quiet = (r: RunState, cmd: GameCommand) => dispatch(r, cmd, QUIET);
    let run = start();
    run = quiet(run, { type: "chooseAction", action: "rest" }).state;
    run = quiet(run, { type: "chooseAction", action: "rest" }).state;
    const res = quiet(run, { type: "endDay" });
    expect(res.checkpoint).toBe(true);
    expect(res.state.time.day).toBe(2);
  });

  it("같은 시드·같은 명령이면 같은 결과 (RNG 상태가 이어진다)", () => {
    const play = () => {
      let run = start("smith", 77);
      for (let i = 0; i < 10; i++) {
        run = send(run, { type: "chooseAction", action: "work" }).state;
        run = send(run, { type: "chooseAction", action: "trainSolo", stat: "str" }).state;
        run = send(run, { type: "endDay" }).state;
      }
      return run;
    };
    expect(play()).toEqual(play());
  });

  it("끝난 회차에는 명령이 먹지 않는다", () => {
    const ended = edit(start(), (s) => { s.ending = "survivor"; });
    expect(send(ended, { type: "chooseAction", action: "rest" }).state).toBe(ended);
  });

  it("일하기+휴식만으로 30일을 보내면 엔딩에 도달한다 (스토리 이벤트는 첫 선택지로 넘긴다)", () => {
    for (const job of ["farmer", "smith", "hunter"] as const) {
      let run = start(job, 5);
      for (let guard = 0; !run.ending && guard < 500; guard++) {
        const { phase } = run.time;
        let cmd: GameCommand;
        const scene = sceneView(run, CONTENT);
        if (run.combat) {
          cmd = { type: "combat", action: { type: "defend" } };
        } else if (scene?.kind === "choices") {
          cmd = { type: "chooseChoice", choiceId: scene.choices.find((c) => c.lockedReason === null)!.id };
        } else if (scene) {
          cmd = scene.kind === "deeper" ? { type: "goDeeper", yes: false } : { type: "continue" };
        } else if (phase === "evening") {
          const need = 2 - run.resources.food;
          if (need > 0 && run.resources.silver > 0) run = send(run, { type: "shop", op: "buyFood", qty: Math.min(need, run.resources.silver) }).state;
          cmd = { type: "endDay" };
        } else {
          cmd = { type: "chooseAction", action: phase === "am" ? "work" : "rest" };
        }
        run = send(run, cmd).state;
      }
      expect(run.ending, job).not.toBeNull();
    }
  });
});
