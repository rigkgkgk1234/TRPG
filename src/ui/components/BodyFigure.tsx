import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { EquipSlot } from "@/core/items/equipment";
import { colors } from "@/ui/theme";

/**
 * 가방 화면 왼쪽의 사람 그림. 무언가를 걸친 부위는 강조색으로 칠한다.
 * 정면을 보고 서 있으므로 오른손은 그림의 왼쪽, 왼손은 그림의 오른쪽에 있다.
 */
export function BodyFigure({ worn, width = 112 }: { worn: Partial<Record<EquipSlot, boolean>>; width?: number }) {
  const fill = (slot: EquipSlot) => (worn[slot] ? colors.accentSoft : "transparent");
  const stroke = (slot: EquipSlot) => (worn[slot] ? colors.accent : colors.borderStrong);
  const part = (slot: EquipSlot) => ({ fill: fill(slot), stroke: stroke(slot), strokeWidth: 2 });
  return (
    <Svg width={width} height={width * 2} viewBox="0 0 100 200" accessibilityLabel="몸에 걸친 것">
      {/* 머리 */}
      <Circle cx={50} cy={22} r={15} {...part("head")} />
      {/* 상체 */}
      <Path d="M30 44 Q50 38 70 44 L68 102 L32 102 Z" {...part("armor")} />
      {/* 팔: 오른팔(그림 왼쪽) · 왼팔(그림 오른쪽) */}
      <Path d="M28 48 L16 96" stroke={colors.borderStrong} strokeWidth={6} strokeLinecap="round" />
      <Path d="M72 48 L84 96" stroke={colors.borderStrong} strokeWidth={6} strokeLinecap="round" />
      {/* 손 */}
      <Circle cx={14} cy={104} r={8} {...part("weapon")} />
      <Circle cx={86} cy={104} r={8} {...part("offHand")} />
      {/* 하체 */}
      <Path d="M32 106 L68 106 L66 168 L53 168 L50 126 L47 168 L34 168 Z" {...part("legs")} />
      {/* 발 */}
      <Rect x={26} y={174} width={20} height={10} rx={4} {...part("feet")} />
      <Rect x={54} y={174} width={20} height={10} rx={4} {...part("feet")} />
    </Svg>
  );
}
