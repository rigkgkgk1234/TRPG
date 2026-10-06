import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors, FONT_FILES, fonts } from "@/ui/theme";

export default function RootLayout() {
  // 글꼴이 오기 전에 그리면 시스템 글꼴로 한 번 깜빡인다. 실패해도 시스템 글꼴로 진행한다.
  const [loaded, error] = useFonts(FONT_FILES);
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
        <Stack.Screen name="dev/dice" options={{ title: "판정 테스트" }} />
      </Stack>
    </>
  );
}
