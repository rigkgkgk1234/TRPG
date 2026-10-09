import { describe, expect, it, vi } from "vitest";
import { newRun } from "@/core/newRun";
import type { LogGroup } from "@/store/gameStore";
import { summarizeTurn } from "@/ui/turnSummary";
import { CONTENT } from "@/data";

// theme.ts는 글꼴 파일을 require해서 node에서 읽을 수 없다. 요약은 색 이름만 쓰므로 가짜 색으로 대신한다
vi.mock("@/ui/theme", () => ({ colors: new Proxy({}, { get: () => "#000000" }) }));

const run = newRun(CONTENT, "smith", "하람", { seed: 1, now: "2026-10-07T00:00:00.000Z" });
const roll = (label: string) => ({ kind: "roll" as const, label, result: { spec: { stat: "str" as const, dc: 10 }, mode: "normal" as const, dice: [10], kept: 10, modifiers: [], modifierTotal: 0, total: 10, margin: 0, outcome: "success" as const, xpGained: 0 } });

describe("결과 요약의 전투 연출", () => {
  it("fx는 글 줄이 되지 않고, 내 공격은 그 손의 굴림에, 상대 공격은 바로 뒤 글 줄에 붙는다", () => {
    const main = { side: "player" as const, targetId: "wolf_1", weapon: "blunt" as const, hand: "main" as const, hit: true, crit: false, damage: 5 };
    const off = { ...main, weapon: "blade" as const, hand: "off" as const, hit: false, damage: 0 };
    const foe = { side: "foe" as const, enemyId: "wolf_1", hit: true, crit: false, damage: 3 };
    const group: LogGroup = {
      id: 1, before: run, cmd: { type: "combat", action: { type: "attack", targetId: "wolf_1" } },
      items: [
        roll("공격"), { kind: "fx", fx: main }, { kind: "text", text: "늑대에게 일격을 먹였다. 피해 5." },
        roll("왼손 공격"), { kind: "fx", fx: off }, { kind: "text", text: "왼손 공격이 빗나갔다." },
        { kind: "fx", fx: foe }, { kind: "resource", key: "hp", delta: -3 }, { kind: "text", text: "늑대가 물었다. 피해 3.", foe: true },
      ],
    };
    const s = summarizeTurn(group);
    expect(s.events.map((e) => e.text)).toEqual(["늑대에게 일격을 먹였다. 피해 5.", "왼손 공격이 빗나갔다.", "늑대가 물었다. 피해 3."]);
    expect(s.rollFx).toEqual([main]);
    expect(s.offRollFx).toEqual([off]);
    expect(s.lineFx).toEqual({ 2: [foe] });
  });
});
