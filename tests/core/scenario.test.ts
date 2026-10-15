import { describe, expect, it } from "vitest";
import { sceneView } from "@/core/events/runner";
import { decodeSave, encodeSave } from "@/core/save/serialize";
import { validateRun } from "@/core/save/validate";
import { scenarioEvents, scenarioFinished, scenarioRun, type ScenarioStart } from "@/core/scenario";
import { dispatch } from "@/core/engine";
import { CONTENT } from "@/data";

const NOW = "2026-10-15T00:00:00.000Z";
const make = (start: ScenarioStart, day = 5) =>
  scenarioRun(CONTENT, { job: "farmer", day, silver: 60, reputation: 20, hpRatio: 0.5, start, seed: 7, now: NOW });

describe("상황 시험", () => {
  it("하루·저녁 화면은 정한 날짜·자원으로 시작한다", () => {
    const hub = make({ kind: "hub" }, 12);
    expect(hub.time).toMatchObject({ day: 12, phase: "am" });
    expect(hub.resources.silver).toBe(60);
    expect(hub.player.reputation).toBe(20);
    expect(hub.activeEvent).toBeNull();
    expect(make({ kind: "evening" }).time.phase).toBe("evening");
  });

  it("모든 전투 이벤트가 전투가 시작된 채로 열린다", () => {
    for (const ev of scenarioEvents(CONTENT, true)) {
      const run = make({ kind: "combat", eventId: ev.id }, 20);
      expect(run.combat, ev.id).not.toBeNull();
      expect(run.activeEvent?.eventId).toBe(ev.id);
    }
  });

  it("이벤트는 첫 장면부터, 탐험 이벤트는 탐험 중으로 열린다", () => {
    const explore = scenarioEvents(CONTENT, false).find((ev) => ev.category === "explore")!;
    const run = make({ kind: "event", eventId: explore.id });
    expect(run.activeEvent?.explore?.region).toBe(explore.region);
    expect(sceneView(run, CONTENT)).not.toBeNull();
  });

  it("만든 회차는 저장했다 불러와도 검사를 통과한다", () => {
    const combat = scenarioEvents(CONTENT, true)[0];
    for (const run of [make({ kind: "hub" }), make({ kind: "evening" }), make({ kind: "combat", eventId: combat.id })]) {
      expect(validateRun(run, CONTENT)).toBeNull();
      expect(decodeSave(encodeSave(run, NOW), CONTENT)).not.toBeNull();
    }
  });

  it("고른 상황이 끝나면 시험이 끝난다", () => {
    const hub = make({ kind: "hub" }, 5);
    expect(scenarioFinished(hub, { start: { kind: "hub" }, day: 5 })).toBe(false);
    expect(scenarioFinished({ ...hub, time: { ...hub.time, day: 6 } }, { start: { kind: "hub" }, day: 5 })).toBe(true);

    // 이벤트: 싸움이 아닌 선택지를 골라 가다 이벤트가 끝나면 끝
    const ev = scenarioEvents(CONTENT, false).find((e) => e.category === "npc")!;
    const setup = { start: { kind: "event", eventId: ev.id } as const, day: 5 };
    let run = make(setup.start);
    expect(scenarioFinished(run, setup)).toBe(false);
    for (let i = 0; i < 20 && !scenarioFinished(run, setup); i++) {
      const v = sceneView(run, CONTENT)!;
      const cmd = v.kind === "choices" ? { type: "chooseChoice" as const, choiceId: (v.choices.find((c) => c.lockedReason === null && !c.danger) ?? v.choices.find((c) => c.lockedReason === null))!.id } : { type: "continue" as const };
      run = dispatch(run, cmd, CONTENT).state;
    }
    expect(scenarioFinished(run, setup)).toBe(true);
  });
});
