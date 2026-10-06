import { memo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { FeedItem } from "@/core/commands";
import type { LogGroup } from "@/store/gameStore";
import { feedLines } from "@/ui/feedText";
import { colors, font, space } from "@/ui/theme";

/** 최근 기록. 명령 하나가 한 묶음이고, 새 묶음이 위에 온다. 방금 묶음만 또렷하게. */
export function FeedLog({ log, empty }: { log: LogGroup[]; empty: string }) {
  const groups = [...log].reverse();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {groups.length === 0 && empty ? <Text style={styles.empty}>{empty}</Text> : null}
      {groups.map((g, i) => <FeedGroup key={g.id} items={g.items} old={i > 0} />)}
    </ScrollView>
  );
}

/** 묶음 내용은 바뀌지 않으므로 새 묶음이 들어와도 다시 계산하지 않는다. */
const FeedGroup = memo(function FeedGroup({ items, old }: { items: FeedItem[]; old: boolean }) {
  return (
    <View style={[styles.group, old && styles.old]}>
      {feedLines(items).map((l, i) => (
        <Text key={i} style={[styles.line, { color: l.color }]}>{l.text}</Text>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: space.lg, gap: space.md },
  group: { gap: 2 },
  old: { opacity: 0.45 },
  line: { fontSize: font.md, lineHeight: 22 },
  empty: { color: colors.textDim, fontSize: font.md, lineHeight: 22 },
});
