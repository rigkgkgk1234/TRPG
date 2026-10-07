import { describe, expect, it } from "vitest";
import type { GameCommand } from "@/core/commands";
import type { ContentDB } from "@/core/content";
import { checkContent } from "@/core/contentCheck";
import { actionStatus } from "@/core/day/actions";
import { dispatch } from "@/core/engine";
import { sceneView } from "@/core/events/runner";
import { eventPool, possibleEvents } from "@/core/events/selector";
import { NPC_IDS } from "@/core/labels";
import { newRun } from "@/core/newRun";
import type { EventCategory, EventDef, RunState } from "@/core/types";
import { CONTENT } from "@/data";

const NOW = "2026-10-07T00:00:00.000Z";
const start = (seed = 1) => newRun(CONTENT, "farmer", "하람", { seed, now: NOW });

function edit(run: RunState, fn: (s: RunState) => void): RunState {
  const copy = structuredClone(run);
  fn(copy);
  return copy;
}

/** 장면 하나·계속 버튼뿐인 이벤트 */
function plain(id: string, category: EventCategory, extra: Partial<EventDef> = {}): EventDef {
  return {
    id, category, title: id, conditions: [], weight: 10, repeat: { mode: "always" }, startScene: "start",
    scenes: { start: { text: `${id} 장면`, choices: [] } },
    ...extra,
  };
}

/** 스토리·탐험은 그대로 두고 아침·밤·마을 볼일 이벤트만 바꾼 콘텐츠 */
function withDaily(...events: EventDef[]): ContentDB {
  const kept = Object.entries(CONTENT.events).filter(([, ev]) => !["morning", "night", "npc"].includes(ev.category));
  return { ...CONTENT, events: Object.fromEntries([...kept, ...events.map((e) => [e.id, e] as const)]) };
}

const send = (run: RunState, cmd: GameCommand, content: ContentDB) => dispatch(run, cmd, content);

const evening = (fn: (s: RunState) => void = () => {}) =>
  edit(start(), (s) => { s.time.phase = "evening"; s.resources.food = 4; fn(s); });

describe("아침 이벤트", () => {
  it("저녁 정산이 끝나 날이 바뀌면 아침 이벤트가 하나 열린다", () => {
    const content = withDaily(plain("t_morning", "morning"));
    const res = send(evening(), { type: "endDay" }, content);
    expect(res.state.time).toMatchObject({ day: 2, phase: "am" });
    expect(res.state.activeEvent?.eventId).toBe("t_morning");
    expect(res.checkpoint).toBe(true);
    expect(sceneView(res.state, content)).toMatchObject({ kind: "continue", category: "morning" });

    // 아침 이벤트가 끝나면 오전 행동을 고른다 (슬롯은 그대로)
    const after = send(res.state, { type: "continue" }, content).state;
    expect(after.activeEvent).toBeNull();
    expect(after.time.phase).toBe("am");
  });

  it("후보가 없으면 아무 일 없이 오전으로", () => {
    const content = withDaily(plain("t_morning", "morning", { conditions: [{ type: "dayRange", min: 20 }] }));
    const res = send(evening(), { type: "endDay" }, content);
    expect(res.state.activeEvent).toBeNull();
    expect(res.state.time).toMatchObject({ day: 2, phase: "am" });
  });

  it("오전 동안 일을 돕는 아침 이벤트는 오전 슬롯을 쓴다 (loseNextSlot)", () => {
    const help: EventDef = {
      ...plain("t_help", "morning"),
      scenes: { start: { text: "일손이 모자라다.", choices: [{ id: "help", label: "돕는다", outcome: { effects: [{ type: "loseNextSlot" }], next: "END" } }] } },
    };
    const content = withDaily(help);
    const morning = send(evening(), { type: "endDay" }, content).state;
    const after = send(morning, { type: "chooseChoice", choiceId: "help" }, content).state;
    expect(after.time.phase).toBe("pm");
  });
});

describe("밤 이벤트", () => {
  /** 밤 이벤트가 날 때까지 시드를 바꿔 본다 (밤 25%) */
  function nightOf(content: ContentDB): RunState {
    for (let seed = 1; seed < 200; seed++) {
      const res = send(edit(evening(), (s) => { s.rng = { seed, state: seed }; }), { type: "endDay" }, content);
      if (res.state.activeEvent?.eventId === "t_night") return res.state;
    }
    throw new Error("밤 이벤트가 나오는 시드를 찾지 못했다");
  }

  it("정산 뒤 25%로 밤 이벤트: 그동안 날은 그대로, 끝나면 다음 날 아침 (체크포인트)", () => {
    const content = withDaily(plain("t_night", "night"), plain("t_morning", "morning"));
    const night = nightOf(content);
    expect(night.time).toMatchObject({ day: 1, phase: "evening" });
    expect(sceneView(night, content)).toMatchObject({ category: "night" });

    const res = send(night, { type: "continue" }, content);
    expect(res.state.time).toMatchObject({ day: 2, phase: "am" });
    expect(res.checkpoint).toBe(true);
    expect(res.state.activeEvent?.eventId).toBe("t_morning");
  });

  it("밤에 잠을 설치면 다음 날 오전을 잃는다 (loseNextSlot)", () => {
    const sleepless: EventDef = {
      ...plain("t_night", "night"),
      scenes: { start: { text: "지붕이 날아갔다.", choices: [{ id: "fix", label: "아침에 고친다", outcome: { effects: [{ type: "loseNextSlot" }], next: "END" } }] } },
    };
    const content = withDaily(sleepless);
    const after = send(nightOf(content), { type: "chooseChoice", choiceId: "fix" }, content).state;
    expect(after.time).toMatchObject({ day: 2, phase: "pm" });
  });

  it("밤 이벤트 콘텐츠가 없으면 굴리지 않는다", () => {
    const content = withDaily();
    const before = evening();
    const res = send(before, { type: "endDay" }, content);
    expect(res.state.time.day).toBe(2);
    // 밤 이벤트를 굴리지 않았으니 RNG 상태가 그대로다 (저녁 정산은 이 경우 주사위를 쓰지 않는다)
    expect(res.state.rng).toEqual(before.rng);
  });
});

describe("마을 볼일", () => {
  const visit: EventDef = { ...plain("t_toby", "npc"), npc: "toby" };

  it("사람을 골라 그 사람의 이벤트를 본다. 끝나면 행동 슬롯을 쓴다", () => {
    const content = withDaily(visit);
    expect(actionStatus(start(), content, "village", { npc: "toby" })).toEqual({ available: true });
    expect(actionStatus(start(), content, "village", { npc: "brock" })).toEqual({ available: false, reason: "준비 중" });

    const res = send(start(), { type: "chooseAction", action: "village", npc: "toby" }, content);
    expect(res.feed).toContainEqual({ kind: "text", text: "여관 주인 토비를 찾아갔다." });
    expect(res.state.activeEvent?.eventId).toBe("t_toby");
    expect(res.state.time.phase).toBe("am");
    expect(send(res.state, { type: "continue" }, content).state.time.phase).toBe("pm");
  });

  it("오후에 찾아가면 끝난 뒤 저녁", () => {
    const content = withDaily(visit);
    const pm = edit(start(), (s) => { s.time.phase = "pm"; });
    const res = send(pm, { type: "chooseAction", action: "village", npc: "toby" }, content).state;
    expect(send(res, { type: "continue" }, content).state.time.phase).toBe("evening");
  });

  it("모든 NPC가 찾아갈 거리를 가졌다", () => {
    for (const npc of NPC_IDS) expect(eventPool(CONTENT, "npc", undefined, npc).length, npc).toBeGreaterThan(0);
  });
});

describe("탐험 중 중상", () => {
  it("카드 하나가 끝났을 때 중상 이상이면 남은 카드 없이 귀가", () => {
    const hurt: EventDef = {
      id: "t_hurt", category: "explore", region: "forest", title: "t_hurt", conditions: [], weight: 10, repeat: { mode: "always" }, dangerTier: 1,
      startScene: "start", scenes: { start: { text: "굴러떨어졌다.", onEnter: [{ type: "wound", steps: 2 }], choices: [] } },
    };
    const content = { ...CONTENT, events: { t_hurt: hurt } };
    const run = send(start(), { type: "chooseAction", action: "explore", region: "forest" }, content).state;
    expect(run.player.wound.level).toBe("serious");
    const res = send(run, { type: "continue" }, content);
    expect(res.state.activeEvent).toBeNull();
    expect(res.state.time.phase).toBe("pm");
    expect(res.feed).toContainEqual({ kind: "text", text: "상처가 깊다. 더 돌아다닐 몸이 아니다." });
  });
});

describe("7주차 콘텐츠", () => {
  const count = (category: EventCategory, region?: "forest" | "watchtower") => eventPool(CONTENT, category, region).length;

  it("이벤트 135개 이상: 아침 30 · 밤 10 · 마을 볼일 20 · 숲 30 · 감시탑 30", () => {
    expect(Object.keys(CONTENT.events).length).toBeGreaterThanOrEqual(135);
    expect(count("morning")).toBeGreaterThanOrEqual(30);
    expect(count("night")).toBeGreaterThanOrEqual(10);
    expect(count("npc")).toBeGreaterThanOrEqual(20);
    expect(count("explore", "forest")).toBeGreaterThanOrEqual(30);
    expect(count("explore", "watchtower")).toBeGreaterThanOrEqual(30);
  });

  it("감시탑을 탐험할 수 있다 (1일차에도 위험 등급 1 카드가 있다)", () => {
    expect(actionStatus(start(), CONTENT, "explore", { region: "watchtower" })).toEqual({ available: true });
    expect(eventPool(CONTENT, "explore", "watchtower").some((ev) => (ev.dangerTier ?? 1) === 1 && ev.conditions.length === 0)).toBe(true);
  });

  it("콘텐츠 검사: 마을 볼일 이벤트는 올바른 npc가, 아침·밤 이벤트에는 endDay가 없어야 한다", () => {
    const noNpc: EventDef = plain("t_npc", "npc");
    const badNight: EventDef = {
      ...plain("t_bad_night", "night"),
      scenes: { start: { text: "밤", onEnter: [{ type: "endDay" }], choices: [] } },
    };
    const { errors } = checkContent({ ...CONTENT, events: { t_npc: noNpc, t_bad_night: badNight } });
    expect(errors).toContain("t_npc: 마을 볼일 이벤트의 npc가 올바르지 않다: (없음)");
    expect(errors).toContain("t_bad_night/start onEnter: 아침·밤 이벤트에는 endDay를 쓸 수 없다 (loseNextSlot을 쓴다)");
  });
});

describe("리뷰 회귀", () => {
  it("밤 이벤트 중에는 저녁 정산을 다시 할 수 없다", () => {
    const night = edit(evening(), (s) => { s.activeEvent = { eventId: "night_stars", sceneId: "start" }; });
    const res = send(night, { type: "endDay" }, CONTENT);
    expect(res.state).toBe(night);
    expect(res.feed).toEqual([{ kind: "toast", text: "아직 할 일이 남았다" }]);
  });

  it("밤 이벤트에서 탈진하면 다음 날 피로 6으로 시작하고 오전을 잃는다", () => {
    const tiring: EventDef = { ...plain("t_tiring", "night"), scenes: { start: { text: "밤새 일했다.", onEnter: [{ type: "fatigue", delta: 10 }], choices: [] } } };
    const content = withDaily(tiring);
    const run = edit(evening(), (s) => { s.activeEvent = { eventId: "t_tiring", sceneId: "start" }; s.resources.fatigue = 9; s.time.collapsedToday = true; s.time.skipNextAm = true; });
    const after = send(run, { type: "continue" }, content).state;
    expect(after.time).toMatchObject({ day: 2, phase: "pm", collapsedToday: false });
    expect(after.resources.fatigue).toBe(6);
  });

  it("아침 이벤트에서 탈진하면 그날은 끝난다", () => {
    const tiring: EventDef = { ...plain("t_tiring", "morning"), scenes: { start: { text: "새벽부터 일했다.", onEnter: [{ type: "fatigue", delta: 10 }], choices: [] } } };
    const content = withDaily(tiring);
    const morning = send(evening(), { type: "endDay" }, content).state;
    expect(morning.time.collapsedToday).toBe(true);
    expect(send(morning, { type: "continue" }, content).state.time.phase).toBe("evening");
  });

  it("오후에 시작한 아침 이벤트의 loseNextSlot은 그날 오후를 쓴다 (다음 날 오전이 아니라)", () => {
    const help: EventDef = {
      ...plain("t_help", "morning"),
      scenes: { start: { text: "일손이 모자라다.", choices: [{ id: "help", label: "돕는다", outcome: { effects: [{ type: "loseNextSlot" }], next: "END" } }] } },
    };
    const content = withDaily(help);
    const morning = send(evening((s) => { s.time.skipNextAm = true; }), { type: "endDay" }, content).state;
    expect(morning.time.phase).toBe("pm");
    const after = send(morning, { type: "chooseChoice", choiceId: "help" }, content).state;
    expect(after.time).toMatchObject({ phase: "evening", skipNextAm: false });
  });
});

describe("고르기 전 안내", () => {
  it("지금 나올 수 있는 이벤트: 반복 규칙·조건·위험 등급을 거르고, 확률 조건은 나올 수 있는 것으로 친다", () => {
    const run = start();
    const forest = possibleEvents(run, CONTENT, "explore", "forest");
    expect(forest.length).toBeGreaterThan(0);
    expect(forest.every((ev) => (ev.dangerTier ?? 1) === 1)).toBe(true);
    const seen = edit(run, (s) => { s.eventHistory[forest[0].id] = { count: 1, lastDay: 1 }; });
    expect(possibleEvents(seen, CONTENT, "explore", "forest").map((e) => e.id)).not.toContain(forest[0].id);
    expect(possibleEvents(run, CONTENT, "npc", undefined, "toby").every((ev) => ev.npc === "toby")).toBe(true);
  });
});
