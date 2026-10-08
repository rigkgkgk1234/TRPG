import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { combatView, type CombatActionView, type CombatView } from "@/core/combat/combat";
import { MODE_LABEL } from "@/core/labels";
import type { CombatAction, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { Chip, ChipRow } from "@/ui/components/Controls";
import { CrosshairIcon, FirstAidKitIcon, PersonSimpleRunIcon, ShieldIcon, SwordIcon, type Icon } from "@/ui/icons";
import { chanceBadgeProps } from "@/ui/rollText";
import { colors, icon, radius, space, type } from "@/ui/theme";

const ACTION_ICON: Record<CombatActionView["type"], Icon> = {
  attack: SwordIcon,
  powerAttack: CrosshairIcon,
  defend: ShieldIcon,
  useItem: FirstAidKitIcon,
  flee: PersonSimpleRunIcon,
};

/** 적 한 줄의 높이: 칸(위아래 여백 10 + 글 24 + 테두리 2) + 간격 8. 적 칸은 적 수만큼(최대 3줄) 높이를 고정하고, 넘치면 그 안에서 스크롤 */
const ENEMY_ROW = 54;
const MAX_VISIBLE_ENEMIES = 3;
/** 아이템 고르기 줄(제목 18 + 간격 8 + 칩 36): 고를 것이 여럿이면 적 칸이 적어도 이만큼은 된다 */
const PICKER_HEIGHT = 62;

/**
 * 전투 패널: 적 상태(HP 막대) → 내 방어도 → 행동 버튼. 적이 여럿이면 눌러서 대상을 고른다.
 * 굴림과 피해는 위쪽 결과 카드가 한 줄씩 보여 준다. (SYSTEM_SPEC 3장)
 * 높이는 전투 내내 고정: 적 칸은 적 수로 정하고, 버튼 설명 줄이 늘어 커진 적이 있으면 그 높이를 유지한다 (줄지 않음).
 * 그래서 위쪽 결과 카드 글이 바뀌어도, 버튼 글이 바뀌어도 HP 막대와 버튼이 움직이지 않는다.
 */
export function CombatPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const [targetId, setTargetId] = useState<string | undefined>();
  const [pickingItem, setPickingItem] = useState(false);
  const [minHeight, setMinHeight] = useState(0);
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

  const isWide = (i: number) => i === view.actions.length - 1 && view.actions.length % 2 === 1;
  const enemyRows = Math.max(1, Math.min(view.enemies.length, MAX_VISIBLE_ENEMIES));
  const bodyHeight = Math.max(enemyRows * ENEMY_ROW - space.sm, view.items.length > 1 ? PICKER_HEIGHT : 0);
  const keepTallest = (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h > minHeight) setMinHeight(h);
  };

  return (
    <View onLayout={keepTallest} style={[styles.panel, { minHeight, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.top}>
        <View style={styles.header}>
          <SwordIcon size={icon.md} weight={icon.weight} color={colors.fail} />
          <Text style={styles.title} numberOfLines={1}>{title ?? "전투"}</Text>
          <Text style={styles.round}>{view.round}라운드, 내 방어도 <Text style={styles.defenseValue}>{view.defense}</Text></Text>
        </View>

        {/* 적 칸은 높이 고정(넘치면 스크롤). 아이템을 고르는 동안은 그 자리에 고를 것을 보여 준다 */}
        <ScrollView style={[styles.body, { height: bodyHeight }]} contentContainerStyle={styles.bodyContent} bounces={false}>
          {!pickingItem ? <Enemies view={view} onSelect={setTargetId} /> : (
            <View style={styles.picker}>
              <Text style={styles.pickerTitle}>무엇을 쓸까?</Text>
              <ChipRow>
                {view.items.map((i) => (
                  <Chip key={i.itemId} label={`${i.name} ${i.qty}개`} selected={false} onPress={() => act({ type: "useItem", itemId: i.itemId })} />
                ))}
              </ChipRow>
            </View>
          )}
        </ScrollView>
      </View>

      <ButtonGrid>
        {view.actions.map((a, i) => (
          // 홀수 개면 마지막 칸(보통 도주)이 한 줄을 다 쓰고, 넓으니 확률은 오른쪽에 둔다
          <GridCell key={a.type} full={isWide(i)}>
            <ActionButton
              fill
              badgeBelow={!isWide(i)}
              icon={ACTION_ICON[a.type]}
              label={a.label}
              {...(!a.lockedReason && a.chance !== undefined ? chanceBadgeProps(a.chance, a.need) : {})}
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
            {/* 이름, HP 막대, 숫자를 한 줄에: 칸 높이가 늘 같다 */}
            <Text style={styles.enemyName} numberOfLines={1}>{e.name}</Text>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${(Math.max(0, e.hp) / e.maxHp) * 100}%`, backgroundColor: e.hp <= e.maxHp / 2 ? colors.partial : colors.fail }]} />
            </View>
            <Text style={styles.enemyHp}>
              {e.state === "down" ? "쓰러짐" : e.state === "routed" ? "달아남" : `HP ${e.hp}/${e.maxHp}`}
            </Text>
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
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  body: { flexGrow: 0, flexShrink: 1, minHeight: ENEMY_ROW - space.sm },
  // 고정한 최소 높이보다 내용이 작아지면 남는 자리는 적 칸과 버튼 사이에 둔다 (버튼은 늘 맨 아래)
  top: { flexShrink: 1, gap: space.md },
  bodyContent: { gap: space.md },
  title: { ...type.heading, color: colors.text, flexShrink: 1 },
  round: { ...type.label, color: colors.textFaint, marginLeft: "auto", fontVariant: ["tabular-nums"] },
  enemies: { gap: space.sm },
  enemy: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.surfaceRaised,
  },
  enemySelected: { borderColor: colors.accent },
  enemyOut: { opacity: 0.45 },
  enemyName: { ...type.bodyStrong, color: colors.text, flexShrink: 1, maxWidth: "45%" },
  enemyHp: { ...type.label, color: colors.textDim, fontVariant: ["tabular-nums"], minWidth: 56, textAlign: "right" },
  bar: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.pill },
  defenseValue: { ...type.label, color: colors.text, fontVariant: ["tabular-nums"] },
  picker: { gap: space.sm },
  pickerTitle: { ...type.label, color: colors.textDim },
});
