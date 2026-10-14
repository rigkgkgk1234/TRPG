import { useMemo, useState } from "react";
import { Animated, PanResponder } from "react-native";
import { NATIVE_DRIVER } from "@/ui/components/DiceRoll";

/** 이만큼 끌면 접거나 편다 */
const SWIPE_DISTANCE = 40;

/**
 * 끌어서 접고 펴는 시트. 펼친 상태에서 아래로 끌면 손가락을 따라 내려가고, 놓을 때 거리가 충분하면 접는다.
 * 접힌 상태에서는 위로 끌거나 누르면 편다. sceneKey가 바뀌면(새 장면, 다음 때) 놓치지 않게 다시 편다.
 * 이벤트 창과 하루 행동 칸이 같이 쓴다.
 */
export function useSheet(sceneKey: string) {
  // 접은 장면을 기억한다: 장면이 바뀌면 저절로 펼친 상태가 된다
  const [collapsedAt, setCollapsedAt] = useState<string | null>(null);
  const collapsed = collapsedAt === sceneKey;
  const setCollapsed = (c: boolean) => setCollapsedAt(c ? sceneKey : null);
  const [drag] = useState(() => new Animated.Value(0));

  const responder = useMemo(() => {
    const settle = () => Animated.spring(drag, { toValue: 0, useNativeDriver: NATIVE_DRIVER }).start();
    return PanResponder.create({
      // 탭은 안쪽 Pressable에 맡기고, 세로로 끌기 시작하면 Pressable에게서 가져온다 (Capture여야 빼앗을 수 있다)
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => { if (!collapsed) drag.setValue(Math.max(0, g.dy)); },
      onPanResponderRelease: (_, g) => {
        if (!collapsed && g.dy > SWIPE_DISTANCE) { drag.setValue(0); setCollapsedAt(sceneKey); }
        else if (collapsed && g.dy < -SWIPE_DISTANCE) setCollapsedAt(null);
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [drag, collapsed, sceneKey]);

  return { collapsed, drag, panHandlers: responder.panHandlers, toggle: () => setCollapsed(!collapsed) };
}
