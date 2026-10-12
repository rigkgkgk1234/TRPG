import { useState } from "react";
import { View } from "react-native";
import Svg, { Polygon } from "react-native-svg";

/** 오른쪽 끝을 비스듬히 자르는 폭: 막대 높이만큼 (45도) */
const slantOf = (height: number) => height;

/**
 * HP 막대: 왼쪽 끝은 곧게 "[", 오른쪽 끝은 "7"처럼 위가 더 나가게 비스듬히 자른다.
 * 채운 부분의 끝도 같은 기울기로 자른다. 나머지 막대(하루 진행 등)는 네모다.
 */
export function HpBar({ ratio, height, color, trackColor }: { ratio: number; height: number; color: string; trackColor: string }) {
  const [width, setWidth] = useState(0);
  const s = slantOf(height);
  const fill = Math.min(1, Math.max(0, ratio)) * width;
  // 위 가장자리는 fill까지, 아래 가장자리는 기울기만큼 덜 (막대 왼쪽 끝을 넘지 않게)
  const shape = (w: number) => `0,0 ${w},0 ${Math.max(0, w - s)},${height} 0,${height}`;
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Polygon points={shape(width)} fill={trackColor} />
          {fill > 0 && <Polygon points={shape(fill)} fill={color} />}
        </Svg>
      )}
    </View>
  );
}
