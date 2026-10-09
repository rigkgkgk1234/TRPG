import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "@/ui/theme";

/**
 * 가방 화면 왼쪽의 사람 모양. 채움 없이 같은 굵기의 선 하나로: 머리는 원, 몸은 어깨·팔·다리를 한 번에 잇는 윤곽선.
 * 좌우 대칭, 모서리는 모두 둥글게. 색은 테두리 색 하나만 쓴다.
 */
export function BodyFigure({ width = 112 }: { width?: number }) {
  const line = { fill: "none", stroke: colors.borderStrong, strokeWidth: 2.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <Svg width={width} height={width * 2} viewBox="0 0 120 240" accessibilityLabel="사람 모양">
      <Circle cx={60} cy={32} r={16} {...line} />
      <Path
        d={[
          "M48 56 L72 56 Q90 56 92 72 L98 128 Q99 137 90 137 Q83 137 82 129 L79 92",
          "L79 136 L78 212 Q78 220 70 220 Q62 220 62 212 L61 150 Q60 146 59 150 L58 212 Q58 220 50 220 Q42 220 42 212 L41 136",
          "L41 92 L38 129 Q37 137 30 137 Q21 137 22 128 L28 72 Q30 56 48 56 Z",
        ].join(" ")}
        {...line}
      />
    </Svg>
  );
}
