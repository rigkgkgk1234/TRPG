import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { CombatFx } from "@/core/commands";
import { NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { colors } from "@/ui/theme";

/** 효과 한 번의 길이 (ms) */
export const HIT_FX_MS = 600;

type PlayerFx = Extract<CombatFx, { side: "player" }>;
type T = Animated.Value;

/** HP 막대 굵기 (CombatView의 bar와 같다) */
export const HP_BAR_HEIGHT = 6;

/**
 * HP 막대를 적으로 보고 그 위에 겹치는 공격 효과. 누르기는 막지 않는다 (pointerEvents none).
 * 맞으면 깎인 만큼의 막대 조각이 남았다가 떨어져 나가고, 효과는 막대가 깎인 자리(맞은 곳)에서 터진다.
 * - 베기(검): 양 끝이 가는 칼자국이 막대를 비스듬히 가르고, 잘린 조각이 아래로 떨어진다 (대성공이면 X자)
 * - 타격(둔기·맨주먹): 맞은 자리에서 섬광과 충격파, 조각은 부풀며 부서진다 (대성공이면 두 겹)
 * - 화살(활): 왼쪽에서 날아와 맞은 자리에 꽂히고, 조각이 떨어진다
 * - 빗나감: "- _" 모양 속도선이 막대 위를 슉 지나간다
 * 적 칸 밖으로 넘쳐도 자르지 않는다. from·to: 맞기 전·후 HP 비율(0~1). transform·opacity만 움직인다.
 */
export function HitEffect({ fx, from, to }: { fx: PlayerFx; from: number; to: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: fx.hit ? HIT_FX_MS : HIT_FX_MS * 0.8, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
  }, [t, fx.hit]);

  if (!fx.hit) {
    return (
      <View pointerEvents="none" style={styles.layer}>
        <Whiff t={t} />
      </View>
    );
  }
  const at = `${to * 100}%` as const;
  return (
    <View pointerEvents="none" style={styles.layer}>
        <Chunk t={t} left={to} width={Math.max(0, from - to)} shatter={fx.weapon === "blunt" || fx.weapon === "fist"} />
        {/* 맞은 자리: 너비 0인 기준점에 효과를 가운데 맞춘다 */}
        <View style={[styles.point, { left: at }]}>
          {fx.weapon === "blade" ? <Slash t={t} crit={fx.crit} />
            : fx.weapon === "bow" ? <Arrow t={t} crit={fx.crit} />
            : <Impact t={t} crit={fx.crit} />}
        </View>
    </View>
  );
}

/** 깎인 막대 조각: 하얗게 번쩍인 뒤 떨어지거나(베기·화살) 부풀며 부서진다(타격) */
function Chunk({ t, left, width, shatter }: { t: T; left: number; width: number; shatter: boolean }) {
  if (width <= 0) return null;
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.55, 1], outputRange: [1, 1, 0.8, 0] });
  const transform = shatter
    ? [{ scaleY: t.interpolate({ inputRange: [0, 0.15, 0.5, 1], outputRange: [1, 2.6, 1.6, 0.4] }) }, { scaleX: t.interpolate({ inputRange: [0, 0.15, 1], outputRange: [1, 1.15, 1.4] }) }]
    : [
        { translateY: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0, 24] }) },
        { rotate: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: ["0deg", "0deg", "9deg"] }) },
      ];
  return (
    <Animated.View style={[styles.chunk, { left: `${left * 100}%`, width: `${width * 100}%`, opacity, transform }]}>
      <Animated.View style={[styles.chunkFill, { opacity: t.interpolate({ inputRange: [0, 0.25, 0.6], outputRange: [1, 1, 0] }) }]} />
    </Animated.View>
  );
}

const CUT_W = 200;
const CUT_H = 10;
/** 가운데가 두껍고 양 끝으로 갈수록 가늘어지는 칼자국 (렌즈 모양) */
const CUT_PATH = `M0 ${CUT_H / 2} Q${CUT_W / 2} ${-CUT_H / 2} ${CUT_W} ${CUT_H / 2} Q${CUT_W / 2} ${CUT_H * 1.5} 0 ${CUT_H / 2} Z`;

function Slash({ t, crit }: { t: T; crit: boolean }) {
  const cut = (deg: string, start: number, key: string) => {
    const draw = t.interpolate({ inputRange: [0, start, start + 0.2, 1], outputRange: [0.01, 0.01, 1, 1], extrapolate: "clamp" });
    // 왼쪽 끝을 고정하고 오른쪽으로 그어 나간다 (scaleX는 가운데 기준이라 그만큼 옮긴다)
    const shift = draw.interpolate({ inputRange: [0, 1], outputRange: [-CUT_W / 2, 0] });
    const fade = t.interpolate({ inputRange: [0, start, start + 0.02, start + 0.3, 1], outputRange: [0, 0, 1, 1, 0] });
    return (
      <Animated.View key={key} style={[styles.cut, { opacity: fade, transform: [{ rotate: deg }, { translateX: shift }, { scaleX: draw }] }]}>
        <Svg width={CUT_W} height={CUT_H} viewBox={`0 0 ${CUT_W} ${CUT_H}`}>
          <Path d={CUT_PATH} fill={colors.text} />
        </Svg>
      </Animated.View>
    );
  };
  return crit ? [cut("-24deg", 0, "a"), cut("24deg", 0.18, "b")] : cut("-20deg", 0, "a");
}

function Impact({ t, crit }: { t: T; crit: boolean }) {
  const burstScale = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.2, 1, 1.2] });
  const burstOpacity = t.interpolate({ inputRange: [0, 0.06, 0.45, 1], outputRange: [0, 0.8, 0.15, 0] });
  const ring = (to: number, delay: number, key: string) => {
    const scale = t.interpolate({ inputRange: [0, delay, 1], outputRange: [0.3, 0.3, to] });
    const opacity = t.interpolate({ inputRange: [0, delay, delay + 0.05, 1], outputRange: [0, 0, 1, 0] });
    return <Animated.View key={key} style={[styles.ring, { opacity, transform: [{ scale }] }]} />;
  };
  return (
    <>
      <Animated.View style={[styles.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
      {crit ? [ring(3, 0, "a"), ring(2.1, 0.16, "b")] : ring(2.6, 0, "a")}
    </>
  );
}

const ARROW_W = 90;

function Arrow({ t, crit }: { t: T; crit: boolean }) {
  // 화살촉 끝이 맞은 자리에 닿도록 화살 전체를 왼쪽으로 둔다
  const fly = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [-300, 0, 0] });
  const shake = t.interpolate({ inputRange: [0, 0.2, 0.26, 0.32, 0.38, 1], outputRange: ["0deg", "0deg", "-6deg", "4deg", "0deg", "0deg"] });
  const shown = t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const hit = t.interpolate({ inputRange: [0, 0.18, 0.24, 1], outputRange: [0, 0, 0.85, 0] });
  const hitScale = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.3, 0.3, crit ? 2.6 : 2] });
  return (
    <>
      <Animated.View style={[styles.arrow, { opacity: shown, transform: [{ translateX: fly }, { rotate: shake }] }]}>
        <View style={styles.fletch} />
        <View style={styles.shaft} />
        <Svg width={13} height={11} viewBox="0 0 9 8"><Path d="M0 0 L9 4 L0 8 Z" fill={colors.text} /></Svg>
      </Animated.View>
      <Animated.View style={[styles.spark, { opacity: hit, transform: [{ scale: hitScale }] }]} />
    </>
  );
}

/** 빗나감: "-"(위, 짧게)와 "_"(아래, 길게) 속도선이 막대 위를 왼쪽에서 오른쪽으로 슉 */
function Whiff({ t }: { t: T }) {
  const dash = (y: number, w: number, lag: number, key: string) => {
    const x = t.interpolate({ inputRange: [0, lag, 1], outputRange: [-300, -300, 300] });
    const opacity = t.interpolate({ inputRange: [0, lag, lag + 0.1, 0.85, 1], outputRange: [0, 0, 0.9, 0.9, 0] });
    return <Animated.View key={key} style={[styles.dash, { width: w, opacity, transform: [{ translateX: x }, { translateY: y }] }]} />;
  };
  return (
    <View style={styles.center}>
      {dash(-11, 46, 0, "top")}
      {dash(11, 80, 0.1, "bottom")}
    </View>
  );
}

const FILL = { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 } as const;

const styles = StyleSheet.create({
  // 막대 칸에 겹친다. 적 칸 밖으로 넘쳐도 그린다
  layer: { ...FILL, zIndex: 10 },
  center: { ...FILL, alignItems: "center", justifyContent: "center" },
  /** 맞은 자리 기준점 (너비 0, 세로 가운데) */
  point: { position: "absolute", top: 0, bottom: 0, width: 0, alignItems: "center", justifyContent: "center" },
  chunk: { position: "absolute", top: "50%", height: HP_BAR_HEIGHT, marginTop: -HP_BAR_HEIGHT / 2, borderRadius: 2, backgroundColor: colors.fail, overflow: "hidden" },
  chunkFill: { ...FILL, backgroundColor: colors.text },
  cut: { position: "absolute", width: CUT_W, height: CUT_H },
  burst: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text },
  ring: { position: "absolute", width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: colors.text },
  arrow: { position: "absolute", width: ARROW_W, left: -ARROW_W + 2, flexDirection: "row", alignItems: "center" },
  fletch: { width: 14, height: 8, borderRadius: 1, backgroundColor: colors.textDim },
  shaft: { flex: 1, height: 3, backgroundColor: colors.text },
  spark: { position: "absolute", width: 28, height: 28, borderRadius: 14, backgroundColor: colors.text },
  dash: { position: "absolute", height: 3.5, borderRadius: 2, backgroundColor: colors.text },
});
