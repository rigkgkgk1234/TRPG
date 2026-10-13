import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { canUseItem } from "@/core/items/inventory";
import { hasRoom } from "@/core/items/shop";
import { INVENTORY_CAPACITY, type ItemStack, type RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonStack } from "@/ui/components/Buttons";
import { ItemRow, type RowAction } from "@/ui/components/ItemRow";
import { BackpackIcon, SignOutIcon } from "@/ui/icons";
import { durabilityLabel, itemSummary } from "@/ui/itemText";
import { colors, hairline, icon, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";
import { useDiscardConfirm } from "@/ui/useDiscardConfirm";

/**
 * 가방이 가득 차 넣지 못한 물건이 있을 때 아래 패널 자리에 뜨는 정리 창. (SYSTEM_SPEC 5-2)
 * 들어온 물건은 "넣기", 가방 물건은 "쓰기"·"버리기"로 자리를 만든다. 정리가 끝나거나 "두고 간다"를 누를 때까지 다른 행동은 잠긴다.
 */
export function OverflowPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const discardAction = useDiscardConfirm((slotIndex) => send({ type: "discard", slotIndex }));
  const used = run.inventory.slots.filter(Boolean).length;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <BackpackIcon size={icon.md} weight={icon.weight} color={colors.textDim} />
        <Text style={styles.title}>가방이 가득 찼다</Text>
        <Text style={styles.count}>{used}/{INVENTORY_CAPACITY}칸</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <Text style={styles.section}>넣지 못한 물건</Text>
        {run.overflow.map((stack, i) => {
          const def = CONTENT.items[stack.itemId];
          if (!def) return null;
          return (
            <ItemRow
              key={`o${i}`}
              title={titleOf(def.name, stack)}
              meta={metaOf(stack)}
              actions={[{ label: "넣기", disabled: !hasRoom(run, def, 1), onPress: () => send({ type: "takeOverflow", index: i }) }]}
            />
          );
        })}

        <Text style={styles.section}>가방</Text>
        {run.inventory.slots.map((stack, i) => {
          const def = stack && CONTENT.items[stack.itemId];
          if (!stack || !def) return null;
          const actions: RowAction[] = [];
          if (canUseItem(run, CONTENT, def.id, false)) actions.push({ label: "쓰기", onPress: () => send({ type: "useItem", itemId: def.id }) });
          if (def.category !== "quest") actions.push(discardAction(i, stack.itemId));
          return <ItemRow key={`b${i}`} title={titleOf(def.name, stack)} meta={metaOf(stack)} actions={actions} />;
        })}

      </ScrollView>
      {/* 목록이 길어도 늘 보이게 스크롤 밖 맨 아래에 둔다 */}
      <View style={[styles.leave, { paddingBottom: insets.bottom + space.md }]}>
        <ButtonStack>
          <ActionButton icon={SignOutIcon} label="나머지는 두고 간다" onPress={() => send({ type: "leaveOverflow" })} />
        </ButtonStack>
      </View>
    </View>
  );
}

const titleOf = (name: string, stack: ItemStack) => (stack.qty > 1 ? `${name} ${stack.qty}개` : name);

function metaOf(stack: ItemStack): string[] {
  const def = CONTENT.items[stack.itemId]!;
  const dur = durabilityLabel(def, stack);
  return [...itemSummary(def), ...(dur ? [dur] : [])];
}

const styles = StyleSheet.create({
  // 이벤트 창과 같은 자리·모양: 글이 길면 제목 아래가 스크롤된다
  panel: {
    flexShrink: 1,
    paddingTop: space.lg,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderColor: colors.borderStrong,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg },
  title: { ...type.heading, color: colors.text, flexShrink: 1 },
  count: { ...type.label, color: colors.textFaint, marginLeft: "auto", fontVariant: ["tabular-nums"] },
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  section: { ...type.overline, color: colors.textFaint, marginTop: space.sm },
  leave: { paddingHorizontal: space.lg, borderTopWidth: hairline, borderColor: colors.border },
});
