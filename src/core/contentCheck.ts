import type { ContentDB } from "./content";
import { EXPLORE_REGIONS } from "./events/explore";
import { fallbackId, isFallback } from "./events/selector";
import { isVisitId } from "./labels";
import type { ChoiceDef, Condition, Effect, EventDef, Outcome, SceneDef, TextBlock } from "./types";

/** 장면 텍스트가 이보다 길면 한 화면에 안 들어간다 (ARCHITECTURE 2-5) */
const SCENE_TEXT_MAX = 220;
const CHOICES_MAX = 4;
const PLACEHOLDER_ALL = /\{[^}]*\}/g;
/** {name} {job} {silver}, 이름·직업 뒤 조사는 {name:이/가}처럼 */
const PLACEHOLDER_OK = /^\{(?:(?:name|job)(?::(?:을\/를|이\/가|은\/는|과\/와|으로\/로))?|silver)\}$/;

export interface ContentIssues {
  /** 빌드를 멈추는 것 */
  errors: string[];
  /** 고치는 게 좋지만 플레이는 되는 것 */
  warnings: string[];
}

/**
 * 구조 검증(ajv)으로는 못 잡는 실수를 찾는다: 없는 아이템·장면 참조, 끝나지 않는 이벤트, 화면 제약 등.
 * build-content와 테스트가 같이 쓴다.
 */
export function checkContent(content: ContentDB): ContentIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  const flagsSet = new Set<string>();
  const flagsRead: { flag: string; where: string }[] = [];

  for (const ev of Object.values(content.events)) {
    const at = (where: string) => `${ev.id}${where ? `/${where}` : ""}`;
    const err = (where: string, msg: string) => errors.push(`${at(where)}: ${msg}`);
    const warn = (where: string, msg: string) => warnings.push(`${at(where)}: ${msg}`);

    // ── 이벤트 단위 ──
    if (ev.category === "explore") {
      if (!ev.region) err("", "탐험 이벤트에 region이 없다");
      else if (!EXPLORE_REGIONS.includes(ev.region)) err("", `탐험할 수 없는 지역: ${ev.region}`);
    }
    if (ev.category === "npc" && !isFallback(ev) && (!ev.npc || !isVisitId(ev.npc))) err("", `마을 볼일 이벤트의 npc가 올바르지 않다: ${ev.npc ?? "(없음)"}`);
    if (ev.category !== "npc" && ev.npc) warn("", "마을 볼일 이벤트가 아닌데 npc가 있다 (쓰이지 않는다)");
    if (isFallback(ev)) {
      if (ev.conditions.length > 0) warn("", "대체 이벤트에 조건이 있으면 아무것도 안 나올 수 있다");
      if (ev.repeat.mode !== "always") warn("", "대체 이벤트는 repeat: always여야 한다");
    } else if (ev.weight <= 0) {
      err("", "가중치가 0 이하라 뽑히지 않는다");
    }
    if (!ev.scenes[ev.startScene]) err("", `startScene "${ev.startScene}" 장면이 없다`);
    if ("END" in ev.scenes) err("END", `"END"는 이벤트 끝을 뜻하는 예약어라 장면 ID로 쓸 수 없다`);
    checkConditions(ev.conditions, "", { allowChance: true });

    // ── 장면 단위 ──
    for (const [sceneId, scene] of Object.entries(ev.scenes)) {
      checkText(scene.text, sceneId, "장면");
      checkEffects(scene.onEnter, `${sceneId} onEnter`);
      const shown = maxShownChoices(scene);
      if (shown > CHOICES_MAX) warn(sceneId, `선택지가 ${shown}개 (최대 ${CHOICES_MAX})`);
      if (scene.choices.length > 0 && scene.autoNext) warn(sceneId, "선택지가 있으면 autoNext는 쓰이지 않는다");
      if (scene.autoNext) checkNext(scene.autoNext, `${sceneId} autoNext`);

      const ids = new Set<string>();
      for (const choice of scene.choices) {
        const where = `${sceneId}/${choice.id}`;
        if (ids.has(choice.id)) err(where, "선택지 ID 중복");
        ids.add(choice.id);
        checkConditions(choice.conditions, where, { allowChance: false });
        if (choice.cost?.item) checkItem(choice.cost.item.itemId, `${where} cost`);
        if (choice.hideIfLocked && !choice.conditions?.length) warn(where, "조건 없이 hideIfLocked만 있다");
        if (choice.check) {
          const o = choice.outcomes;
          if (choice.check.allowPartial && !o.partial) warn(where, "allowPartial인데 partial 분기가 없다 (실패로 처리됨)");
          if (!choice.check.allowPartial && o.partial) warn(where, "partial 분기가 있지만 allowPartial이 없어 나오지 않는다");
        }
        for (const [label, outcome] of outcomesOf(choice)) checkOutcome(outcome, `${where} ${label}`);
      }
    }

    // ── 도달·종료 ──
    const edges = sceneEdges(ev);
    const reachable = walk([ev.startScene], (id) => edges.get(id) ?? []);
    for (const id of Object.keys(ev.scenes)) {
      if (!reachable.has(id)) warn(id, "어디서도 들어오지 않는 장면");
    }
    const reverse = new Map<string, string[]>();
    for (const [from, tos] of edges) for (const to of tos) reverse.set(to, [...(reverse.get(to) ?? []), from]);
    const canEnd = walk(["END"], (id) => reverse.get(id) ?? []);
    for (const id of reachable) {
      if (id !== "END" && !canEnd.has(id)) err(id, "이 장면에서는 END에 도달할 수 없다 (끝나지 않는 이벤트)");
    }

    // ── 도우미 (이벤트 안의 at·err·warn을 쓴다) ──
    function checkOutcome(o: Outcome, where: string) {
      if (o.text) checkText(o.text, where, "결과");
      checkEffects(o.effects, where);
      checkNext(o.next, where);
    }
    function checkNext(next: string, where: string) {
      if (next !== "END" && !ev.scenes[next]) err(where, `없는 장면으로 간다: "${next}"`);
    }
    function checkText(t: TextBlock, where: string, kind: string) {
      const texts = typeof t === "string" ? [t] : [...t.variants.map((v) => v.text), t.fallback];
      if (typeof t !== "string") for (const v of t.variants) checkConditions(v.when, `${where} 문장 변형`, { allowChance: false });
      for (const s of texts) {
        if (kind === "장면" && s.length > SCENE_TEXT_MAX) warn(where, `장면 텍스트 ${s.length}자 (최대 ${SCENE_TEXT_MAX})`);
        for (const m of s.matchAll(PLACEHOLDER_ALL)) if (!PLACEHOLDER_OK.test(m[0])) err(where, `모르는 치환어 ${m[0]}`);
      }
    }
    function checkConditions(conds: readonly Condition[] | undefined, where: string, opts: { allowChance: boolean }) {
      for (const c of conds ?? []) {
        switch (c.type) {
          case "chance":
            if (!opts.allowChance) err(where, "chance 조건은 이벤트 발생 조건에만 쓸 수 있다 (화면이 미리 그릴 수 없다)");
            break;
          case "hasItem": case "equipped": checkItem(c.itemId, where); break;
          case "trait": checkTrait(c.trait, where); break;
          case "flag": case "notFlag": flagsRead.push({ flag: c.flag, where: at(where) }); break;
          case "any": checkConditions(c.of, where, opts); break;
        }
      }
    }
    function checkEffects(effects: readonly Effect[] | undefined, where: string) {
      for (const e of effects ?? []) {
        // 아침·밤 이벤트는 행동 슬롯 밖에서 일어나므로 남은 슬롯을 지우는 효과가 뜻대로 되지 않는다 (loseNextSlot을 쓴다)
        if (e.type === "endDay" && (ev.category === "morning" || ev.category === "night")) err(where, "아침·밤 이벤트에는 endDay를 쓸 수 없다 (loseNextSlot을 쓴다)");
        switch (e.type) {
          case "addItem": case "removeItem": checkItem(e.itemId, where); break;
          case "gainTrait": checkTrait(e.trait, where); break;
          case "setFlag": case "incFlag": flagsSet.add(e.flag); break;
          case "startCombat":
            if (e.combat.enemies.length === 0) err(where, "적이 없는 전투");
            for (const enemy of e.combat.enemies) if (!content.enemies[enemy]) err(where, `없는 적: ${enemy}`);
            if (e.combat.canFlee && !e.combat.onFled) warn(where, "도주할 수 있는데 onFled가 없다 (도주하면 이벤트가 바로 끝난다)");
            if (e.combat.enemies.some((id) => content.enemies[id]?.onDefeat === "scripted") && !e.combat.onDefeat) err(where, "스토리 전투(scripted)는 onDefeat 장면이 있어야 한다");
            if (e.combat.closeDefeat && !e.combat.knockout) err(where, "closeDefeat는 결투(knockout)에만 쓴다");
            for (const next of [e.combat.onVictory, e.combat.onFled, e.combat.onDefeat, e.combat.closeDefeat?.scene]) if (next) checkNext(next, where);
            break;
        }
      }
    }
    function checkItem(id: string, where: string) {
      if (!content.items[id]) err(where, `없는 아이템: ${id}`);
    }
    function checkTrait(id: string, where: string) {
      if (!content.traits[id]) err(where, `없는 흔적: ${id}`);
    }
  }

  for (const enemy of Object.values(content.enemies)) {
    for (const l of enemy.loot) if (!content.items[l.itemId]) errors.push(`적 ${enemy.id}: 없는 전리품 ${l.itemId}`);
    if (enemy.onRoutFlag) flagsSet.add(enemy.onRoutFlag);
  }

  // 코드가 직접 세우는 플래그 (evening.ts)
  for (const flag of ["raid_night", "sister_sick"]) flagsSet.add(flag);

  // 아무도 세우지 않는 플래그를 읽으면 오타일 가능성이 높다 (스토리 플래그는 6주차 코드가 세울 수도 있으니 경고만)
  for (const { flag, where } of flagsRead) {
    if (!flagsSet.has(flag)) warnings.push(`${where}: 어떤 이벤트도 세우지 않는 플래그 "${flag}"`);
  }

  for (const region of EXPLORE_REGIONS) {
    const has = Object.values(content.events).some((ev) => ev.category === "explore" && ev.region === region && !isFallback(ev));
    if (has && !content.events[fallbackId("explore", region)]) {
      warnings.push(`${region}: 대체 이벤트 없음 (${fallbackId("explore", region)}). 후보가 없으면 탐험이 바로 끝난다`);
    }
  }

  return { errors, warnings };
}

/**
 * 한 화면에 한꺼번에 보일 수 있는 선택지 수. 직업 조건으로 숨긴 선택지는 그 직업에게만 보이므로
 * 직업마다 따로 세어 가장 많은 쪽을 더한다 (용사 일행처럼 직업별 선택지가 여럿인 장면).
 */
/** 한 번에 보일 수 있는 선택지 수. 직업으로 숨긴 것은 직업마다, 명성으로 숨긴 것은 명성 값마다 따로 센다 */
function maxShownChoices(scene: SceneDef): number {
  const perJob = new Map<string, number>();
  const byFame: { min: number; max: number }[] = [];
  let common = 0;
  for (const c of scene.choices) {
    const job = c.hideIfLocked ? c.conditions?.find((x) => x.type === "job") : undefined;
    const fame = c.hideIfLocked ? c.conditions?.find((x) => x.type === "fame") : undefined;
    if (job?.type === "job") perJob.set(job.job, (perJob.get(job.job) ?? 0) + 1);
    else if (fame?.type === "fame") byFame.push({ min: fame.min ?? 0, max: fame.max ?? Infinity });
    else common++;
  }
  let fameMost = 0;
  for (let f = 0; f <= 100; f++) fameMost = Math.max(fameMost, byFame.filter((b) => f >= b.min && f <= b.max).length);
  return common + fameMost + Math.max(0, ...perJob.values());
}

function outcomesOf(c: ChoiceDef): [string, Outcome][] {
  if (!c.check) return [["outcome", c.outcome]];
  return Object.entries(c.outcomes).filter((e): e is [string, Outcome] => e[1] !== undefined);
}

/** 장면 → 갈 수 있는 다음 장면들 ("END" 포함) */
function sceneEdges(ev: EventDef): Map<string, string[]> {
  const edges = new Map<string, string[]>();
  for (const [id, scene] of Object.entries(ev.scenes)) edges.set(id, nextsOf(scene));
  return edges;
}

function nextsOf(scene: SceneDef): string[] {
  // 전투는 끝나면 결과별 장면으로 이어진다 (4주차)
  const combat = (scene.onEnter ?? []).flatMap((e) =>
    e.type === "startCombat" ? [e.combat.onVictory, e.combat.onFled, e.combat.onDefeat, e.combat.closeDefeat?.scene].filter((x): x is string => !!x) : []);
  if (combat.length > 0) return combat;
  if (scene.choices.length === 0) return [scene.autoNext ?? "END"];
  return scene.choices.flatMap((c) => outcomesOf(c).map(([, o]) => o.next));
}

function walk(start: string[], next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>(start);
  const queue = [...start];
  while (queue.length) {
    for (const n of next(queue.shift()!)) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}
