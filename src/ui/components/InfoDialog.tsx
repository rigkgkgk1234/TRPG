import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Icon } from "@/ui/icons";
import { colors, hairline, icon as iconToken, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

/**
 * 가운데 창의 틀: 어두운 바탕 + 카드(내용은 스크롤) + 아래 버튼들. 바깥을 누르면 닫힌다.
 * 가방의 장비 칸 고르기 창이 쓴다.
 */
export function DialogFrame({ visible, onClose, actions, children }: { visible: boolean; onClose: () => void; actions: React.ReactNode; children: React.ReactNode }) {
  const ready = useSettled();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={ready ? onClose : undefined} accessibilityLabel="닫기">
        {/* 카드 안을 눌러도 닫히지 않게 */}
        <Pressable style={styles.card} onPress={() => {}} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            {children}
          </ScrollView>
          <View style={styles.actions}>{actions}</View>
          {/* 막 열린 창은 잠깐 누름을 받지 않는다: 창을 연 버튼을 두 번 누르면 두 번째 누름이 이 창의 버튼에 떨어진다 */}
          {!ready && <View style={StyleSheet.absoluteFill} />}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** 창이 열리고 나서 누름을 받기까지의 시간 */
const SETTLE_MS = 350;

function useSettled(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, []);
  return ready;
}

/** 창 머리: 아이콘 + 제목 + 한 줄 설명 */
export function DialogHead({ icon: IconC, title, subtitle }: { icon?: Icon; title: string; subtitle?: string }) {
  return (
    <View style={styles.head}>
      {IconC && <IconC size={iconToken.lg} weight={iconToken.weight} color={colors.accent} />}
      <View style={styles.headText}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

/** 창 안의 작은 제목 ("가게", "사람 찾아가기") */
export function DialogSectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.66)",
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "86%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  content: { padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  headText: { flexShrink: 1, gap: 2 },
  title: { ...type.heading, color: colors.text },
  subtitle: { ...type.caption, color: colors.textDim },
  sectionTitle: { ...type.overline, color: colors.textFaint },
  actions: { padding: space.lg, paddingTop: 0, gap: space.sm },
});
