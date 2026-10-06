// docs/SYSTEM_SPEC.md 의 ```ts 코드 블록을 모아 src/core/types.ts 를 생성한다.
// 사용법: node scripts/extract-types.mjs
import { readFileSync, writeFileSync } from "node:fs";

const SPEC = "docs/SYSTEM_SPEC.md";
const OUT = "src/core/types.ts";

const md = readFileSync(SPEC, "utf8");
const blocks = [...md.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1].trimEnd());

const header = `// 이 파일은 ${SPEC} 에서 자동 생성된다. 직접 수정하지 말 것.\n// 재생성: node scripts/extract-types.mjs\n`;
writeFileSync(OUT, header + "\n" + blocks.join("\n\n") + "\n");
console.log(`${OUT}: ${blocks.length} blocks`);
