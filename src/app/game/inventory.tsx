import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { equippedWeapon, playerDefense } from "@/core/combat/combat";
import { equipBlock, slotOf, type EquipSlot } from "@/core/items/equipment";
import { canUseItem } from "@/core/items/inventory";
import { INVENTORY_CAPACITY } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { Section } from "@/ui/components/Controls";
import { ItemRow, type RowAction } from "@/ui/components/ItemRow";
import { durabilityText, itemSummary } from "@/ui/itemText";
import { colors, radius, space, type } from "@/ui/theme";

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: "무기", armor: "방어구", shield: "방패" };

/**
 * 가방 모달: 걸친 장비(내구도) / 가방 10칸. 걸치기·벗기·쓰기·버리기는 행동 슬롯을 쓰지 않는다.
 * 버리기는 되돌릴 수 없으므로 한 번 더 눌러야 한다.
 */
export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const run = useGame((s) => s.run);
  const send = useGame((s) => s.send);
  const [confirmDiscard, setConfirmDiscard] = useState<number | null>(null);
  if (!run) return null;

  const inv = run.inventory;
  const locked = !!run.combat || !!run.ending;
  const used = inv.slots.filter(Boolean).length;
  const weapon = equippedWeapon(run, CONTENT);

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.figures}>
        <Figure label="방어도" value={String(playerDefense(run, CONTENT, null))} />
        <Figure label="무기 피해" value={weapon.damage} />
        <Figure label="가방" value={`${used}/${INVENTORY_CAPACITY}`} />
      </View>
      {locked && <Text style={styles.note}>싸우는 중에는 가방을 정리할 수 없다.</Text>}

      <Section title="몸에 걸친 것">
        <View>
          {(Object.keys(SLOT_LABEL) as EquipSlot[]).map((slot) => {
            const stack = inv.equipment[slot];
            const def = stack ? CONTENT.items[stack.itemId] : undefined;
            if (!stack || !def) {
              return <ItemRow key={slot} dim title={SLOT_LABEL[slot]} meta={slot === "weapon" ? ["비어 있음", "맨주먹, 피해 1d2"] : ["비어 있음"]} actions={[]} />;
            }
            const dur = durabilityText(def, stack);
            return (
              <ItemRow
                key={slot}
                title={def.name}
                meta={[...itemSummary(def), ...(dur && dur !== "망가짐" ? [dur] : [])]}
                warn={dur === "망가짐" ? "망가짐: 대장간에서 고쳐야 한다" : null}
                actions={[{
                  label: slot === "armor" ? "벗기" : "내려놓기",
                  disabled: locked || used >= INVENTORY_CAPACITY,
                  onPress: () => send({ type: "unequip", slot }),
                }]}
              />
            );
          })}
        </View>
      </Section>

      <Section title="가방" hint={`${INVENTORY_CAPACITY}칸. 같은 물건은 한 칸에 겹친다.`}>
        <View>
          {inv.slots.every((s) => s === null) && <Text style={styles.note}>비어 있다.</Text>}
          {inv.slots.map((stack, i) => {
            if (!stack) return null;
            const def = CONTENT.items[stack.itemId];
            if (!def) return null;
            const actions: RowAction[] = [];
            if (slotOf(def)) {
              const blocked = equipBlock(run, CONTENT, i);
              actions.push({ label: def.category === "armor" ? "입기" : "들기", disabled: locked || !!blocked, onPress: () => send({ type: "equip", slotIndex: i }) });
            }
            if (canUseItem(run, CONTENT, def.id, false)) {
              actions.push({ label: "쓰기", disabled: locked, onPress: () => send({ type: "useItem", itemId: def.id }) });
            }
            if (def.category !== "quest") {
              const confirming = confirmDiscard === i;
              actions.push({
                label: confirming ? "정말 버린다" : "버리기",
                danger: confirming,
                disabled: locked,
                onPress: () => {
                  if (!confirming) return setConfirmDiscard(i);
                  setConfirmDiscard(null);
                  send({ type: "discard", slotIndex: i });
                },
              });
            }
            const dur = durabilityText(def, stack);
            const blocked = slotOf(def) ? equipBlock(run, CONTENT, i) : null;
            return (
              <ItemRow
                key={i}
                title={stack.qty > 1 ? `${def.name} ${stack.qty}개` : def.name}
                meta={[...itemSummary(def), ...(dur && dur !== "망가짐" ? [dur] : [])]}
                warn={dur === "망가짐" ? "망가짐" : blocked && blocked !== "몸에 걸칠 수 있는 물건이 아니다" ? blocked : null}
                actions={actions}
              />
            );
          })}
        </View>
      </Section>
    </ScrollView>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureValue}>{value}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.xl },
  figures: { flexDirection: "row", padding: space.lg, borderRadius: radius.md, backgroundColor: colors.surface },
  figure: { flex: 1, gap: 2, alignItems: "center" },
  figureValue: { ...type.number, color: colors.text },
  figureLabel: { ...type.caption, color: colors.textFaint },
  note: { ...type.caption, color: colors.textDim },
});
