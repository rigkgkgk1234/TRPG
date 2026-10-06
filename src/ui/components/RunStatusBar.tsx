import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { PHASE_LABEL, WOUND_LABEL } from "@/core/labels";
import { FOOD_PER_DAY } from "@/core/day/evening";
import { FATIGUE_DISADVANTAGE_AT, FATIGUE_MAX, maxHp, type RunState } from "@/core/types";
import { colors, font, radius, space } from "@/ui/theme";

const FATIGUE_TIRED_AT = 4;

function fatigueColor(f: number): string {
  if (f >= FATIGUE_DISADVANTAGE_AT) return colors.fail;
  if (f >= FATIGUE_TIRED_AT) return colors.partial;
  return colors.text;
}

/** 게임 화면 상단 상태 바. 누르면 상태 모달(능력치·숙련). */
export function RunStatusBar({ run }: { run: RunState }) {
  const { player: p, resources: r, time } = run;
  const hpMax = maxHp(p.stats);
  return (
    // Link asChild는 웹에서 Pressable의 함수형 style을 잃는다 → router.push를 직접 쓴다
    <Pressable
      onPress={() => router.push("/game/status")}
      accessibilityRole="button"
      accessibilityHint="능력치와 숙련 보기"
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <Text style={styles.day}>{time.day}일차 · {PHASE_LABEL[time.phase]}</Text>
        <Text style={styles.name} numberOfLines={1}>{p.name} ›</Text>
      </View>
      <View style={styles.hpTrack}>
        <View style={[styles.hpFill, { width: `${(p.hp / hpMax) * 100}%` }]} />
      </View>
      <View style={styles.row}>
        <Stat label="HP" value={`${p.hp}/${hpMax}`} />
        <Stat label="피로" value={`${r.fatigue}/${FATIGUE_MAX}`} color={fatigueColor(r.fatigue)} />
        <Stat label="은화" value={String(r.silver)} />
        <Stat label="식량" value={String(r.food)} color={r.food < FOOD_PER_DAY ? colors.partial : undefined} />
        {r.debt > 0 && <Stat label="빚" value={String(r.debt)} color={colors.fail} />}
      </View>
      {(p.wound.level !== "none" || r.hunger > 0 || r.familyHunger > 0) && (
        <Text style={styles.warn}>
          {[
            p.wound.level !== "none" && `부상: ${WOUND_LABEL[p.wound.level]}`,
            r.hunger > 0 && `굶주림 ${r.hunger}`,
            r.familyHunger > 0 && `가족 굶주림 ${r.familyHunger}`,
          ].filter(Boolean).join(" · ")}
        </Text>
      )}
    </Pressable>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Text style={styles.stat}>
      <Text style={styles.statLabel}>{label} </Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  day: { color: colors.text, fontSize: font.lg, fontWeight: "700" },
  name: { color: colors.textDim, fontSize: font.sm, flexShrink: 1 },
  hpTrack: { height: 6, borderRadius: radius.sm, backgroundColor: colors.surfaceRaised, overflow: "hidden" },
  hpFill: { height: "100%", backgroundColor: colors.fail },
  stat: { fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.textDim, fontSize: font.sm },
  statValue: { color: colors.text, fontSize: font.md, fontWeight: "600" },
  warn: { color: colors.partial, fontSize: font.sm },
});
