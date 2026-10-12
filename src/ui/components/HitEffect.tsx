import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { CombatFx } from "@/core/commands";
import { isVolley, volleyParts, VOLLEY_GAP_MS, VOLLEY_SHOTS } from "@/store/volley";
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
 * - 베기(검): 커다란 칼자국(붉은 잔광)이 막대를 비스듬히 가르고, 칼날을 따라 불꽃·충격파·파편이 튄다. 잘린 조각은 아래로 떨어지고 적 줄이 크게 흔들린다 (대성공이면 X자)
 * - 타격(둔기): 큰 섬광, 두꺼운 충격파 두 겹, 사방으로 튀는 충격선과 파편. 조각은 크게 부풀며 부서지고, 적 줄이 아래로 꺼지며 크게 흔들린다 (대성공이면 더 크게)
 * - 타격(맨주먹): 맞은 자리에서 섬광과 충격파, 조각은 부풀며 부서진다 (대성공이면 두 겹)
 * - 화살(활): 굵은 화살이 오른쪽 위에서 비스듬히 날아와 꽂히고, 닿는 순간 섬광·충격파·불꽃·파편이 터진다. 적 줄이 맞은 쪽으로 밀리며 흔들린다.
 *   대성공이면 화살 세 발이 0.1초마다 하나씩 꽂히고(섬광 없이), 피해를 셋으로 나눠 한 발마다 막대가 깎인다 (Volley)
 * - 빗나감: "- _" 모양 속도선이 막대 위를 슉 지나간다
 * 적 칸 밖으로 넘쳐도 자르지 않는다. from·to: 맞기 전·후 HP 비율(0~1). transform·opacity만 움직인다.
 */
export function HitEffect({ fx, from, to, maxHp }: { fx: PlayerFx; from: number; to: number; maxHp: number }) {
  if (isVolley(fx)) return <Volley fx={fx} from={from} maxHp={maxHp} />;
  return <SingleHit fx={fx} from={from} to={to} />;
}

function useFxClock(duration: number): T {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
  }, [t, duration]);
  return t;
}

/**
 * 활 대성공 연사: 화살 세 발이 VOLLEY_GAP_MS마다 하나씩 날아와 꽂힌다. 피해를 셋으로 나눠 한 발마다 그만큼 막대가 깎인다
 * (HP 숫자·막대는 스토어가 같은 간격으로 깎는다). from: 연사 시작 때(첫 발이 깎은 뒤) 위치가 아니라 깎기 전 HP 비율.
 */
function Volley({ fx, from, maxHp }: { fx: PlayerFx; from: number; maxHp: number }) {
  // 막대가 깎여도 처음 위치를 기준으로 각 발의 조각을 정한다
  const [start] = useState(from);
  const [shots, setShots] = useState(1);
  useEffect(() => {
    const timers = Array.from({ length: VOLLEY_SHOTS - 1 }, (_, i) => setTimeout(() => setShots(i + 2), VOLLEY_GAP_MS * (i + 1)));
    return () => timers.forEach(clearTimeout);
  }, []);
  const parts = volleyParts(fx.damage);
  // i번째 발까지 깎인 양 (0, 첫 발, 첫 발+둘째 발, 모두)
  const cut = parts.map((_, i) => parts.slice(0, i).reduce((a, d) => a + d, 0));
  const segments = parts.map((dmg, i) => ({
    hi: Math.max(0, start - cut[i] / maxHp),
    lo: Math.max(0, start - (cut[i] + dmg) / maxHp),
  }));
  return (
    <View pointerEvents="none" style={styles.layer}>
      {segments.slice(0, shots).map((sg, i) => <VolleyShot key={i} hi={sg.hi} lo={sg.lo} last={i === VOLLEY_SHOTS - 1} />)}
    </View>
  );
}

/** 연사의 한 발: 자기 조각을 떨어뜨리고, 깎인 자리에 화살이 꽂힌다 (마지막 발은 더 크게 터진다) */
function VolleyShot({ hi, lo, last }: { hi: number; lo: number; last: boolean }) {
  const t = useFxClock(HIT_FX_MS);
  return (
    <>
      <Chunk t={t} left={lo} width={Math.max(0, hi - lo)} shatter={null} />
      <View style={[styles.point, { left: `${lo * 100}%` }]}>
        <Arrow t={t} crit={last} flash={false} />
      </View>
    </>
  );
}

function SingleHit({ fx, from, to }: { fx: PlayerFx; from: number; to: number }) {
  const t = useFxClock(fx.hit ? HIT_FX_MS : HIT_FX_MS * 0.8);

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
        <Chunk t={t} left={to} width={Math.max(0, from - to)} shatter={fx.weapon === "blunt" ? "heavy" : fx.weapon === "fist" ? "light" : null} />
        {/* 맞은 자리: 너비 0인 기준점에 효과를 가운데 맞춘다 */}
        <View style={[styles.point, { left: at }]}>
          {fx.weapon === "blade" ? <Slash t={t} crit={fx.crit} />
            : fx.weapon === "bow" ? <Arrow t={t} crit={fx.crit} />
            : fx.weapon === "blunt" ? <Smash t={t} crit={fx.crit} />
            : <Impact t={t} crit={fx.crit} />}
        </View>
    </View>
  );
}

/** 깎인 막대 조각: 하얗게 번쩍인 뒤 떨어지거나(베기·화살) 부풀며 부서진다(타격, 둔기는 더 크게) */
function Chunk({ t, left, width, shatter }: { t: T; left: number; width: number; shatter: "heavy" | "light" | null }) {
  if (width <= 0) return null;
  const opacity = t.interpolate({ inputRange: [0, 0.15, 0.55, 1], outputRange: [1, 1, 0.8, 0] });
  const transform = shatter === "heavy"
    ? [{ scaleY: t.interpolate({ inputRange: [0, 0.08, 0.4, 1], outputRange: [1, 3.8, 2, 0.3] }) }, { scaleX: t.interpolate({ inputRange: [0, 0.08, 1], outputRange: [1, 1.3, 1.7] }) }]
    : shatter
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

const CUT_W = 260;
const CUT_H = 14;
/** 가운데가 두껍고 양 끝으로 갈수록 가늘어지는 칼자국 (렌즈 모양) */
const CUT_PATH = `M0 ${CUT_H / 2} Q${CUT_W / 2} ${-CUT_H / 2} ${CUT_W} ${CUT_H / 2} Q${CUT_W / 2} ${CUT_H * 1.5} 0 ${CUT_H / 2} Z`;

/** 베기 불꽃이 튀는 방향: 칼자국을 따라 앞뒤로 (각도) */
const SLASH_SPARKS = [-38, -24, -10, 4, 142, 156, 170];
const SLASH_SPARKS_CRIT = [-48, -34, -20, -6, 8, 22, 36, 132, 146, 160, 174, 188, 202];
/** 베기 파편: 칼이 지나간 쪽(오른쪽 위)으로 흩날렸다 떨어진다 */
const SLASH_DEBRIS: Debris[] = [[96, 30, -240], [70, 46, 200], [44, 38, -160], [118, 16, 260], [-36, 20, 140], [24, 54, -200]];

/** 검: 커다란 칼자국(붉은 잔광이 뒤따른다) + 칼날을 따라 튀는 불꽃 + 충격파 + 흩날리는 파편. 대성공은 X자 */
function Slash({ t, crit }: { t: T; crit: boolean }) {
  const cut = (deg: string, start: number, key: string) => {
    const draw = t.interpolate({ inputRange: [0, start, start + 0.14, 1], outputRange: [0.01, 0.01, 1, 1], extrapolate: "clamp" });
    // 왼쪽 끝을 고정하고 오른쪽으로 그어 나간다 (scaleX는 가운데 기준이라 그만큼 옮긴다)
    const shift = draw.interpolate({ inputRange: [0, 1], outputRange: [-CUT_W / 2, 0] });
    const fade = t.interpolate({ inputRange: [0, start, start + 0.02, start + 0.35, 1], outputRange: [0, 0, 1, 1, 0] });
    const glow = t.interpolate({ inputRange: [0, start, start + 0.04, start + 0.5], outputRange: [0, 0, 0.7, 0], extrapolate: "clamp" });
    return (
      <View key={key} style={styles.cutHolder}>
        {/* 붉은 잔광: 칼자국보다 두껍게, 더 오래 남는다 */}
        <Animated.View style={[styles.cut, { opacity: glow, transform: [{ rotate: deg }, { translateX: shift }, { scaleX: draw }, { scaleY: 2.4 }] }]}>
          <Svg width={CUT_W} height={CUT_H} viewBox={`0 0 ${CUT_W} ${CUT_H}`}>
            <Path d={CUT_PATH} fill={colors.fail} />
          </Svg>
        </Animated.View>
        <Animated.View style={[styles.cut, { opacity: fade, transform: [{ rotate: deg }, { translateX: shift }, { scaleX: draw }] }]}>
          <Svg width={CUT_W} height={CUT_H} viewBox={`0 0 ${CUT_W} ${CUT_H}`}>
            <Path d={CUT_PATH} fill={colors.text} />
          </Svg>
        </Animated.View>
      </View>
    );
  };
  return (
    <>
      {crit ? [cut("-24deg", 0, "a"), cut("24deg", 0.14, "b")] : cut("-20deg", 0, "a")}
      <Burst t={t} at={0.08} flash={crit ? 1.6 : 1.2} rings={crit ? [[5, 0], [3.4, 0.1]] : [[4.2, 0]]}
        spikes={crit ? SLASH_SPARKS_CRIT : SLASH_SPARKS} reach={crit ? 110 : 96} debris={SLASH_DEBRIS} />
    </>
  );
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

/** 파편 하나: [가로로 날아가는 거리, 솟구치는 높이, 회전] — 솟았다가 아래로 떨어진다 */
type Debris = [number, number, number];

/** 둔기 충격선: 맞은 자리에서 사방으로 뻗는 짧은 막대 (각도) */
const SMASH_SPIKES = [0, 45, 90, 135, 180, 225, 270, 315];
const SMASH_SPIKES_CRIT = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const SMASH_DEBRIS: Debris[] = [[-86, 34, -260], [-58, 56, 200], [-24, 64, -160], [22, 60, 220], [56, 50, -200], [88, 30, 180], [-40, 20, 120], [44, 22, -140]];

/** 둔기: 큰 섬광 + 충격파 두 겹(대성공은 세 겹) + 사방으로 튀는 충격선 + 솟았다 떨어지는 파편 */
function Smash({ t, crit }: { t: T; crit: boolean }) {
  return (
    <Burst t={t} at={0} flash={crit ? 1.9 : 1.5} rings={crit ? [[6, 0], [4.4, 0.08], [3, 0.16]] : [[5, 0], [3.4, 0.1]]}
      spikes={crit ? SMASH_SPIKES_CRIT : SMASH_SPIKES} reach={crit ? 96 : 80} debris={SMASH_DEBRIS} spread={crit ? 1.3 : 1} />
  );
}

/**
 * 맞은 순간의 폭발: 섬광 + 충격파 + 튀는 선 + 파편. 둔기·검·활이 같이 쓴다.
 * at: 맞는 순간(t 기준, 활은 화살이 닿은 뒤). flash: 섬광 크기(0이면 섬광 없음). rings: [최종 크기, at 뒤 지연], spikes: 튀는 선의 각도, reach: 튀는 선이 닿는 거리
 */
function Burst({ t, at, flash, rings, spikes, reach, debris, spread = 1 }: {
  t: T; at: number; flash: number; rings: [number, number][]; spikes: number[]; reach: number; debris: Debris[]; spread?: number;
}) {
  // 맞은 뒤의 진행(0~1)을 t로 바꾼다
  const k = (p: number) => at + p * (1 - at);
  // 섬광은 크게 번쩍이고 금방 사라진다 (회색 원으로 남지 않게)
  const flashScale = t.interpolate({ inputRange: [0, at, k(0.05), k(0.2)], outputRange: [0.3, 0.3, flash, flash * 1.2], extrapolate: "clamp" });
  const flashOpacity = t.interpolate({ inputRange: [0, at, k(0.02), k(0.08), k(0.2)], outputRange: [0, 0, 1, 0.85, 0], extrapolate: "clamp" });
  // 충격파: 빠르게 크게 퍼지며 엷어진다
  const ring = ([to, delay]: [number, number], i: number) => {
    const scale = t.interpolate({ inputRange: [0, k(delay), k(delay + 0.3)], outputRange: [0.5, 0.5, to], extrapolate: "clamp" });
    const opacity = t.interpolate({ inputRange: [0, k(delay), k(delay + 0.02), k(delay + 0.3)], outputRange: [0, 0, 1, 0], extrapolate: "clamp" });
    return <Animated.View key={i} style={[styles.smashRing, { opacity, transform: [{ scale }] }]} />;
  };
  const spike = (deg: number) => {
    const out = t.interpolate({ inputRange: [0, at, k(0.03), k(0.28)], outputRange: [16, 16, 22, reach], extrapolate: "clamp" });
    const opacity = t.interpolate({ inputRange: [0, at, k(0.02), k(0.18), k(0.3)], outputRange: [0, 0, 1, 0.9, 0], extrapolate: "clamp" });
    const scaleX = t.interpolate({ inputRange: [0, at, k(0.03), k(0.28)], outputRange: [0.5, 0.5, 1.4, 0.2], extrapolate: "clamp" });
    return (
      <View key={deg} style={[styles.spikeArm, { transform: [{ rotate: `${deg}deg` }] }]}>
        <Animated.View style={[styles.spike, { opacity, transform: [{ translateX: out }, { scaleX }] }]} />
      </View>
    );
  };
  const piece = ([dx, up, spin]: Debris, i: number) => {
    // 솟구쳤다가 무겁게 떨어진다
    const x = t.interpolate({ inputRange: [0, at, k(0.3), 1], outputRange: [0, 0, dx * 0.7 * spread, dx * spread] });
    const y = t.interpolate({ inputRange: [0, at, k(0.18), k(0.4), 1], outputRange: [0, 0, -up, -up * 0.7, up * 1.4] });
    const rotate = t.interpolate({ inputRange: [0, at, 1], outputRange: ["0deg", "0deg", `${spin}deg`] });
    const opacity = t.interpolate({ inputRange: [0, at, k(0.02), k(0.75), 1], outputRange: [0, 0, 1, 1, 0] });
    return <Animated.View key={i} style={[styles.debris, i % 2 === 0 && styles.debrisRed, { opacity, transform: [{ translateX: x }, { translateY: y }, { rotate }] }]} />;
  };
  return (
    <>
      {flash > 0 && <Animated.View style={[styles.smashFlash, { opacity: flashOpacity, transform: [{ scale: flashScale }] }]} />}
      {rings.map(ring)}
      {spikes.map(spike)}
      {debris.map(piece)}
    </>
  );
}

const ARROW_W = 99;
/** 화살이 막대에 꽂히는 기울기: 오른쪽 위에서 왼쪽 아래로 */
const ARROW_TILT = -35;
/** 화살이 날아오는 거리 (화살 방향으로) */
const ARROW_FLIGHT = 460;
/** 화살촉이 막대에 박히는 깊이 */
const ARROW_SINK = 4;
/** 화살이 닿는 순간 (t) */
const ARROW_HIT = 0.2;
/** 화살 불꽃: 날아온 쪽(오른쪽 위)으로 튀어 오른다 */
const ARROW_SPARKS = [-80, -62, -44, -26, -8, 10, 150, 200];
const ARROW_SPARKS_CRIT = [-90, -75, -60, -45, -30, -15, 0, 15, 135, 165, 195, 225];
/** 부러진 화살대·파편 */
const ARROW_DEBRIS: Debris[] = [[70, 44, -260], [44, 58, 220], [96, 26, -180], [-30, 24, 160], [-56, 34, -200], [20, 50, 240]];

/** 활: 굵은 화살이 화면 밖 오른쪽 위에서 날아와 꽂히고, 닿는 순간 섬광·충격파·불꽃·파편이 터진다 (연사는 섬광 없이) */
function Arrow({ t, crit, flash = true }: { t: T; crit: boolean; flash?: boolean }) {
  // 너비 2배 칸의 가운데가 맞은 자리이고, 화살은 오른쪽 절반에 왼쪽을 보고 놓인다.
  // 칸을 돌리면 가운데(화살촉)를 축으로 돌므로, 기울인 뒤 화살 방향으로 밀었다가 당겨 오면 오른쪽 위에서 날아와 꽂힌다
  const fly = t.interpolate({ inputRange: [0, ARROW_HIT, 1], outputRange: [ARROW_FLIGHT, 0, 0] });
  const shake = t.interpolate({
    inputRange: [0, ARROW_HIT, 0.25, 0.3, 0.35, 0.4, 1],
    outputRange: [0, 0, -9, 7, -4, 0, 0].map((d) => `${ARROW_TILT + d}deg`),
  });
  const shown = t.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });
  return (
    <>
      <Animated.View style={[styles.arrowFrame, { opacity: shown, transform: [{ rotate: shake }, { translateX: fly }] }]}>
        <View style={styles.arrow}>
          <Svg width={15} height={13} viewBox="0 0 9 8"><Path d="M9 0 L0 4 L9 8 Z" fill={colors.text} /></Svg>
          <View style={styles.shaft} />
          <View style={styles.fletch} />
        </View>
      </Animated.View>
      <Burst t={t} at={ARROW_HIT} flash={flash ? (crit ? 1.6 : 1.2) : 0} rings={crit ? [[5, 0], [3.4, 0.1]] : [[4.2, 0]]}
        spikes={crit ? ARROW_SPARKS_CRIT : ARROW_SPARKS} reach={crit ? 100 : 86} debris={ARROW_DEBRIS} />
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
  chunk: { position: "absolute", top: "50%", height: HP_BAR_HEIGHT, marginTop: -HP_BAR_HEIGHT / 2, backgroundColor: colors.fail, overflow: "hidden" },
  chunkFill: { ...FILL, backgroundColor: colors.text },
  cutHolder: { position: "absolute", width: 0, height: 0, alignItems: "center", justifyContent: "center" },
  cut: { position: "absolute", width: CUT_W, height: CUT_H },
  burst: { position: "absolute", width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text },
  ring: { position: "absolute", width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: colors.text },
  smashFlash: { position: "absolute", width: 64, height: 64, borderRadius: 32, backgroundColor: colors.text },
  smashRing: { position: "absolute", width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: colors.text },
  /** 충격선 하나를 돌리는 너비 0 기준점 (회전 중심이 맞은 자리) */
  spikeArm: { position: "absolute", width: 0, height: 0, alignItems: "flex-start", justifyContent: "center" },
  spike: { position: "absolute", width: 30, height: 4, borderRadius: 2, backgroundColor: colors.text },
  debris: { position: "absolute", width: 8, height: 8, borderRadius: 1, backgroundColor: colors.text },
  debrisRed: { backgroundColor: colors.fail },
  arrowFrame: { position: "absolute", width: ARROW_W * 2, left: -ARROW_W, flexDirection: "row", alignItems: "center" },
  arrow: { width: ARROW_W, marginLeft: ARROW_W - ARROW_SINK, flexDirection: "row", alignItems: "center" },
  fletch: { width: 15, height: 8.5, borderRadius: 2, backgroundColor: colors.fail },
  shaft: { flex: 1, height: 3, backgroundColor: colors.text },
  dash: { position: "absolute", height: 3.5, borderRadius: 2, backgroundColor: colors.text },
});
