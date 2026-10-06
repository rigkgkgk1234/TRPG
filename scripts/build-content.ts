/// <reference types="node" />
// src/data/**/*.json → 구조(ajv)·참조 검증 → src/data/content.generated.json (ARCHITECTURE 2-5)
// Metro에는 파일 시스템이 없어 이벤트 파일 수백 개를 앱이 직접 읽을 수 없다. 그래서 미리 한 파일로 합친다.
// 사용법: npm run build:content          (npm start 전에 자동으로 돈다)
//         npm run build:content -- --check   (생성 파일이 최신인지만 확인)
import Ajv, { type ValidateFunction } from "ajv";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentDB } from "@/core/content";
import { checkContent } from "@/core/contentCheck";
import { JOBS, type EventDef, type ItemDef, type TraitDef } from "@/core/types";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const DATA = join(ROOT, "src/data");
export const GENERATED = join(DATA, "content.generated.json");

/** 앱이 import하는 생성 파일의 모양. 직업은 types.ts의 상수라 넣지 않는다. */
export interface GeneratedContent {
  items: Record<string, ItemDef>;
  traits: Record<string, TraitDef>;
  events: Record<string, EventDef>;
}

export interface BuildResult {
  generated: GeneratedContent;
  errors: string[];
  warnings: string[];
}

export function buildContent(): BuildResult {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validator = (name: string) => ajv.compile(readJson(join(ROOT, `schemas/${name}.schema.json`)) as object);
  const errors: string[] = [];

  const items = readList<ItemDef>(ajv, "items.json", validator("item"), errors);
  const traits = readList<TraitDef>(ajv, "traits.json", validator("trait"), errors);

  const validateEvent = validator("event");
  const events: Record<string, EventDef> = {};
  for (const file of listJson(join(DATA, "events"))) {
    const rel = relative(ROOT, file);
    const raw = readJson(file) as EventDef & { $schema?: string };
    if (!validateEvent(raw)) {
      errors.push(`${rel}: ${ajv.errorsText(validateEvent.errors, { dataVar: "event" })}`);
      continue;
    }
    const { $schema: _, ...ev } = raw;
    if (basename(file, ".json") !== ev.id) errors.push(`${rel}: 파일 이름과 id(${ev.id})가 다르다`);
    if (events[ev.id]) errors.push(`${rel}: 중복 ID ${ev.id}`);
    events[ev.id] = ev;
  }

  const generated: GeneratedContent = { items, traits, events: sortKeys(events) };
  const content: ContentDB = { ...generated, jobs: JOBS, enemies: {} };
  // 구조가 틀린 파일이 있으면 참조 검사는 엉뚱한 오류를 쏟아내므로 건너뛴다
  if (errors.length > 0) return { generated, errors, warnings: [] };
  const issues = checkContent(content);
  return { generated, errors: issues.errors, warnings: issues.warnings };
}

export function serialize(g: GeneratedContent): string {
  return JSON.stringify(g, null, 1) + "\n";
}

function readList<T extends { id: string }>(ajv: Ajv, file: string, validate: ValidateFunction, errors: string[]): Record<string, T> {
  const list = readJson(join(DATA, file)) as T[];
  const out: Record<string, T> = {};
  list.forEach((x, i) => {
    if (!validate(x)) errors.push(`src/data/${file}[${i}] ${(x as { id?: string }).id ?? ""}: ${ajv.errorsText(validate.errors)}`);
    else if (out[x.id]) errors.push(`src/data/${file}: 중복 ID ${x.id}`);
    else out[x.id] = x;
  });
  return out;
}

function listJson(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => join(d.parentPath, d.name))
    .sort();
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sortKeys<T>(rec: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : 1)));
}

// ── CLI ──
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { generated, errors, warnings } = buildContent();
  for (const w of warnings) console.warn(`경고  ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`오류  ${e}`);
    console.error(`\n콘텐츠 오류 ${errors.length}개. 고칠 때까지 생성 파일을 바꾸지 않는다.`);
    process.exit(1);
  }
  const text = serialize(generated);
  const summary = `이벤트 ${Object.keys(generated.events).length} · 아이템 ${Object.keys(generated.items).length} · 흔적 ${Object.keys(generated.traits).length}`;
  if (process.argv.includes("--check")) {
    const current = (() => { try { return readFileSync(GENERATED, "utf8"); } catch { return ""; } })();
    if (current !== text) {
      console.error("content.generated.json이 최신이 아니다. npm run build:content를 돌린다.");
      process.exit(1);
    }
    console.log(`최신 (${summary})`);
  } else {
    writeFileSync(GENERATED, text);
    console.log(`${relative(ROOT, GENERATED)}: ${summary}${warnings.length ? `, 경고 ${warnings.length}` : ""}`);
  }
}
