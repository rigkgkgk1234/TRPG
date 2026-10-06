import { router, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGame } from "@/store/gameStore";
import { colors, motion, radius, space, TOUCH_MIN, type } from "@/ui/theme";

/** 임시 타이틀. 6주차에 기록·설정을 더한다. "이어하기"는 저장(5주차) 전까지 앱이 켜져 있는 동안만. */
export default function TitleScreen() {
  const insets = useSafeAreaInsets();
  const canResume = useGame((s) => !!s.run && !s.run.ending);
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.titleBox}>
        <Text style={styles.title}>보리울의{"\n"}30일</Text>
      </View>
      <View style={styles.buttons}>
        {canResume && <TitleButton href="/game" label="이어하기" primary />}
        <TitleButton href="/new-game" label="새 게임" primary={!canResume} />
        <Pressable onPress={() => router.push("/dev/dice")} accessibilityRole="link" style={styles.devLink} hitSlop={8}>
          <Text style={styles.devText}>판정 테스트 (개발용)</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Link asChild는 웹에서 Pressable의 함수형 style을 잃으므로 router.push를 직접 쓴다. */
function TitleButton({ href, label, primary }: { href: Href; label: string; primary?: boolean }) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, primary && styles.primary, pressed && styles.pressed]}
    >
      <Text style={[styles.buttonText, primary && styles.primaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xl, justifyContent: "space-between" },
  titleBox: { flex: 1, justifyContent: "center", gap: space.lg },
  title: { ...type.display, fontSize: 52, lineHeight: 60, letterSpacing: -1.6, color: colors.text },
  buttons: { gap: space.sm },
  button: {
    minHeight: TOUCH_MIN + 4,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.accent },
  pressed: { transform: [{ scale: motion.press }] },
  buttonText: { ...type.bodyStrong, color: colors.text },
  primaryText: { color: colors.accentText },
  devLink: { alignSelf: "center", paddingVertical: space.md },
  devText: { ...type.caption, color: colors.textFaint },
});
