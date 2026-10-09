import { useEffect, useState } from "react";
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent, type PressableProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CombatFx } from "@/core/commands";
import { combatView, type CombatActionView, type CombatView } from "@/core/combat/combat";
import { MODE_LABEL } from "@/core/labels";
import type { CombatAction, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { Chip, ChipRow } from "@/ui/components/Controls";
import { NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { HIT_FX_MS, HP_BAR_HEIGHT, HitEffect } from "@/ui/components/HitEffect";
import { CrosshairIcon, FirstAidKitIcon, PersonSimpleRunIcon, ShieldIcon, SwordIcon, type Icon } from "@/ui/icons";
import { chanceBadgeProps } from "@/ui/rollText";
import { colors, hairline, icon, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

const ACTION_ICON: Record<CombatActionView["type"], Icon> = {
  attack: SwordIcon,
  powerAttack: CrosshairIcon,
  defend: ShieldIcon,
  useItem: FirstAidKitIcon,
  flee: PersonSimpleRunIcon,
};

/** 적 한 줄의 높이 어림값: 칸(위아래 여백 10 + 글 24 + 테두리 2) + 간격 8. 실제로 그려 보기 전까지만 쓴다 */
const ENEMY_ROW = 54;
const MAX_VISIBLE_ENEMIES = 3;
/** 공격 효과가 적 칸 목록 밖으로 넘쳐 보일 수 있는 폭 (가로는 화면 끝까지). 스크롤 칸을 이만큼 넓혀 잘리지 않게 한다 */
const FX_OUT_X = space.lg;
const FX_OUT_Y = space.xl;
/** 아이템 고르기 줄(제목 18 + 간격 8 + 칩 36): 고를 것이 여럿이면 적 칸이 적어도 이만큼은 된다 */
const PICKER_HEIGHT = 62;

/**
 * 전투 패널: 적 상태(HP 막대) → 내 방어도 → 행동 버튼. 적이 여럿이면 눌러서 대상을 고른다.
 * 굴림과 피해는 위쪽 결과 카드가 한 줄씩 보여 준다. (SYSTEM_SPEC 3장)
 * 높이는 전투 내내 고정: 적 칸은 적 수(실제로 그린 높이)로 정하고, 버튼 설명 줄이 늘어 커진 적이 있으면 그 높이를 유지한다 (줄지 않음).
 * 그래서 위쪽 결과 카드 글이 바뀌어도, 버튼 글이 바뀌어도 HP 막대와 버튼이 움직이지 않는다.
 */
export function CombatPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const [targetId, setTargetId] = useState<string | undefined>();
  const [pickingItem, setPickingItem] = useState(false);
  const [minHeight, setMinHeight] = useState(0);
  const [enemyListHeight, setEnemyListHeight] = useState<number | null>(null);
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
  // 적 칸 높이: 실제로 그린 적 목록 높이(적이 넷 이상이면 셋까지만 보이고 스크롤). 그려 보기 전에는 어림값
  const rowsHeight = enemyListHeight ?? enemyRows * ENEMY_ROW - space.sm;
  const visibleHeight = view.enemies.length > MAX_VISIBLE_ENEMIES ? (rowsHeight / view.enemies.length) * MAX_VISIBLE_ENEMIES : rowsHeight;
  const bodyHeight = Math.max(visibleHeight, view.items.length > 1 ? PICKER_HEIGHT : 0);
  const keepTallest = (e: LayoutChangeEvent) => {
    // 적 목록 높이를 재기 전(어림값)의 높이는 기억하지 않는다
    if (enemyListHeight === null) return;
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
        <ScrollView style={[styles.body, { height: bodyHeight + FX_OUT_Y * 2 }]} contentContainerStyle={styles.bodyContent} bounces={false}>
          {!pickingItem ? (
            <View onLayout={(e) => setEnemyListHeight(Math.ceil(e.nativeEvent.layout.height))}>
              <Enemies view={view} onSelect={setTargetId} />
            </View>
          ) : (
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
  // 결과 카드가 박자에 맞춰 넣는 전투 연출과, 연출 중에 이미 보여 준 피해
  const fx = useGame((s) => s.fx);
  const hpCut = useGame((s) => s.hpCut);
  return (
    <View style={styles.enemies}>
      {view.enemies.map((e) => {
        const selected = selectable && e.id === view.targetId;
        const hp = e.hp - (hpCut[e.id] ?? 0);
        const out = e.state !== "active" || hp <= 0;
        const mine = fx?.fx.side === "player" && fx.fx.targetId === e.id ? { seq: fx.seq, fx: fx.fx } : null;
        const attacking = fx?.fx.side === "foe" && fx.fx.enemyId === e.id ? fx.seq : null;
        return (
          <EnemyRow key={e.id} shakeSeq={mine?.fx.hit ? mine.seq : null} lungeSeq={attacking} front={mine !== null}>
            <EnemyCard
              name={e.name}
              hp={hp}
              maxHp={e.maxHp}
              status={e.state === "down" || hp <= 0 ? "쓰러짐" : e.state === "routed" ? "달아남" : `HP ${hp}/${e.maxHp}`}
              mine={mine}
              onPress={() => onSelect(e.id)}
              disabled={!selectable || out}
              accessibilityRole={selectable ? "button" : undefined}
              accessibilityState={{ selected }}
              style={[styles.enemy, selected && styles.enemySelected, out && styles.enemyOut]}
            />
          </EnemyRow>
        );
      })}
    </View>
  );
}

const hpRatio = (hp: number, max: number) => Math.min(1, Math.max(0, hp / max));

type Mine = { seq: number; fx: Extract<CombatFx, { side: "player" }> };

/** 적 칸 하나: 이름, HP 막대, 숫자를 한 줄에 (칸 높이가 늘 같다). HP 막대를 적으로 보고 공격 효과를 그 위에 겹친다 */
function EnemyCard({ name, hp, maxHp, status, mine, ...press }: { name: string; hp: number; maxHp: number; status: string; mine: Mine | null } & Omit<PressableProps, "children">) {
  return (
    <Pressable {...press} accessibilityLabel={`${name} HP ${Math.max(0, hp)}/${maxHp}`}>
      <Text style={styles.enemyName} numberOfLines={1}>{name}</Text>
      <View style={styles.barWrap}>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${hpRatio(hp, maxHp) * 100}%`, backgroundColor: hp <= maxHp / 2 ? colors.partial : colors.fail }]} />
        </View>
        {mine && <HitEffect key={mine.seq} fx={mine.fx} from={hpRatio(hp + mine.fx.damage, maxHp)} to={hpRatio(hp, maxHp)} />}
      </View>
      <Text style={styles.enemyHp}>{status}</Text>
    </Pressable>
  );
}

/** 적 줄 하나: 맞으면 좌우로 흔들리고(shakeSeq), 나를 공격하면 아래로 살짝 달려든다(lungeSeq) */
function EnemyRow({ shakeSeq, lungeSeq, front, children }: { shakeSeq: number | null; lungeSeq: number | null; front: boolean; children: React.ReactNode }) {
  const [x] = useState(() => new Animated.Value(0));
  const [y] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (shakeSeq === null) return;
    // 맞은 순간(효과가 그어진 뒤) 흔든다
    Animated.sequence([
      Animated.delay(HIT_FX_MS * 0.25),
      ...[7, -6, 4, -2, 0].map((v) => Animated.timing(x, { toValue: v, duration: 45, useNativeDriver: NATIVE_DRIVER })),
    ]).start();
  }, [shakeSeq, x]);
  useEffect(() => {
    if (lungeSeq === null) return;
    Animated.sequence([
      Animated.timing(y, { toValue: 6, duration: 90, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(y, { toValue: 0, duration: 160, useNativeDriver: NATIVE_DRIVER }),
    ]).start();
  }, [lungeSeq, y]);
  // 효과를 그리는 줄은 다른 줄 위에 올린다 (효과가 옆 줄까지 넘친다)
  return <Animated.View style={{ zIndex: front ? 1 : 0, transform: [{ translateX: x }, { translateY: y }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg + 4,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderColor: colors.borderStrong,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  body: { flexGrow: 0, flexShrink: 1, minHeight: ENEMY_ROW - space.sm + FX_OUT_Y * 2, marginHorizontal: -FX_OUT_X, marginVertical: -FX_OUT_Y },
  // 적 칸과 버튼은 붙여 둔다. 고정한 최소 높이보다 내용이 작아지면 남는 자리는 버튼 아래로 간다
  top: { flexShrink: 1, gap: space.md },
  // 효과가 넘칠 자리만큼 안쪽을 띄우고 바깥은 그만큼 당겨, 보이는 배치는 그대로 둔다
  bodyContent: { gap: space.md, paddingHorizontal: FX_OUT_X, paddingVertical: FX_OUT_Y },
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
    borderWidth: hairline,
    borderColor: colors.border,
  },
  enemySelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  enemyOut: { opacity: 0.45 },
  enemyName: { ...type.bodyStrong, color: colors.text, flexShrink: 1, maxWidth: "45%" },
  enemyHp: { ...type.label, color: colors.textDim, fontVariant: ["tabular-nums"], minWidth: 56, textAlign: "right" },
  barWrap: { flex: 1, alignSelf: "stretch", justifyContent: "center" },
  bar: { height: HP_BAR_HEIGHT, borderRadius: radius.pill, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.pill },
  defenseValue: { ...type.label, color: colors.text, fontVariant: ["tabular-nums"] },
  picker: { gap: space.sm },
  pickerTitle: { ...type.label, color: colors.textDim },
});
