import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { selectView } from "@/store/selectors";
import { useGame, useShownRun } from "@/store/gameStore";
import { RunStatusBar } from "@/ui/components/RunStatusBar";
import { TurnLog } from "@/ui/components/TurnLog";
import { colors } from "@/ui/theme";
import { EndingHeader, EndingPanel } from "@/ui/views/EndingView";
import { EveningPanel } from "@/ui/views/EveningView";
import { HubPanel } from "@/ui/views/HubView";

/**
 * 게임 본 화면: 상태 바 / 결과 기록 / 아래 패널. 허브·저녁·엔딩은 라우터 이동 없이 상태에서 고른다. (ARCHITECTURE 3-3)
 * 결과 카드가 연출되는 동안에는 명령 전 상태를 그려서, 숫자와 화면 전환이 주사위보다 먼저 결과를 알려 주지 않게 한다.
 */
export default function GameScreen() {
  const run = useGame((s) => s.run);
  const shown = useShownRun();
  const busy = useGame((s) => s.playing !== null);
  // 저장 기능(5주차) 전에는 앱을 새로 고치면 회차가 사라진다 → 타이틀로
  if (!run || !shown) return <Redirect href="/" />;

  const view = selectView(shown);
  return (
    <View style={styles.root}>
      {view === "ending" ? <EndingHeader run={shown} /> : <RunStatusBar run={shown} />}
      <TurnLog
        run={run}
        intro={{ title: `${run.player.name}의 서른 날`, body: "보리울에서의 첫날이 밝았다. 일해서 식량과 은화를 모으고, 저녁마다 가족을 먹여야 한다. 아래에서 오늘 할 일을 고르자." }}
      />
      <View style={busy && styles.busy}>
        {view === "ending" ? <EndingPanel run={shown} /> : view === "evening" ? <EveningPanel run={shown} /> : <HubPanel run={shown} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  busy: { opacity: 0.55, pointerEvents: "none" },
});
