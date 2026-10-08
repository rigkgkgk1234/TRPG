import { useEffect, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PHASE_LABEL, WOUND_LABEL } from "@/core/labels";
import { FOOD_PER_DAY } from "@/core/day/evening";
import { FATIGUE_DISADVANTAGE_AT, FATIGUE_MAX, LAST_DAY, maxHp, type DayPhase, type RunState } from "@/core/types";
import {
  BreadIcon, CaretRightIcon, CoinsIcon, HandCoinsIcon, HeartIcon, LightningIcon, MoonStarsIcon, SunHorizonIcon, SunIcon, WarningIcon, type Icon,
} from "@/ui/icons";
import { colors, icon, radius, space, type } from "@/ui/theme";
import { pushOnce } from "@/ui/navigate";

const FATIGUE_TIRED_AT = 4;
const FLASH_MS = 1200;

const PHASE_ICON: Record<DayPhase, Icon> = { morning: SunHorizonIcon, am: SunIcon, pm: SunHorizonIcon, evening: MoonStarsIcon };

function fatigueColor(f: number): string | undefined {
  if (f >= FATIGUE_DISADVANTAGE_AT) return colors.fail;
  if (f >= FATIGUE_TIRED_AT) return colors.partial;
  return undefined;
}

/** 게임 화면 상단. 폰 상단(노치·상태 표시줄)만큼 띄운다. 누르면 상태 모달(능력치·숙련). */
export function RunStatusBar({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const { player: p, resources: r, time } = run;
  const hpMax = maxHp(p.stats);
  const PhaseIcon = PHASE_ICON[time.phase];
  const warnings = [
    p.wound.level !== "none" && `부상: ${WOUND_LABEL[p.wound.level]}`,
    r.hunger > 0 && `굶주림 ${r.hunger}`,
    r.familyHunger > 0 && `가족 굶주림 ${r.familyHunger}`,
  ].filter(Boolean);

  return (
    // Link asChild는 웹에서 Pressable의 함수형 style을 잃는다 → 직접 이동한다 (두 번 눌러도 한 번만)
    <Pressable
      onPress={() => pushOnce("/game/status")}
      accessibilityRole="button"
      accessibilityHint="능력치와 숙련 보기"
      style={({ pressed }) => [styles.root, { paddingTop: insets.top + space.md }, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <Text style={styles.day}>{time.day}일차</Text>
        <View style={styles.phase}>
          <PhaseIcon size={icon.sm} weight={icon.weight} color={colors.accent} />
          <Text style={styles.phaseText}>{PHASE_LABEL[time.phase]}</Text>
        </View>
        <View style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
          <CaretRightIcon size={icon.sm} weight={icon.weight} color={colors.textFaint} />
        </View>
      </View>

      <View style={styles.progress} accessibilityLabel={`${LAST_DAY}일 중 ${time.day}일차`}>
        <View style={[styles.progressFill, { width: `${(time.day / LAST_DAY) * 100}%` }]} />
      </View>

      <View style={styles.stats}>
        <Stat icon={HeartIcon} label="HP" value={p.hp} suffix={`/${hpMax}`} higherIsGood
          color={p.hp <= hpMax / 3 ? colors.fail : undefined} />
        <Stat icon={LightningIcon} label="피로" value={r.fatigue} suffix={`/${FATIGUE_MAX}`} color={fatigueColor(r.fatigue)} />
        <Stat icon={CoinsIcon} label="은화" value={r.silver} higherIsGood />
        <Stat icon={BreadIcon} label="식량" value={r.food} higherIsGood color={r.food < FOOD_PER_DAY ? colors.partial : undefined} />
        {r.debt > 0 && <Stat icon={HandCoinsIcon} label="빚" value={r.debt} color={colors.fail} />}
      </View>

      {warnings.length > 0 && (
        <View style={styles.warnRow}>
          <WarningIcon size={icon.sm} weight={icon.weight} color={colors.partial} />
          <Text style={styles.warn}>{warnings.join(", ")}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** 값이 바뀌면 잠깐 좋아진(초록)/나빠진(빨강) 바탕으로 반짝인다 */
function Stat({ icon: IconC, label, value, suffix = "", color, higherIsGood = false }: {
  icon: Icon; label: string; value: number; suffix?: string; color?: string; higherIsGood?: boolean;
}) {
  const [prev, setPrev] = useState(value);
  const [good, setGood] = useState(true);
  const [changes, setChanges] = useState(0);
  const [flash] = useState(() => new Animated.Value(0));
  // 값이 바뀐 렌더에서 방향을 기록한다 (렌더 중 이전 값 비교는 React가 권하는 방식)
  if (prev !== value) {
    setPrev(value);
    setGood((value > prev) === higherIsGood);
    setChanges((n) => n + 1);
  }

  useEffect(() => {
    if (changes === 0) return;
    flash.setValue(1);
    // 색 보간은 네이티브 드라이버가 못 한다
    Animated.timing(flash, { toValue: 0, duration: FLASH_MS, useNativeDriver: false }).start();
  }, [changes, flash]);

  const base = color ?? colors.text;
  const animatedColor = flash.interpolate({ inputRange: [0, 1], outputRange: [base, good ? colors.success : colors.fail] });
  const bg = flash.interpolate({ inputRange: [0, 1], outputRange: ["rgba(0,0,0,0)", good ? colors.goodBg : colors.badBg] });
  return (
    <Animated.View style={[styles.stat, { backgroundColor: bg }]} accessibilityLabel={`${label} ${value}${suffix}`}>
      <View style={styles.statTop}>
        <IconC size={icon.sm} weight={icon.weight} color={color ?? colors.textFaint} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValueRow}>
        <Animated.Text style={[styles.statValue, { color: animatedColor }]}>{value}</Animated.Text>
        <Text style={styles.statSuffix}>{suffix}</Text>
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    gap: space.md,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  day: { ...type.title, color: colors.text },
  phase: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
  },
  phaseText: { ...type.label, color: colors.accent },
  who: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 1 },
  name: { ...type.caption, color: colors.textDim, flexShrink: 1 },
  progress: { height: 3, borderRadius: radius.pill, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.accent },
  stats: { flexDirection: "row", gap: space.xs, marginHorizontal: -space.sm },
  stat: { flex: 1, paddingVertical: space.xs, paddingHorizontal: space.sm, borderRadius: radius.sm, gap: 2 },
  statTop: { flexDirection: "row", alignItems: "center", gap: space.xs },
  statLabel: { ...type.caption, color: colors.textFaint },
  statValueRow: { fontVariant: ["tabular-nums"] },
  statValue: { ...type.number },
  statSuffix: { ...type.caption, color: colors.textFaint },
  warnRow: { flexDirection: "row", alignItems: "center", gap: space.xs },
  warn: { ...type.caption, color: colors.partial },
});
