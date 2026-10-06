import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, radius, space, TOUCH_MIN } from "@/ui/theme";

/** 임시 타이틀. 6주차에 이어하기·새 게임·기록·설정으로 교체한다. */
export default function TitleScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.titleBox}>
        <Text style={styles.title}>보리울의 30일</Text>
        <Text style={styles.subtitle}>평범한 사람의 서른 날</Text>
      </View>
      <Link href="/dev/dice" asChild>
        <Pressable style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>판정 테스트 (개발용)</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
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
