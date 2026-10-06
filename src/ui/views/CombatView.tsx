import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { combatView, type CombatActionView, type CombatView } from "@/core/combat/combat";
import { MODE_LABEL } from "@/core/labels";
import type { CombatAction, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { Chip, ChipRow } from "@/ui/components/Controls";
import { CrosshairIcon, FirstAidKitIcon, PersonSimpleRunIcon, ShieldIcon, SwordIcon, type Icon } from "@/ui/icons";
import { colors, icon, radius, space, type } from "@/ui/theme";

const ACTION_ICON: Record<CombatActionView["type"], Icon> = {
  attack: SwordIcon,
  powerAttack: CrosshairIcon,
  defend: ShieldIcon,
  useItem: FirstAidKitIcon,
  flee: PersonSimpleRunIcon,
};

/**
 * 전투 패널: 적 상태(HP 막대) → 내 방어도 → 행동 버튼. 적이 여럿이면 눌러서 대상을 고른다.
 * 굴림과 피해는 위쪽 결과 카드가 한 줄씩 보여 준다. (SYSTEM_SPEC 3장)
 */
export function CombatPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const [targetId, setTargetId] = useState<string | undefined>();
  const [pickingItem, setPickingItem] = useState(false);
  const view = combatView(run, CONTENT, targetId);
  if (!view) return null;

  const title = run.activeEvent ? CONTENT.events[run.activeEvent.eventId]?.title : undefined;
  const act = (action: CombatAction) => {
    setPickingItem(false);
    send({ type: "combat", action });
  };
  const choose = (a: CombatActionView) => {
    switch (a.type) {
      case "attack":
      case "powerAttack":
        if (view.targetId) act({ type: a.type, targetId: view.targetId });
        return;
      case "defend": return act({ type: "defend" });
      case "flee": return act({ type: "flee" });
      case "useItem":
        // 쓸 것이 하나뿐이면 바로 쓴다
        if (view.items.length === 1) act({ type: "useItem", itemId: view.items[0].itemId });
        else setPickingItem(!pickingItem);
    }
  };

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.header}>
        <SwordIcon size={icon.md} weight={icon.weight} color={colors.fail} />
        <Text style={styles.title} numberOfLines={1}>{title ?? "전투"}</Text>
        <Text style={styles.round}>{view.round}라운드</Text>
      </View>

      <Enemies view={view} onSelect={setTargetId} />
      <Text style={styles.defense}>내 방어도 <Text style={styles.defenseValue}>{view.defense}</Text></Text>

      {pickingItem && (
        <View style={styles.picker}>
          <Text style={styles.pickerTitle}>무엇을 쓸까?</Text>
          <ChipRow>
            {view.items.map((i) => (
              <Chip key={i.itemId} label={`${i.name} ${i.qty}개`} selected={false} onPress={() => act({ type: "useItem", itemId: i.itemId })} />
            ))}
          </ChipRow>
        </View>
      )}

      <ButtonGrid>
        {view.actions.map((a) => (
          <GridCell key={a.type}>
            <ActionButton
              icon={ACTION_ICON[a.type]}
              label={a.label}
              badge={!a.lockedReason && a.chance !== undefined ? `${Math.round(a.chance * 100)}%` : undefined}
              detail={a.lockedReason ?? [...a.detail, ...(a.mode && a.mode !== "normal" ? [MODE_LABEL[a.mode]] : [])]}
              disabled={a.lockedReason !== null}
              selected={a.type === "useItem" && pickingItem}
              onPress={() => choose(a)}
            />
          </GridCell>
        ))}
      </ButtonGrid>
    </View>
  );
}

function Enemies({ view, onSelect }: { view: CombatView; onSelect: (id: string) => void }) {
  const active = view.enemies.filter((e) => e.state === "active");
  const selectable = active.length > 1;
  return (
    <View style={styles.enemies}>
      {view.enemies.map((e) => {
        const selected = selectable && e.id === view.targetId;
        const out = e.state !== "active";
        return (
          <Pressable
            key={e.id}
            onPress={() => onSelect(e.id)}
            disabled={!selectable || out}
            accessibilityRole={selectable ? "button" : undefined}
            accessibilityLabel={`${e.name} HP ${e.hp}/${e.maxHp}`}
            accessibilityState={{ selected }}
            style={[styles.enemy, selected && styles.enemySelected, out && styles.enemyOut]}
          >
            <View style={styles.enemyHead}>
              <Text style={styles.enemyName}>{e.name}</Text>
              <Text style={styles.enemyHp}>
                {e.state === "down" ? "쓰러짐" : e.state === "routed" ? "달아남" : `HP ${e.hp}/${e.maxHp}`}
              </Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${(e.hp / e.maxHp) * 100}%`, backgroundColor: e.hp <= e.maxHp / 2 ? colors.partial : colors.fail }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg + 4,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.heading, color: colors.text, flexShrink: 1 },
  round: { ...type.label, color: colors.textFaint, marginLeft: "auto", fontVariant: ["tabular-nums"] },
  enemies: { gap: space.sm },
  enemy: {
    gap: space.xs + 2,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
  },
  enemySelected: { borderColor: colors.accent },
  enemyOut: { opacity: 0.45 },
  enemyHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  enemyName: { ...type.bodyStrong, color: colors.text },
  enemyHp: { ...type.label, color: colors.textDim, fontVariant: ["tabular-nums"] },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.pill },
  defense: { ...type.label, color: colors.textDim },
  defenseValue: { ...type.label, color: colors.text, fontVariant: ["tabular-nums"] },
  picker: { gap: space.sm },
  pickerTitle: { ...type.label, color: colors.textDim },
});
