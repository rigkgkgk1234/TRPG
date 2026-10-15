import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { equippedWeapon, offHandWeapon, playerDefense } from "@/core/combat/combat";
import { josa } from "@/core/labels";
import { autoEquipSlot, EQUIP_SLOT_LABEL, EQUIP_SLOTS, equipBlock, slotsFor, type EquipSlot } from "@/core/items/equipment";
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
import { durabilityLabel, durabilityText, INFO_SEP, itemSummary } from "@/ui/itemText";
import { colors, hairline, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";
import { useDiscardConfirm } from "@/ui/useDiscardConfirm";

/**
 * 가방 모달: 몸에 걸친 것(사람 그림 + 머리·상체·하체·오른손·왼손·발 칸) / 요약 / 가방 10칸.
 * 칸을 누르면 그 칸에 걸칠 수 있는 물건을 고르거나 벗는 창이 뜬다. 걸치기·벗기·쓰기·버리기는 행동 슬롯을 쓰지 않는다.
 * 버리기는 되돌릴 수 없으므로 한 번 더 눌러야 한다.
 */
export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const run = useGame((s) => s.run);
  const send = useGame((s) => s.send);
  const discardAction = useDiscardConfirm((slotIndex) => send({ type: "discard", slotIndex }));
  /** 고르기 창을 연 장비 칸 */
  const [picking, setPicking] = useState<EquipSlot | null>(null);
  /** 두 손이 다 찬 채로 한 손 무기를 장착하려 할 때 어느 손인지 묻는 창 (가방 칸 번호) */
  const [handFor, setHandFor] = useState<number | null>(null);
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
          // 한 손 무기는 오른손이 차 있으면 왼손으로, 두 손이 다 차 있으면 어느 손인지 묻는다
          const auto = autoEquipSlot(run, CONTENT, def);
          const blocked = auto && auto !== "ask" ? equipBlock(run, CONTENT, i, auto) : null;
          if (auto) {
            actions.push({
              label: "장착",
              disabled: locked || !!blocked,
              onPress: () => (auto === "ask" ? setHandFor(i) : send({ type: "equip", slotIndex: i, to: auto })),
            });
          }
          if (canUseItem(run, CONTENT, def.id, false)) {
            actions.push({ label: "쓰기", disabled: locked, onPress: () => send({ type: "useItem", itemId: def.id }) });
          }
          if (def.category !== "quest") actions.push(discardAction(i, stack.itemId, locked));
          const dur = durabilityText(def, stack);
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
      {handFor !== null && <HandDialog run={run} slotIndex={handFor} onClose={() => setHandFor(null)} />}
    </ScrollView>
  );
}

/** 장비 칸 하나: "머리" / 걸친 것 이름 / 성능 한 줄. 누르면 고르기 창 */
function SlotCell({ run, slot, onPress }: { run: RunState; slot: EquipSlot; onPress: () => void }) {
  const mainStack = run.inventory.equipment.weapon;
  const mainDef = mainStack ? CONTENT.items[mainStack.itemId] : undefined;
  // 양손 무기를 들면 왼손은 쓸 수 없다: 칸을 흐리게 하고 누를 수 없게 한다
  if (slot === "offHand" && mainDef?.category === "weapon" && mainDef.twoHanded) {
    return (
      <View
        accessible
        accessibilityLabel={`${EQUIP_SLOT_LABEL[slot]}: ${mainDef.name}, 양손 무기 장착함`}
        accessibilityState={{ disabled: true }}
        style={[styles.slot, styles.slotLocked]}
      >
        <Text style={styles.slotLabel}>{EQUIP_SLOT_LABEL[slot]}</Text>
        <View style={styles.slotText}>
          <Text style={styles.slotName} numberOfLines={1}>{mainDef.name}</Text>
          <Text style={styles.slotSub} numberOfLines={2}>양손 무기 장착함</Text>
        </View>
      </View>
    );
  }
  const stack = run.inventory.equipment[slot];
  const def = stack ? CONTENT.items[stack.itemId] : undefined;
  const dur = def && stack ? durabilityText(def, stack) : null;
  // 성능 한 가지 + 내구도 (망가졌으면 망가짐을 먼저)
  const durLabel = def ? durabilityLabel(def, stack) : null;
  const sub = def
    ? [...(dur === "망가짐" ? ["망가짐"] : []), itemSummary(def).find((x) => x.startsWith("피해") || x.startsWith("방어도")) ?? itemSummary(def)[0], ...(durLabel ? [durLabel] : [])].filter(Boolean).join(INFO_SEP)
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
            sub={[...itemSummary(def), ...(durabilityLabel(def, stack) ? [durabilityLabel(def, stack)!] : [])].join(INFO_SEP)}
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
                  sub={[...itemSummary(d), ...(dur ? [dur] : [])].join(INFO_SEP)}
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

/** 두 손이 다 찬 채로 한 손 무기를 장착할 때: 오른손·왼손 중 고르면 그 손에 든 것은 가방으로 */
function HandDialog({ run, slotIndex, onClose }: { run: RunState; slotIndex: number; onClose: () => void }) {
  const send = useGame((s) => s.send);
  const stack = run.inventory.slots[slotIndex];
  const def = stack ? CONTENT.items[stack.itemId] : undefined;
  if (!def) return null;
  const hand = (slot: EquipSlot) => {
    const held = run.inventory.equipment[slot];
    const heldDef = held ? CONTENT.items[held.itemId] : undefined;
    const blocked = equipBlock(run, CONTENT, slotIndex, slot);
    return (
      <PickCell
        key={slot}
        wide
        label={EQUIP_SLOT_LABEL[slot]}
        sub={heldDef ? `${josa(heldDef.name, "과/와")} 교체` : "비어 있음"}
        reason={blocked ?? undefined}
        disabled={!!blocked}
        onPress={() => {
          send({ type: "equip", slotIndex, to: slot });
          onClose();
        }}
      />
    );
  };
  return (
    <DialogFrame visible onClose={onClose} actions={<ActionButton center label="닫기" onPress={onClose} />}>
      <DialogHead title={`${def.name} 장착`} subtitle="어느 손에 장착할까?" />
      <PickGrid>{(["weapon", "offHand"] as const).map(hand)}</PickGrid>
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
  slotLocked: { opacity: 0.55 },
  slotLabel: { ...type.label, color: colors.textFaint, width: 38 },
  slotText: { flex: 1, gap: 1 },
  slotName: { ...type.bodyStrong, color: colors.text },
  slotEmpty: { color: colors.textFaint, fontFamily: type.body.fontFamily },
  slotSub: { ...type.caption, color: colors.textDim },
  slotBroken: { color: colors.fail },
  dialogSection: { gap: space.sm },
});
