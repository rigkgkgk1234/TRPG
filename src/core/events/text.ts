import type { ContentDB } from "../content";
import { josa, JOB_LABEL, type JosaPair } from "../labels";
import type { RunState, TextBlock } from "../types";
import { evalAll } from "./conditions";

/**
 * 문장 변형을 고르고 {name}·{job}·{weapon}·{silver}를 채운다. (SYSTEM_SPEC 4-5)
 * 이름은 플레이어가 정하므로 뒤에 붙는 조사는 {name:이/가}처럼 쓰면 받침에 맞춰 붙는다.
 * {weapon}은 지금 손에 쥔 무기 이름이고, 무기가 없으면 "주먹"이다.
 * 변형 조건은 화면이 미리 그릴 수 있어야 하므로 rng 없이 평가한다.
 */
export function resolveText(block: TextBlock, run: RunState, content: Pick<ContentDB, "items">): string {
  const raw = typeof block === "string"
    ? block
    : block.variants.find((v) => evalAll(v.when, run))?.text ?? block.fallback;
  const words = { name: run.player.name, job: JOB_LABEL[run.player.job], weapon: weaponWord(run, content) };
  return raw
    .replace(/\{(name|job|weapon)(?::([^}]+))?\}/g, (_, key: "name" | "job" | "weapon", pair?: string) =>
      pair ? josa(words[key], pair as JosaPair) : words[key])
    .replaceAll("{silver}", String(run.resources.silver));
}

/** 손에 쥔 무기의 이름. 맨손이면 "주먹" */
export function weaponWord(run: RunState, content: Pick<ContentDB, "items">): string {
  const id = run.inventory.equipment.weapon?.itemId;
  return (id && content.items[id]?.name) || "주먹";
}
