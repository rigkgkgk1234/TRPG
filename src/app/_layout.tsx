import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/ui/theme";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="dev/dice" options={{ title: "판정 테스트" }} />
      </Stack>
    </>
  );
}
