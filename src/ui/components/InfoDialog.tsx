import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Icon } from "@/ui/icons";
import { ActionButton } from "@/ui/components/Buttons";
import { colors, icon as iconToken, radius, space, type } from "@/ui/theme";

export interface InfoSection {
  title: string;
  items: string[];
}

interface InfoDialogProps {
  visible: boolean;
  icon?: Icon;
  title: string;
  /** 제목 아래 한 줄 (직업·역할) */
  subtitle?: string;
  body: string;
  /** "피로 +2"처럼 짧은 사실들 */
  facts?: string[];
  sections?: InfoSection[];
  confirmLabel: string;
  /** 고를 수 없으면 사유를 보여 주고 확인 버튼을 잠근다 */
  lockedReason?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 화면 가운데에 뜨는 안내 창: 고르기 전에 무엇이 있는지 보여 주고, 확인을 눌러야 실행한다.
 * 바깥을 누르거나 "그만둔다"를 누르면 닫힌다.
 */
export function InfoDialog({ visible, icon, title, subtitle, body, facts, sections, confirmLabel, lockedReason, onConfirm, onClose }: InfoDialogProps) {
  return (
    <DialogFrame
      visible={visible}
      onClose={onClose}
      actions={
        <>
          <ActionButton
            primary
            label={confirmLabel}
            detail={lockedReason ?? undefined}
            disabled={!!lockedReason}
            onPress={onConfirm}
          />
          <ActionButton center label="그만둔다" onPress={onClose} />
        </>
      }
    >
      <DialogHead icon={icon} title={title} subtitle={subtitle} />
      <Text lineBreakStrategyIOS="hangul-word" style={styles.body}>{body}</Text>
      {facts && facts.length > 0 && (
        <View style={styles.facts}>
          {facts.map((f) => <Text key={f} style={styles.fact}>{f}</Text>)}
        </View>
      )}
      {sections?.map((s) => (
        <View key={s.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{s.title}</Text>
          {s.items.map((it) => (
            <Text key={it} lineBreakStrategyIOS="hangul-word" style={styles.item}>· {it}</Text>
          ))}
        </View>
      ))}
    </DialogFrame>
  );
}

/**
 * 가운데 창의 틀: 어두운 바탕 + 카드(내용은 스크롤) + 아래 버튼들. 바깥을 누르면 닫힌다.
 * InfoDialog(확인 창)와 마을 창이 같이 쓴다.
 */
export function DialogFrame({ visible, onClose, actions, children }: { visible: boolean; onClose: () => void; actions: React.ReactNode; children: React.ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        {/* 카드 안을 눌러도 닫히지 않게 */}
        <Pressable style={styles.card} onPress={() => {}} accessible={false}>
          <ScrollView contentContainerStyle={styles.content} bounces={false}>
            {children}
          </ScrollView>
          <View style={styles.actions}>{actions}</View>
        </Pressable>
      </Pressable>
    </Modal>
  );
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
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: space.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "86%",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  content: { padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  headText: { flexShrink: 1, gap: 2 },
  title: { ...type.heading, color: colors.text },
  subtitle: { ...type.caption, color: colors.textDim },
  body: { ...type.body, color: colors.text },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  fact: {
    ...type.label,
    color: colors.textDim,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    overflow: "hidden",
  },
  section: { gap: space.xs },
  sectionTitle: { ...type.label, color: colors.textFaint },
  item: { ...type.body, color: colors.textDim },
  actions: { padding: space.lg, paddingTop: 0, gap: space.sm },
});
