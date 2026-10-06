import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildContent, GENERATED, serialize } from "../../scripts/build-content";
import type { Ctx, GameCommand } from "@/core/commands";
import type { ContentDB } from "@/core/content";
import { combatView } from "@/core/combat/combat";
import { checkContent } from "@/core/contentCheck";
import { actionStatus } from "@/core/day/actions";
import { dispatch } from "@/core/engine";
import { conditionReason, evalCondition } from "@/core/events/conditions";
import { applyEffect } from "@/core/events/effects";
import { dangerTierForDay, EXPLORE_CARDS } from "@/core/events/explore";
import { handleChoice, sceneView } from "@/core/events/runner";
import { selectEvent } from "@/core/events/selector";
import { resolveText } from "@/core/events/text";
import { addItem, countItem, removeItem } from "@/core/items/inventory";
import { josa } from "@/core/labels";
import { newRun } from "@/core/newRun";
import { createRng, type EventDef, type JobId, type Rng, type RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { d20Sequence } from "./fixtures";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (job: JobId = "farmer", seed = 1) => newRun(CONTENT, job, "하람", { seed, now: NOW });

function edit(run: RunState, fn: (s: RunState) => void): RunState {
  const copy = structuredClone(run);
  fn(copy);
  return copy;
}

function ctxOf(run: RunState, content: ContentDB = CONTENT, rng: Rng = d20Sequence()): Ctx {
  return { draft: structuredClone(run), content, rng, feed: [] };
}

/** 장면 하나·계속 버튼뿐인 단순 탐험 카드 */
function plainCard(id: string, extra: Partial<EventDef> = {}): EventDef {
  return {
    id, category: "explore", region: "forest", title: id, conditions: [], weight: 10,
    repeat: { mode: "always" }, dangerTier: 1, startScene: "start",
    scenes: { start: { text: `${id} 장면`, choices: [] } },
    ...extra,
  };
}

function withEvents(...events: EventDef[]): ContentDB {
  return { ...CONTENT, events: Object.fromEntries(events.map((e) => [e.id, e])) };
}

/** 판정 선택지 하나가 있는 테스트 이벤트 */
const CHOICE_EVENT: EventDef = {
  id: "test_choice", category: "explore", region: "forest", title: "깎아지른 절벽", conditions: [], weight: 1,
  repeat: { mode: "always" }, startScene: "start",
  scenes: {
    start: {
      text: "{name:은/는} 보리울의 {job}이다. 가진 은화는 {silver}닢.",
      choices: [
        {
          id: "climb", label: "절벽을 기어오른다", cost: { silver: 2 },
          check: { stat: "str", dc: 12, allowPartial: true },
          outcomes: {
            success: { text: "꼭대기에 올랐다.", effects: [{ type: "food", delta: 2 }], next: "top" },
            fail: { text: "발이 미끄러졌다.", effects: [{ type: "hp", delta: -1 }], next: "END" },
          },
        },
        { id: "bow", label: "활을 쏜다", conditions: [{ type: "equipped", itemId: "hunting_bow" }], outcome: { next: "END" } },
        { id: "secret", label: "숨은 길로 간다", conditions: [{ type: "flag", flag: "secret" }], hideIfLocked: true, outcome: { next: "END" } },
        { id: "risky", label: "아래로 뛰어내린다", check: { stat: "agi", dc: 10 }, outcomes: { success: { next: "END" }, fail: { next: "hurt" } } },
      ],
    },
    top: { text: "절벽 위로 바람이 분다.", choices: [], autoNext: "END" },
    hurt: { text: "착지하다 발목이 꺾였다.", onEnter: [{ type: "wound", steps: 1 }], choices: [] },
  },
};

const inEvent = (run: RunState, eventId: string, sceneId = "start"): RunState =>
  edit(run, (s) => { s.activeEvent = { eventId, sceneId }; });

describe("조건", () => {
  const run = edit(start("hunter"), (s) => {
    s.time.day = 5;
    s.flags = { wolves: 2, met: true };
    s.player.traits = ["survivor"];
  });

  it("날짜·플래그·숙련·아이템·장착·직업·부상·피로·흔적", () => {
    expect(evalCondition({ type: "dayRange", min: 5, max: 5 }, run)).toBe(true);
    expect(evalCondition({ type: "dayRange", min: 6 }, run)).toBe(false);
    expect(evalCondition({ type: "flag", flag: "met" }, run)).toBe(true);
    expect(evalCondition({ type: "flag", flag: "wolves", value: 2 }, run)).toBe(true);
    expect(evalCondition({ type: "flag", flag: "wolves", value: 3 }, run)).toBe(false);
    expect(evalCondition({ type: "notFlag", flag: "nope" }, run)).toBe(true);
    expect(evalCondition({ type: "skill", skill: "bow", min: 2 }, run)).toBe(true);
    expect(evalCondition({ type: "hasItem", itemId: "arrow", qty: 10 }, run)).toBe(true);
    expect(evalCondition({ type: "hasItem", itemId: "arrow", qty: 11 }, run)).toBe(false);
    expect(evalCondition({ type: "equipped", itemId: "hunting_bow" }, run)).toBe(true);
    expect(evalCondition({ type: "hasItem", itemId: "hunting_bow" }, run)).toBe(true);
    expect(evalCondition({ type: "job", job: "farmer" }, run)).toBe(false);
    expect(evalCondition({ type: "wound", max: "none" }, run)).toBe(true);
    expect(evalCondition({ type: "fatigue", max: 0 }, run)).toBe(true);
    expect(evalCondition({ type: "trait", trait: "survivor" }, run)).toBe(true);
    expect(evalCondition({ type: "any", of: [{ type: "job", job: "farmer" }, { type: "job", job: "hunter" }] }, run)).toBe(true);
  });

  it("chance는 rng가 있을 때만 (화면이 미리 그리는 곳에서는 데이터 오류)", () => {
    expect(evalCondition({ type: "chance", p: 0.5 }, run, () => 0.1)).toBe(true);
    expect(evalCondition({ type: "chance", p: 0.5 }, run, () => 0.9)).toBe(false);
    expect(() => evalCondition({ type: "chance", p: 0.5 }, run)).toThrow();
  });

  it("잠김 사유는 필요한 값을 말한다", () => {
    expect(conditionReason({ type: "skill", skill: "tracking", min: 2 }, CONTENT)).toBe("추적 2 필요");
    expect(conditionReason({ type: "equipped", itemId: "hunting_bow" }, CONTENT)).toBe("사냥활 장착 필요");
    expect(conditionReason({ type: "hasItem", itemId: "herb", qty: 2 }, CONTENT)).toBe("약초 2개 필요");
    expect(conditionReason({ type: "wound", max: "light" }, CONTENT)).toBe("중상 상태로는 무리다");
    expect(conditionReason({ type: "flag", flag: "x" }, CONTENT)).toBeNull();
  });
});

describe("문장", () => {
  it("받침에 맞는 조사", () => {
    expect(josa("검술", "을/를")).toBe("검술을");
    expect(josa("말솜씨", "이/가")).toBe("말솜씨가");
    expect(josa("개암나무 숲", "으로/로")).toBe("개암나무 숲으로");
    expect(josa("보리울", "으로/로")).toBe("보리울로");
    expect(josa("로웬", "은/는")).toBe("로웬은");
  });

  it("변형 조건과 {name}·{job}·{silver} 치환", () => {
    const run = start("hunter");
    expect(resolveText("{name}({job})의 은화 {silver}닢", run)).toBe("하람(사냥꾼)의 은화 5닢");
    expect(resolveText("{name:이/가} 어릴 때부터 {job:으로/로} 살아왔다.", run)).toBe("하람이 어릴 때부터 사냥꾼으로 살아왔다.");
    const block = { variants: [{ when: [{ type: "job" as const, job: "hunter" as const }], text: "사냥꾼용" }], fallback: "기본" };
    expect(resolveText(block, run)).toBe("사냥꾼용");
    expect(resolveText(block, start("farmer"))).toBe("기본");
  });
});

describe("이벤트 추첨", () => {
  it("위험 등급: 1~10일 1, 11~20일 2, 21일~ 3", () => {
    expect([1, 10, 11, 20, 21, 30].map(dangerTierForDay)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("등급·조건·반복 규칙을 거르고, 후보가 없으면 대체 이벤트", () => {
    const content = withEvents(
      plainCard("a_tier2", { dangerTier: 2 }),
      plainCard("b_day5", { conditions: [{ type: "dayRange", min: 5 }] }),
      plainCard("c_once", { repeat: { mode: "once" } }),
      plainCard("forest_fallback", { weight: 0 }),
    );
    const seen = edit(start(), (s) => { s.eventHistory.c_once = { count: 1, lastDay: 1 }; });
    expect(selectEvent(ctxOf(seen, content, () => 0), "explore", "forest")?.id).toBe("forest_fallback");
    // 더 깊이: 등급 +1이면 a_tier2가 후보
    expect(selectEvent(ctxOf(seen, content, () => 0), "explore", "forest", true)?.id).toBe("a_tier2");
    const day5 = edit(seen, (s) => { s.time.day = 5; });
    expect(selectEvent(ctxOf(day5, content, () => 0), "explore", "forest")?.id).toBe("b_day5");
  });

  it("쿨다운이 지나야 다시 나온다", () => {
    const content = withEvents(plainCard("cd", { repeat: { mode: "cooldown", days: 3 } }));
    const run = (day: number) => edit(start(), (s) => { s.time.day = day; s.eventHistory.cd = { count: 1, lastDay: 2 }; });
    expect(selectEvent(ctxOf(run(4), content, () => 0), "explore", "forest")).toBeNull();
    expect(selectEvent(ctxOf(run(5), content, () => 0), "explore", "forest")?.id).toBe("cd");
  });

  it("ID 순으로 가중치를 쌓는다 (데이터 추가 순서와 무관하게 같은 시드면 같은 카드)", () => {
    const a = withEvents(plainCard("x1"), plainCard("x2"));
    const b = withEvents(plainCard("x2"), plainCard("x1"));
    for (const roll of [0.1, 0.49, 0.51, 0.9]) {
      expect(selectEvent(ctxOf(start(), a, () => roll), "explore", "forest")?.id)
        .toBe(selectEvent(ctxOf(start(), b, () => roll), "explore", "forest")?.id);
    }
  });

  it("최근 3일 안에 본 카드는 가중치 ×0.3", () => {
    const content = withEvents(plainCard("a"), plainCard("b"));
    // a(10×0.3=3) + b(10) = 13 → 0.25×13 = 3.25는 b
    const run = edit(start(), (s) => { s.time.day = 4; s.eventHistory.a = { count: 1, lastDay: 2 }; });
    expect(selectEvent(ctxOf(run, content, () => 0.25), "explore", "forest")?.id).toBe("b");
    expect(selectEvent(ctxOf(start(), content, () => 0.25), "explore", "forest")?.id).toBe("a");
  });
});

describe("선택지", () => {
  const content = withEvents(CHOICE_EVENT);

  it("화면용 정리: 확률·비용·잠김 사유·숨김·위험", () => {
    const view = sceneView(inEvent(start("farmer"), "test_choice"), content);
    expect(view?.kind).toBe("choices");
    if (view?.kind !== "choices") return;
    expect(view.text).toBe("하람은 보리울의 농부이다. 가진 은화는 10닢.");
    expect(view.choices.map((c) => c.id)).toEqual(["climb", "bow", "risky"]);
    const [climb, bow, risky] = view.choices;
    expect(climb).toMatchObject({ lockedReason: null, cost: ["은화 -2"], danger: false });
    expect(climb.chance).toBeCloseTo(0.5); // 근력 1, DC 12 → (21-11)/20
    expect(bow.lockedReason).toBe("사냥활 장착 필요");
    expect(risky.danger).toBe(true); // 실패하면 부상 장면으로
  });

  it("비용을 내고 굴린 뒤 결과 문장·효과 → 다음 장면", () => {
    const ctx = ctxOf(inEvent(start("farmer"), "test_choice"), content, d20Sequence(15));
    expect(handleChoice(ctx, "climb")).toBe(true);
    const s = ctx.draft;
    expect(s.resources.silver).toBe(8);
    expect(s.resources.food).toBe(8);
    expect(s.activeEvent).toMatchObject({ sceneId: "top" });
    // 다음 장면으로 넘어가도 직전 판정은 남는다 (재진입 시 결과 복원용)
    expect(s.activeEvent?.lastCheck?.outcome).toBe("success");
    expect(ctx.feed.map((f) => f.kind)).toEqual(["resource", "roll", "text", "resource"]);
  });

  it("부분 성공 분기가 없으면 실패로, 대실패 분기가 없으면 실패 + 피로 1", () => {
    // 근력 1 + 10 = 11 → DC 12에서 1 모자람 → partial → fail 분기
    const partial = ctxOf(inEvent(start("farmer"), "test_choice"), content, d20Sequence(10));
    handleChoice(partial, "climb");
    expect(partial.draft.activeEvent).toBeNull();
    expect(partial.draft.player.hp).toBe(start("farmer").player.hp - 1);

    const fumble = ctxOf(inEvent(start("farmer"), "test_choice"), content, d20Sequence(1));
    handleChoice(fumble, "climb");
    expect(fumble.draft.resources.fatigue).toBe(1);
  });

  it("잠긴·숨은·없는 선택지는 상태를 바꾸지 않고 사유만", () => {
    const run = inEvent(start("farmer"), "test_choice");
    for (const [choiceId, reason] of [["bow", "사냥활 장착 필요"], ["secret", "그런 선택지는 없다"], ["nope", "그런 선택지는 없다"]]) {
      const res = dispatch(run, { type: "chooseChoice", choiceId }, content);
      expect(res.state).toBe(run);
      expect(res.feed).toEqual([{ kind: "toast", text: reason }]);
    }
    const poor = edit(run, (s) => { s.resources.silver = 1; });
    expect(dispatch(poor, { type: "chooseChoice", choiceId: "climb" }, content).feed).toEqual([{ kind: "toast", text: "은화 2 필요" }]);
  });

  it("장면에 들어가면 onEnter, 선택지 없는 장면은 계속 → autoNext", () => {
    const ctx = ctxOf(inEvent(start("farmer"), "test_choice"), content, d20Sequence(2));
    handleChoice(ctx, "risky");
    expect(ctx.draft.player.wound.level).toBe("light");
    expect(sceneView(ctx.draft, content)?.kind).toBe("continue");
    const res = dispatch(ctx.draft, { type: "continue" }, content);
    expect(res.state.activeEvent).toBeNull();
  });
});

describe("효과", () => {
  it("이벤트 피해로는 HP 1까지만 (사망 굴림은 4주차)", () => {
    const ctx = ctxOf(edit(start(), (s) => { s.player.hp = 2; }));
    applyEffect(ctx, { type: "hp", delta: -5 });
    expect(ctx.draft.player.hp).toBe(1);
    applyEffect(ctx, { type: "hp", delta: -1 });
    expect(ctx.draft.player.hp).toBe(1);
  });

  it("플래그 세우기·더하기, 부상 치료는 더 나쁠 때만", () => {
    const ctx = ctxOf(edit(start(), (s) => { s.player.wound.level = "light"; }));
    applyEffect(ctx, { type: "setFlag", flag: "met" });
    applyEffect(ctx, { type: "incFlag", flag: "wolves", delta: 2 });
    applyEffect(ctx, { type: "incFlag", flag: "wolves", delta: 1 });
    expect(ctx.draft.flags).toEqual({ met: true, wolves: 3 });
    applyEffect(ctx, { type: "healWound", to: "serious" });
    expect(ctx.draft.player.wound.level).toBe("light");
    applyEffect(ctx, { type: "healWound", to: "none" });
    expect(ctx.draft.player.wound.level).toBe("none");
  });

  it("다음 슬롯 잃기: 오전이면 오후가 사라지고, 오후면 내일 오전이 사라진다", () => {
    const am = ctxOf(start());
    applyEffect(am, { type: "loseNextSlot" });
    expect(am.draft.time.phase).toBe("pm");
    const pm = ctxOf(edit(start(), (s) => { s.time.phase = "pm"; }));
    applyEffect(pm, { type: "loseNextSlot" });
    expect(pm.draft.time.skipNextAm).toBe(true);
  });

  it("아이템: 겹치기, 칸이 모자라면 두고 온다, 뒤 칸부터 뺀다", () => {
    const ctx = ctxOf(start("farmer"));
    expect(addItem(ctx, "herb", 7)).toBe(7);
    expect(ctx.draft.inventory.slots.filter(Boolean).map((s) => s!.qty)).toEqual([5, 2]);
    expect(removeItem(ctx, "herb", 3)).toBe(3);
    expect(countItem(ctx.draft.inventory, "herb")).toBe(4);

    const full = ctxOf(edit(start("farmer"), (s) => { s.inventory.slots = s.inventory.slots.map(() => ({ itemId: "goblin_token", qty: 1 })); }));
    expect(addItem(full, "herb", 2)).toBe(0);
    expect(full.feed).toEqual([{ kind: "text", text: "가방이 가득 차서 약초 2개는 두고 왔다." }]);
  });
});

describe("탐험 흐름", () => {
  const content = withEvents(plainCard("c1"), plainCard("c2"), plainCard("c3", { dangerTier: 2 }));
  const send = (run: RunState, cmd: GameCommand) => dispatch(run, cmd, content).state;
  const explore = (run: RunState) => send(run, { type: "chooseAction", action: "explore", region: "forest" });

  it("지역을 골라야 하고, 카드가 없는 지역은 준비 중", () => {
    expect(actionStatus(start(), content, "explore", { region: "forest" })).toEqual({ available: true });
    expect(actionStatus(start(), content, "explore", { region: "watchtower" })).toEqual({ available: false, reason: "준비 중" });
    expect(actionStatus(edit(start(), (s) => { s.player.wound.level = "serious"; }), content, "explore", { region: "forest" }))
      .toEqual({ available: false, reason: "중상 상태로는 무리다" });
  });

  it("카드 2장 → 더 깊이? → 1장 더(피로 +1) → 마을로, 슬롯은 끝날 때 쓴다", () => {
    let run = explore(start());
    expect(run.resources.fatigue).toBe(2);
    expect(run.time.phase).toBe("am");
    expect(run.activeEvent?.explore).toEqual({ region: "forest", cardsDrawn: 1, deep: false });
    run = send(run, { type: "continue" });
    expect(run.activeEvent?.explore?.cardsDrawn).toBe(EXPLORE_CARDS);
    run = send(run, { type: "continue" });
    expect(sceneView(run, content)?.kind).toBe("deeper");
    // 더 깊이를 묻는 동안 다른 행동·거래는 못 한다
    expect(dispatch(run, { type: "chooseAction", action: "rest" }, content).state).toBe(run);
    expect(dispatch(run, { type: "continue" }, content).state).toBe(run);

    run = send(run, { type: "goDeeper", yes: true });
    expect(run.resources.fatigue).toBe(3);
    expect(run.activeEvent?.explore).toMatchObject({ cardsDrawn: 3, deep: true });
    run = send(run, { type: "continue" });
    expect(run.activeEvent).toBeNull();
    expect(run.time.phase).toBe("pm");
  });

  it("돌아가기를 고르면 바로 끝", () => {
    let run = explore(start());
    run = send(send(run, { type: "continue" }), { type: "continue" });
    run = send(run, { type: "goDeeper", yes: false });
    expect(run.activeEvent).toBeNull();
    expect(run.time.phase).toBe("pm");
    expect(run.resources.fatigue).toBe(2);
  });

  it("탈진하면 남은 카드 없이 그날 끝", () => {
    const tired = edit(start(), (s) => { s.resources.fatigue = 8; });
    const run = explore(tired);
    expect(run.activeEvent).toBeNull();
    expect(run.time.phase).toBe("evening");
    expect(run.time.skipNextAm).toBe(true);
  });

  it("endDay 효과: 남은 카드를 버리고 이벤트가 끝나면 저녁", () => {
    const stop = plainCard("stop", { scenes: { start: { text: "해가 지고 있다. 서둘러 돌아가야 한다.", onEnter: [{ type: "endDay" }], choices: [] } } });
    const c = withEvents(stop);
    let run = dispatch(start(), { type: "chooseAction", action: "explore", region: "forest" }, c).state;
    run = dispatch(run, { type: "continue" }, c).state;
    expect(run.activeEvent).toBeNull();
    expect(run.time.phase).toBe("evening");
  });

  it("엔딩 효과면 이벤트도 탐험도 그 자리에서 끝", () => {
    const end = plainCard("end", { scenes: { start: { text: "다시는 눈을 뜨지 못했다.", onEnter: [{ type: "ending", ending: "death" }], choices: [] } } });
    const run = dispatch(start(), { type: "chooseAction", action: "explore", region: "forest" }, withEvents(end)).state;
    expect(run.ending).toBe("death");
    expect(run.activeEvent).toBeNull();
  });
});

describe("콘텐츠", () => {
  it("실제 데이터: 구조·참조 오류와 경고가 없다", () => {
    const { errors, warnings } = buildContent();
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("content.generated.json이 원본 JSON과 같다 (원본을 고쳤으면 npm run build:content)", () => {
    expect(readFileSync(GENERATED, "utf8")).toBe(serialize(buildContent().generated));
  });

  it("숲 탐험 카드가 10장 이상", () => {
    const forest = Object.values(CONTENT.events).filter((e) => e.category === "explore" && e.region === "forest" && !e.id.endsWith("_fallback"));
    expect(forest.length).toBeGreaterThanOrEqual(10);
  });

  it("참조 검사가 실수를 잡는다", () => {
    const broken: EventDef = {
      id: "broken", category: "explore", region: "forest", title: "망가진 이벤트", conditions: [], weight: 1,
      repeat: { mode: "always" }, startScene: "start",
      scenes: {
        start: {
          text: "{nmae}",
          choices: [
            { id: "a", label: "a", conditions: [{ type: "chance", p: 0.5 }], outcome: { effects: [{ type: "addItem", itemId: "herbb", qty: 1 }], next: "nowhere" } },
            { id: "b", label: "b", outcome: { next: "loop" } },
          ],
        },
        loop: { text: "같은 길을 계속 맴돈다.", choices: [], autoNext: "loop" },
        orphan: { text: "아무 장면도 이리로 오지 않는다.", choices: [] },
      },
    };
    const { errors, warnings } = checkContent(withEvents(broken));
    expect(errors.join("\n")).toMatch(/모르는 치환어 \{nmae\}/);
    expect(errors.join("\n")).toMatch(/chance 조건/);
    expect(errors.join("\n")).toMatch(/없는 아이템: herbb/);
    expect(errors.join("\n")).toMatch(/없는 장면으로 간다: "nowhere"/);
    expect(errors.join("\n")).toMatch(/broken\/loop: .*END에 도달할 수 없다/);
    expect(warnings.join("\n")).toMatch(/broken\/orphan: 어디서도 들어오지 않는 장면/);
    expect(warnings.join("\n")).toMatch(/forest_fallback/);
  });
});

describe("무작위 플레이", () => {
  /** 할 수 있는 것 중 하나를 무작위로 고른다. 엔진이 받아 주지 않는 명령을 고르면 실패. */
  function randomCommand(run: RunState, pick: Rng): GameCommand {
    const fight = combatView(run, CONTENT);
    if (fight) {
      const open = fight.actions.filter((a) => a.lockedReason === null);
      const a = open[Math.floor(pick() * open.length)];
      if (a.type === "attack" || a.type === "powerAttack") return { type: "combat", action: { type: a.type, targetId: fight.targetId! } };
      if (a.type === "useItem") return { type: "combat", action: { type: "useItem", itemId: fight.items[0].itemId } };
      return { type: "combat", action: { type: a.type } };
    }
    const view = sceneView(run, CONTENT);
    if (view?.kind === "deeper") return { type: "goDeeper", yes: pick() < 0.5 };
    if (view?.kind === "continue") return { type: "continue" };
    if (view?.kind === "choices") {
      const open = view.choices.filter((c) => c.lockedReason === null);
      return { type: "chooseChoice", choiceId: open[Math.floor(pick() * open.length)].id };
    }
    if (run.time.phase === "evening") return { type: "endDay" };
    const actions: GameCommand[] = [
      { type: "chooseAction", action: "work" },
      { type: "chooseAction", action: "rest" },
      { type: "chooseAction", action: "explore", region: "forest" },
    ];
    const ok = actions.filter((a) => a.type === "chooseAction" && actionStatus(run, CONTENT, a.action, { region: a.region }).available);
    return ok[Math.floor(pick() * ok.length)];
  }

  it("직업마다 60판: 막히는 장면 없이 30일을 끝낸다", () => {
    for (const job of ["farmer", "smith", "hunter"] as const) {
      for (let seed = 1; seed <= 60; seed++) {
        let run = start(job, seed);
        const pick = createRng({ seed: seed * 7919, state: seed * 7919 });
        let steps = 0;
        while (!run.ending) {
          if (run.activeEvent && !run.combat) expect(sceneView(run, CONTENT)).not.toBeNull();
          const cmd = randomCommand(run, pick);
          const res = dispatch(run, cmd, CONTENT);
          expect(res.feed.filter((f) => f.kind === "toast"), JSON.stringify(cmd)).toEqual([]);
          run = res.state;
          if (++steps > 2000) throw new Error(`${job} #${seed}: 끝나지 않는다`);
        }
      }
    }
  });
});
