// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "src/data/content.generated.json"],
  },
  {
    // 코어는 순수 TypeScript: UI·상태 라이브러리를 import하면 안 된다 (docs/ARCHITECTURE.md 0장)
    files: ["src/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react/*", "react-native", "react-native/*", "react-native-*"], message: "src/core에서는 React/RN을 import할 수 없습니다." },
            { group: ["expo", "expo-*", "@expo/*"], message: "src/core에서는 Expo 모듈을 import할 수 없습니다." },
            { group: ["zustand", "zustand/*"], message: "상태 관리는 src/store에서만 다룹니다." },
            { group: ["@/store", "@/store/*", "@/ui", "@/ui/*", "@/app", "@/app/*", "**/store", "**/store/**", "**/ui", "**/ui/**", "**/app", "**/app/**"], message: "코어는 바깥 층(store·ui·app)을 알면 안 됩니다." },
          ],
        },
      ],
    },
  },
]);
