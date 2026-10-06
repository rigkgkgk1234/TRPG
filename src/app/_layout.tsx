import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { useGame } from "@/store/gameStore";
import { colors, FONT_FILES, fonts } from "@/ui/theme";

export default function RootLayout() {
  // 글꼴이 오기 전에 그리면 시스템 글꼴로 한 번 깜빡인다. 실패해도 시스템 글꼴로 진행한다.
  const [loaded, error] = useFonts(FONT_FILES);

  // 앱을 켜면 저장된 회차를 읽고, 앱이 뒤로 가면 저장한다 (OS가 예고 없이 앱을 끌 수 있다)
  useEffect(() => {
    void useGame.getState().hydrate();
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
        <Stack.Screen name="dev/dice" options={{ title: "판정 테스트" }} />
      </Stack>
    </>
  );
}
