import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";
import { NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { useReducedMotion } from "@/ui/useReducedMotion";

/** 오른쪽 끝을 비스듬히 자르는 폭: 막대 높이만큼 (45도) */
const slantOf = (height: number) => height;

/** 뒤따라오는 막대가 줄기 시작할 때까지 기다리는 시간(ms): 맞은 조각이 흩어지는 동안은 그대로 둔다. 연사처럼 잇달아 깎이면 마지막 깎임부터 다시 센다 */
const TRAIL_DELAY_MS = 420;
/** 뒤따라오는 막대가 줄어드는 시간(ms) */
const TRAIL_MS = 450;

/**
 * HP 막대: 왼쪽 끝은 곧게 "[", 오른쪽 끝은 "7"처럼 위가 더 나가게 비스듬히 자른다.
 * 채운 부분의 끝도 같은 기울기로 자른다. 나머지 막대(하루 진행 등)는 네모다.
 * trailColor를 주면 채운 막대 아래에 같은 모양의 막대를 하나 더 깐다. HP가 줄면 위 막대는 바로 줄고, 아래 막대는 잠시 뒤 따라 줄어든다.
 */
export function HpBar({ ratio, height, color, trackColor, trailColor }: { ratio: number; height: number; color: string; trackColor: string; trailColor?: string }) {
  const [width, setWidth] = useState(0);
  const s = slantOf(height);
  const r = Math.min(1, Math.max(0, ratio));
  const fill = r * width;
  // 위 가장자리는 fill까지, 아래 가장자리는 기울기만큼 덜 (막대 왼쪽 끝을 넘지 않게)
  const shape = (w: number) => `0,0 ${w},0 ${Math.max(0, w - s)},${height} 0,${height}`;
  const trail = useTrail(r, !!trailColor);
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <Svg width={width} height={height}>
            <Polygon points={shape(width)} fill={trackColor} />
          </Svg>
          {trailColor && (
            // 막대 전체 모양을 왼쪽으로 밀어 넣어 비스듬한 끝이 함께 움직이게 한다 (왼쪽 끝은 곧아서 잘려도 같은 모양)
            <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
              <Animated.View style={{ transform: [{ translateX: trail.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }] }}>
                <Svg width={width} height={height}>
                  <Polygon points={shape(width)} fill={trailColor} />
                </Svg>
              </Animated.View>
            </View>
          )}
          {fill > 0 && (
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              <Polygon points={shape(fill)} fill={color} />
            </Svg>
          )}
        </>
      )}
    </View>
  );
}

/** 뒤따라오는 막대의 비율(0~1). 줄면 잠시 기다렸다 따라가고, 늘면 바로 맞춘다 */
function useTrail(ratio: number, on: boolean): Animated.Value {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(ratio));
  const shown = useRef(ratio);
  useEffect(() => {
    if (!on) return;
    if (ratio >= shown.current || reduced) {
      value.stopAnimation();
      value.setValue(ratio);
      shown.current = ratio;
      return;
    }
    const timer = setTimeout(() => {
      Animated.timing(value, { toValue: ratio, duration: TRAIL_MS, easing: Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER }).start();
      shown.current = ratio;
    }, TRAIL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ratio, on, reduced, value]);
  return value;
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
