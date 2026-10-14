import type { Href } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGame } from "@/store/gameStore";
import { OrnamentFrame } from "@/ui/components/Ornament";
import { colors, motion, radius, space, TOUCH_MIN, type } from "@/ui/theme";
import { pushOnce } from "@/ui/navigate";
import { Text } from "@/ui/Text";

/** 타이틀. 저장을 다 읽은 뒤에 버튼을 보여 준다 (읽기 전에 "새 게임"만 잠깐 보이지 않게). 설정은 8주차. */
export default function TitleScreen() {
  const insets = useSafeAreaInsets();
  const hydrated = useGame((s) => s.hydrated);
  const resume = useGame((s) => (s.run && !s.run.ending ? `${s.run.player.name}, ${s.run.time.day}일차` : null));
  const notice = useGame((s) => s.notice);
  const dismissNotice = useGame((s) => s.dismissNotice);
  const canResume = resume !== null;
  return (
    <View style={[styles.root, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.titleBox}>
        <Text style={styles.title}>보리울의{"\n"}30일</Text>
      </View>
      <View style={[styles.buttons, !hydrated && styles.hidden]}>
        {notice && (
          <Pressable onPress={dismissNotice} accessibilityRole="button" accessibilityHint="안내 닫기" style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        )}
        {canResume && <TitleButton href="/game" label="이어하기" sub={resume} primary />}
        <TitleButton href="/new-game" label="새 게임" primary={!canResume} />
        <TitleButton href="/records" label="기록" />
        <Pressable onPress={() => pushOnce("/dev/dice")} accessibilityRole="link" style={styles.devLink} hitSlop={8}>
          <Text style={styles.devText}>판정 테스트 (개발용)</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Link asChild는 웹에서 Pressable의 함수형 style을 잃으므로 직접 이동한다 (두 번 눌러도 한 번만). */
function TitleButton({ href, label, sub, primary }: { href: Href; label: string; sub?: string; primary?: boolean }) {
  return (
    <Pressable
      onPress={() => pushOnce(href)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      {primary ? <OrnamentFrame fill={colors.accentSoft} /> : <OrnamentFrame color={colors.borderStrong} />}
      <Text style={styles.buttonText}>{label}</Text>
      {sub ? <Text style={styles.buttonSub}>{sub}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.xl, justifyContent: "space-between" },
  titleBox: { flex: 1, justifyContent: "center", gap: space.lg },
  title: { ...type.display, fontSize: 52, lineHeight: 60, letterSpacing: -1.6, color: colors.text },
  // 버튼 너비는 화면 폭의 85%, 가운데 정렬
  buttons: { gap: space.sm, width: "85%", alignSelf: "center" },
  // 테두리 대신 매듭 틀(OrnamentFrame)로 두른다. 주 버튼은 고른 직업 카드처럼 파란 틀에 옅은 바탕
  button: { minHeight: TOUCH_MIN + 4, alignItems: "center", justifyContent: "center" },
  pressed: { transform: [{ scale: motion.press }] },
  buttonText: { ...type.bodyStrong, color: colors.text },
  hidden: { opacity: 0 },
  buttonSub: { ...type.caption, color: colors.textDim },
  notice: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.badBg, marginBottom: space.xs },
  noticeText: { ...type.caption, color: colors.text },
  devLink: { alignSelf: "center", paddingVertical: space.md },
  devText: { ...type.caption, color: colors.textFaint },
});
