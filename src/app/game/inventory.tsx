import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { equippedWeapon, offHandWeapon, playerDefense } from "@/core/combat/combat";
import { EQUIP_SLOT_LABEL, EQUIP_SLOTS, equipBlock, slotOf, slotsFor, type EquipSlot } from "@/core/items/equipment";
import { canUseItem } from "@/core/items/inventory";
import { INVENTORY_CAPACITY } from "@/core/types";
import { CONTENT } from "@/data";
import type { RunState } from "@/core/types";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { BodyFigure } from "@/ui/components/BodyFigure";
import { PickCell, PickGrid } from "@/ui/components/Controls";
import { DialogFrame, DialogHead, DialogSectionTitle } from "@/ui/components/InfoDialog";
import { ItemRow, type RowAction } from "@/ui/components/ItemRow";
import { durabilityLabel, durabilityText, itemSummary } from "@/ui/itemText";
import { colors, hairline, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

/** "정말 버린다"를 받기 시작하는 시간 */
const CONFIRM_DELAY_MS = 400;

/**
 * 가방 모달: 몸에 걸친 것(사람 그림 + 머리·상체·하체·오른손·왼손·발 칸) / 요약 / 가방 10칸.
 * 칸을 누르면 그 칸에 걸칠 수 있는 물건을 고르거나 벗는 창이 뜬다. 걸치기·벗기·쓰기·버리기는 행동 슬롯을 쓰지 않는다.
 * 버리기는 되돌릴 수 없으므로 한 번 더 눌러야 한다.
 */
export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const run = useGame((s) => s.run);
  const send = useGame((s) => s.send);
  /** "버리기"를 한 번 누른 칸: 같은 물건일 때만 "정말 버린다"로 바뀐다 (칸이 비거나 바뀌면 풀린다) */
  const [confirmDiscard, setConfirmDiscard] = useState<{ slot: number; itemId: string; at: number } | null>(null);
  /** 고르기 창을 연 장비 칸 */
  const [picking, setPicking] = useState<EquipSlot | null>(null);
  if (!run) return null;

  const inv = run.inventory;
  const locked = !!run.combat || !!run.ending;
  const used = inv.slots.filter(Boolean).length;
  const weapon = equippedWeapon(run, CONTENT);
  const off = offHandWeapon(run, CONTENT);

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
      <View style={styles.doll}>
        <BodyFigure />
        <View style={styles.slotList}>
          {EQUIP_SLOTS.map((slot) => <SlotCell key={slot} run={run} slot={slot} onPress={() => setPicking(slot)} />)}
        </View>
      </View>
      {locked && <Text style={styles.note}>싸우는 중에는 장비를 바꿀 수 없다.</Text>}

      <View style={styles.figures}>
        <Figure label="방어도" value={String(playerDefense(run, CONTENT, null))} />
        <Figure label="무기 피해" value={off ? `${weapon.damage} + ${off.damage}` : weapon.damage} />
        <Figure label="가방" value={`${used}/${INVENTORY_CAPACITY}`} />
      </View>

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
            const confirming = confirmDiscard?.slot === i && confirmDiscard.itemId === stack.itemId;
            actions.push({
              label: confirming ? "정말 버린다" : "버리기",
              danger: confirming,
              disabled: locked,
              onPress: () => {
                if (!confirming) return setConfirmDiscard({ slot: i, itemId: stack.itemId, at: Date.now() });
                // 두 번 빠르게 누르면 확인 없이 버려지므로, 확인 버튼은 잠깐 뒤부터 받는다
                if (Date.now() - confirmDiscard.at < CONFIRM_DELAY_MS) return;
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
              meta={[...itemSummary(def), ...(durabilityLabel(def, stack) ? [durabilityLabel(def, stack)!] : [])]}
              warn={dur === "망가짐" ? "망가짐" : blocked && blocked !== "몸에 걸칠 수 있는 물건이 아니다" ? blocked : null}
              actions={actions}
            />
          );
        })}
      </View>

      {picking && <SlotDialog run={run} slot={picking} locked={locked} onClose={() => setPicking(null)} />}
    </ScrollView>
  );
}

/** 장비 칸 하나: "머리" / 걸친 것 이름 / 성능 한 줄. 누르면 고르기 창 */
function SlotCell({ run, slot, onPress }: { run: RunState; slot: EquipSlot; onPress: () => void }) {
  const stack = run.inventory.equipment[slot];
  const def = stack ? CONTENT.items[stack.itemId] : undefined;
  const dur = def && stack ? durabilityText(def, stack) : null;
  // 성능 한 가지 + 내구도 (망가졌으면 망가짐을 먼저)
  const durLabel = def ? durabilityLabel(def, stack) : null;
  const sub = def
    ? [...(dur === "망가짐" ? ["망가짐"] : []), itemSummary(def).find((x) => x.startsWith("피해") || x.startsWith("방어도")) ?? itemSummary(def)[0], ...(durLabel ? [durLabel] : [])].filter(Boolean).join(", ")
    : slot === "weapon" ? "맨주먹, 피해 1d2" : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${EQUIP_SLOT_LABEL[slot]}: ${def?.name ?? "비어 있음"}`}
      style={({ pressed }) => [styles.slot, pressed && styles.slotPressed]}
    >
      <Text style={styles.slotLabel}>{EQUIP_SLOT_LABEL[slot]}</Text>
      <View style={styles.slotText}>
        <Text style={[styles.slotName, !def && styles.slotEmpty]} numberOfLines={1}>{def?.name ?? "비어 있음"}</Text>
        {sub ? <Text style={[styles.slotSub, dur === "망가짐" && styles.slotBroken]} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** 칸을 누르면 뜨는 창: 지금 걸친 것(벗기) + 가방에서 이 칸에 걸칠 수 있는 것 (누르면 걸친다) */
function SlotDialog({ run, slot, locked, onClose }: { run: RunState; slot: EquipSlot; locked: boolean; onClose: () => void }) {
  const send = useGame((s) => s.send);
  const inv = run.inventory;
  const stack = inv.equipment[slot];
  const def = stack ? CONTENT.items[stack.itemId] : undefined;
  const bagFull = inv.slots.every((s) => s !== null);
  const candidates = inv.slots.flatMap((s, i) => {
    const d = s ? CONTENT.items[s.itemId] : undefined;
    return s && d && slotsFor(d).includes(slot) ? [{ i, d, s }] : [];
  });
  const takeOff = slot === "weapon" || slot === "offHand" ? "내려놓기" : "벗기";
  return (
    <DialogFrame visible onClose={onClose} actions={<ActionButton center label="닫기" onPress={onClose} />}>
      <DialogHead title={`${EQUIP_SLOT_LABEL[slot]}`} subtitle={def ? `지금: ${def.name}` : "비어 있음"} />
      {def && stack ? (
        <View style={styles.dialogSection}>
          <DialogSectionTitle>걸친 것</DialogSectionTitle>
          <PickCell
            wide
            label={`${def.name} ${takeOff}`}
            sub={[...itemSummary(def), ...(durabilityLabel(def, stack) ? [durabilityLabel(def, stack)!] : [])].join(", ")}
            reason={locked ? "싸우는 중에는 바꿀 수 없다" : bagFull ? "가방에 자리가 없다" : undefined}
            disabled={locked || bagFull}
            onPress={() => {
              send({ type: "unequip", slot });
              onClose();
            }}
          />
        </View>
      ) : null}
      {candidates.length > 0 && (
        <View style={styles.dialogSection}>
          <DialogSectionTitle>가방에서 고르기</DialogSectionTitle>
          <PickGrid>
            {candidates.map(({ i, d, s }) => {
              const blocked = locked ? "싸우는 중에는 바꿀 수 없다" : equipBlock(run, CONTENT, i, slot);
              const dur = durabilityLabel(d, s);
              return (
                <PickCell
                  key={i}
                  wide
                  label={d.name}
                  sub={[...itemSummary(d), ...(dur ? [dur] : [])].join(", ")}
                  reason={blocked ?? undefined}
                  disabled={!!blocked}
                  onPress={() => {
                    send({ type: "equip", slotIndex: i, to: slot });
                    onClose();
                  }}
                />
              );
            })}
          </PickGrid>
        </View>
      )}
    </DialogFrame>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.figure}>
      <Text style={styles.figureLabel}>{label}</Text>
      <Text style={styles.figureValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.xl },
  figures: { flexDirection: "row", paddingVertical: space.lg, borderTopWidth: hairline, borderBottomWidth: hairline, borderColor: colors.border },
  // 상태 창 위 요약과 같은 모양: 이름을 위에 크게, 값을 아래에 작게, 가운데 정렬
  figure: { flex: 1, gap: 2 },
  figureLabel: { ...type.number, fontVariant: undefined, color: colors.text, textAlign: "center" },
  figureValue: { ...type.caption, color: colors.text, textAlign: "center" },
  note: { ...type.caption, color: colors.textDim },
  // 그림과 칸을 가운데로 모은다 (칸이 화면 끝까지 늘어나지 않게)
  doll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xl },
  slotList: { width: 200, gap: space.xs + 2 },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    minHeight: 48,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.md,
    borderWidth: hairline,
    borderColor: colors.borderStrong,
  },
  slotPressed: { backgroundColor: colors.surfaceRaised },
  slotLabel: { ...type.label, color: colors.textFaint, width: 38 },
  slotText: { flex: 1, gap: 1 },
  slotName: { ...type.bodyStrong, color: colors.text },
  slotEmpty: { color: colors.textFaint, fontFamily: type.body.fontFamily },
  slotSub: { ...type.caption, color: colors.textDim },
  slotBroken: { color: colors.fail },
  dialogSection: { gap: space.sm },
});
