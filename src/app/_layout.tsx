import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { useGame } from "@/store/gameStore";
import { useMeta } from "@/store/metaStore";
import { colors, FONT_FILES, fonts } from "@/ui/theme";

/**
 * 웹 브라우저는 한국어를 글자 단위로 줄바꿈해 "모으\n고"처럼 낱말이 쪼개진다.
 * 낱말 단위로 바꾸고(keep-all), 한 낱말이 칸보다 길 때만 쪼갠다. (앱에서는 @/ui/Text가 글자 사이에 단어 이음표를 넣어 같은 효과를 낸다)
 */
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = "div, span { word-break: keep-all; overflow-wrap: break-word; }";
  document.head.appendChild(style);
}

export default function RootLayout() {
  // 글꼴이 오기 전에 그리면 시스템 글꼴로 한 번 깜빡인다. 실패해도 시스템 글꼴로 진행한다.
  const [loaded, error] = useFonts(FONT_FILES);

  // 앱을 켜면 저장된 회차를 읽고, 앱이 뒤로 가면 저장한다 (OS가 예고 없이 앱을 끌 수 있다)
  useEffect(() => {
    void useGame.getState().hydrate();
    void useMeta.getState().hydrate();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") useGame.getState().flush();
    });
    return () => sub.remove();
  }, []);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontFamily: fonts.semibold, fontSize: 17 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="new-game" options={{ title: "새 게임" }} />
        <Stack.Screen name="game/index" options={{ headerShown: false }} />
        <Stack.Screen name="game/status" options={{ title: "상태", presentation: "modal" }} />
        <Stack.Screen name="game/inventory" options={{ title: "가방", presentation: "modal" }} />
        <Stack.Screen name="game/town" options={{ title: "마을", presentation: "modal" }} />
        <Stack.Screen name="records" options={{ title: "기록" }} />
        <Stack.Screen name="dev/dice" options={{ title: "판정 테스트" }} />
      </Stack>
    </>
  );
}
