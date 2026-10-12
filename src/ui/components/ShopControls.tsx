import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent } from "react-native";
import { Chip } from "@/ui/components/Controls";
import { nextSort, SORT_LABEL, type ItemGroup, type SortKey, type SortState } from "@/ui/shopSort";
import { colors, hairline, motion, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

const SORT_KEYS: SortKey[] = ["price", "kind"];

/** 가게 목록 위: 분류 칩(하나만 고른다) 한 줄, 정렬 칩(가격·유형, 기본 오름차순, 다시 누르면 방향이 바뀐다) 한 줄 */
export function ShopControls({ groups, group, onGroup, sort, onSort, sortKeys = SORT_KEYS }: {
  groups?: ItemGroup[];
  group?: string;
  onGroup?: (id: string) => void;
  sort: SortState;
  onSort: (s: SortState) => void;
  sortKeys?: SortKey[];
}) {
  return (
    <View style={styles.controls}>
      {groups && onGroup ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {groups.map((g) => <Chip key={g.id} label={g.label} selected={group === g.id} onPress={() => onGroup(g.id)} />)}
        </ScrollView>
      ) : null}
      <View style={styles.sortRow}>
        <Text style={styles.sortTitle}>정렬</Text>
        {sortKeys.map((k) => {
          const on = sort.key === k;
          return (
            <Pressable
              key={k}
              onPress={() => onSort(nextSort(sort, k))}
              accessibilityRole="button"
              accessibilityLabel={`${SORT_LABEL[k]} 순 정렬${on ? (sort.desc ? ", 내림차순" : ", 오름차순") : ""}`}
              accessibilityState={{ selected: on }}
              hitSlop={4}
              style={({ pressed }) => [styles.sort, on && styles.sortOn, pressed && styles.pressed]}
            >
              <Text style={[styles.sortText, on && styles.sortTextOn]}>{SORT_LABEL[k]}{on ? (sort.desc ? " ↓" : " ↑") : ""}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * 수량 고르기: [−] n [+] [최대] / 합계와 확인 버튼. 줄 아래에 펼친다.
 * max가 줄어들면 n도 따라 줄인다. 확인하면 1로 돌아간다.
 */
export function QtyPicker({ max, total, verb, unit = "개", slider, onConfirm }: {
  max: number;
  /** n개의 합계 표시 ("은화 6") */
  total: (n: number) => string;
  /** 확인 버튼 동사 ("사기", "팔기", "회복") */
  verb: string;
  unit?: string;
  /** 버튼 아래에 끌어서 고르는 막대를 둔다 (HP 회복처럼 고를 폭이 넓을 때) */
  slider?: boolean;
  onConfirm: (n: number) => void;
}) {
  const [picked, setPicked] = useState(1);
  const n = Math.max(1, Math.min(picked, max));
  const none = max < 1;
  return (
    <View style={styles.qty}>
      <View style={styles.qtyRow}>
        <StepButton text="−" label="하나 줄이기" disabled={none || n <= 1} onPress={() => setPicked(n - 1)} />
        <Text style={styles.qtyValue}>{none ? 0 : n}{unit}</Text>
        <StepButton text="+" label="하나 늘리기" disabled={none || n >= max} onPress={() => setPicked(n + 1)} />
        <Pressable
          onPress={() => setPicked(max)}
          disabled={none || n >= max}
          accessibilityRole="button"
          accessibilityLabel="최대 수량"
          hitSlop={4}
          style={({ pressed }) => [styles.small, (none || n >= max) && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.smallText}>최대 {Math.max(0, max)}</Text>
        </Pressable>
      </View>
      {slider && max > 1 ? <QtySlider value={n} max={max} onChange={setPicked} /> : null}
      <View style={styles.qtyRow}>
        <Text style={styles.total}>합계 <Text style={styles.totalValue}>{none ? "—" : total(n)}</Text></Text>
        <Pressable
          onPress={() => { onConfirm(n); setPicked(1); }}
          disabled={none}
          accessibilityRole="button"
          accessibilityLabel={`${verb} ${n}${unit}`}
          style={({ pressed }) => [styles.confirm, none && styles.disabled, pressed && styles.pressed]}
        >
          <Text style={styles.confirmText}>{verb} {none ? 0 : n}{unit}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * 1~max를 고르는 막대: 누른 곳으로 바로 옮기고, 누른 채 좌우로 끌면 따라온다.
 * 스크롤 창 안에 있으므로 한 번 잡으면 놓을 때까지 스크롤에 넘기지 않는다.
 */
function QtySlider({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  const width = useRef(0);
  // 잡고 있는 동안만 파랗게 빛난다
  const [held, setHeld] = useState(false);
  const frac = max > 1 ? (value - 1) / (max - 1) : 0;
  const pick = (e: GestureResponderEvent) => {
    if (width.current <= 0) return;
    const f = Math.min(1, Math.max(0, (e.nativeEvent.locationX - THUMB / 2) / (width.current - THUMB)));
    onChange(1 + Math.round(f * (max - 1)));
  };
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderEnd}>1</Text>
      <View
        style={styles.slider}
        onLayout={(e) => { width.current = e.nativeEvent.layout.width; }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => { setHeld(true); pick(e); }}
        onResponderMove={pick}
        onResponderRelease={() => setHeld(false)}
        onResponderTerminate={() => setHeld(false)}
        onResponderTerminationRequest={() => false}
        accessibilityRole="adjustable"
        accessibilityValue={{ min: 1, max, now: value }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onChange(Math.min(max, Math.max(1, value + (e.nativeEvent.actionName === "increment" ? 1 : -1))))}
      >
        <View pointerEvents="none" style={styles.track}>
          <View style={[styles.trackFill, held && styles.trackFillHeld, { width: `${frac * 100}%` }]} />
        </View>
        <View pointerEvents="none" style={[styles.thumb, held && styles.thumbHeld, { left: `${frac * 100}%`, marginLeft: -THUMB * frac }]} />
      </View>
      <Text style={styles.sliderEnd}>{max}</Text>
    </View>
  );
}

/** 동그라미 지름: 처음(24)의 70%쯤 */
const THUMB = 17;

function StepButton({ text, label, disabled, onPress }: { text: string; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [styles.step, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.stepText}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.sm },
  chips: { gap: space.sm },
  sortRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  sortTitle: { ...type.caption, color: colors.textFaint, marginRight: space.xs },
  sort: { minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.sm, justifyContent: "center" },
  sortOn: { backgroundColor: colors.surfaceRaised },
  sortText: { ...type.label, color: colors.textDim },
  sortTextOn: { color: colors.text },
  qty: { gap: space.sm, paddingBottom: space.md },
  qtyRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  step: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, alignItems: "center", justifyContent: "center" },
  stepText: { ...type.heading, color: colors.text },
  qtyValue: { ...type.number, color: colors.text, minWidth: 44, textAlign: "center" },
  small: { minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.sm, borderWidth: hairline, borderColor: colors.borderStrong, justifyContent: "center" },
  smallText: { ...type.label, color: colors.textDim, fontVariant: ["tabular-nums"] },
  total: { ...type.body, color: colors.textDim, flex: 1 },
  totalValue: { ...type.bodyStrong, color: colors.text, fontVariant: ["tabular-nums"] },
  confirm: { minHeight: 40, paddingHorizontal: space.lg, borderRadius: radius.sm, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  confirmText: { ...type.label, color: colors.accentText, fontVariant: ["tabular-nums"] },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sliderEnd: { ...type.caption, color: colors.textFaint, fontVariant: ["tabular-nums"], minWidth: 16, textAlign: "center" },
  // 손가락으로 잡기 쉽게 막대보다 높게 누를 자리를 둔다
  slider: { flex: 1, height: 36, justifyContent: "center" },
  // 평소에는 흰색만, 잡으면 파란 막대와 테두리가 빛난다 (막대 굵기 4, 테두리 2: 처음보다 60%쯤). 막대는 네모
  track: { height: 4, marginHorizontal: THUMB / 2, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  trackFill: { height: "100%", backgroundColor: colors.text },
  trackFillHeld: { backgroundColor: colors.accent },
  thumb: { position: "absolute", width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: colors.text },
  thumbHeld: {
    borderWidth: 2,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  disabled: { opacity: 0.35 },
  pressed: { transform: [{ scale: motion.press }] },
});
