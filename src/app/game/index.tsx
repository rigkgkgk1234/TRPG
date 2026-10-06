import { Redirect } from "expo-router";
import { View } from "react-native";
import { selectView } from "@/store/selectors";
import { useGame } from "@/store/gameStore";
import { RunStatusBar } from "@/ui/components/RunStatusBar";
import { colors } from "@/ui/theme";
import { EndingView } from "@/ui/views/EndingView";
import { EveningView } from "@/ui/views/EveningView";
import { HubView } from "@/ui/views/HubView";

/** 게임 본 화면. 허브·저녁·엔딩은 라우터 이동 없이 상태에서 고른다. (ARCHITECTURE 3-3) */
export default function GameScreen() {
  const run = useGame((s) => s.run);
  // 저장 기능(5주차) 전에는 앱을 새로 고치면 회차가 사라진다 → 타이틀로
  if (!run) return <Redirect href="/" />;

  const view = selectView(run);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {view !== "ending" && <RunStatusBar run={run} />}
      {view === "ending" ? <EndingView run={run} /> : view === "evening" ? <EveningView run={run} /> : <HubView run={run} />}
    </View>
  );
}
