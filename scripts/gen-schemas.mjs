// src/core/types.ts → schemas/*.schema.json (편집기 자동완성·빨간 줄 + build-content의 구조 검증)
// 사용법: npm run gen:schemas
import { createGenerator } from "ts-json-schema-generator";
import { mkdirSync, writeFileSync } from "node:fs";

/** 타입 이름 → 파일 이름. 배열 파일(items.json 등)은 list 래퍼를 따로 만든다 */
const TARGETS = {
  EventDef: { name: "event" },
  ItemDef: { name: "item", list: "items" },
  TraitDef: { name: "trait", list: "traits" },
  EnemyDef: { name: "enemy", list: "enemies" },
};
const DICE_PATTERN = "^\\d+d\\d+([+-]\\d+)?$";

const generator = createGenerator({ path: "src/core/types.ts", tsconfig: "tsconfig.json", skipTypeCheck: true, additionalProperties: false });
mkdirSync("schemas", { recursive: true });

for (const [type, { name, list }] of Object.entries(TARGETS)) {
  const schema = generator.createSchema(type);
  fixDiceExpr(schema);
  // 각 JSON 파일 첫 줄의 "$schema"는 데이터가 아니지만 허용해야 편집기·검증이 빨간 줄을 내지 않는다
  const root = schema.definitions[type];
  if (root.properties) root.properties.$schema = { type: "string" };
  write(`schemas/${name}.schema.json`, schema);
  if (list) write(`schemas/${list}.schema.json`, { $schema: "http://json-schema.org/draft-07/schema#", type: "array", items: { $ref: `${name}.schema.json` } });
}

/** 템플릿 리터럴 타입(DiceExpr)은 생성기가 정확히 옮기지 못하므로 정규식으로 바꾼다 */
function fixDiceExpr(schema) {
  if (schema.definitions?.DiceExpr) schema.definitions.DiceExpr = { type: "string", pattern: DICE_PATTERN };
}

function write(path, json) {
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(path);
}
