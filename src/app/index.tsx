import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGame } from "@/store/gameStore";
import { colors, font, radius, space, TOUCH_MIN } from "@/ui/theme";

/** 임시 타이틀. 6주차에 기록·설정을 더한다. "이어하기"는 저장(5주차) 전까지 앱이 켜져 있는 동안만. */
export default function TitleScreen() {
  const insets = useSafeAreaInsets();
  const canResume = useGame((s) => !!s.run && !s.run.ending);
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.titleBox}>
        <Text style={styles.title}>보리울의 30일</Text>
        <Text style={styles.subtitle}>평범한 사람의 서른 날</Text>
      </View>
      <View style={styles.buttons}>
        {canResume && <TitleButton href="/game" label="이어하기" />}
        <TitleButton href="/new-game" label="새 게임" />
        <TitleButton href="/dev/dice" label="판정 테스트 (개발용)" />
      </View>
    </View>
  );
}

/** Link asChild는 웹에서 Pressable의 함수형 style을 잃으므로 router.push를 직접 쓴다. */
function TitleButton({ href, label }: { href: Href; label: string }) {
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: space.sm },
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg, justifyContent: "space-between" },
  titleBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: space.sm },
  title: { color: colors.text, fontSize: 32, fontWeight: "700" },
  subtitle: { color: colors.textDim, fontSize: font.md },
  button: {
    minHeight: TOUCH_MIN,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  buttonText: { color: colors.text, fontSize: font.md },
});
