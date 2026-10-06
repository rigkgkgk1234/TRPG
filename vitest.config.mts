import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 코어(src/core)만 Node에서 테스트한다. RN 컴포넌트는 대상이 아니다.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
