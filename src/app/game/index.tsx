import { Redirect } from "expo-router";
import { StyleSheet, View } from "react-native";
import { josa, PHASE_LABEL } from "@/core/labels";
import type { RunState } from "@/core/types";
import { selectView, type GameView } from "@/store/selectors";
import { useGame, useShownRun } from "@/store/gameStore";
import { RunStatusBar } from "@/ui/components/RunStatusBar";
import { TurnLog } from "@/ui/components/TurnLog";
import { colors } from "@/ui/theme";
import { EndingHeader, EndingPanel } from "@/ui/views/EndingView";
import { CombatPanel } from "@/ui/views/CombatView";
import { EventPanel } from "@/ui/views/EventView";
import { EveningPanel } from "@/ui/views/EveningView";
import { HubPanel } from "@/ui/views/HubView";

/**
 * 게임 본 화면: 상태 바 / 결과 기록 / 아래 패널. 허브·이벤트·전투·저녁·엔딩은 라우터 이동 없이 상태에서 고른다. (ARCHITECTURE 3-3)
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
      <TurnLog intro={introFor(run)} />
      {/* 이벤트 패널은 글이 길면 줄어들어 스크롤한다 (나머지 패널은 내용 높이 그대로) */}
      <View style={[view === "event" && styles.shrink, busy && styles.busy]}>
        <Panel view={view} run={shown} />
      </View>
    </View>
  );
}

/** 기록이 없을 때 위쪽에 보여 줄 글: 첫날 아침이면 시작 안내, 이어서 들어왔으면 어디서 멈췄는지 */
function introFor(run: RunState): { title: string; body: string } {
  if (run.time.day === 1 && run.time.phase === "am") {
    return {
      title: `${run.player.name}의 첫날`,
      body: "보리울에 아침이 밝았다. 일해서 은화와 식량을 모으고, 저녁마다 가족을 먹여야 한다. 서른 번째 밤까지 버텨 보자.",
    };
  }
  return {
    title: `${run.time.day}일차 ${PHASE_LABEL[run.time.phase]}`,
    body: `${josa(run.player.name, "은/는")} 지난번에 멈춘 곳에서 다시 하루를 이어 간다.`,
  };
}

function Panel({ view, run }: { view: GameView; run: RunState }) {
  switch (view) {
    case "ending": return <EndingPanel run={run} />;
    case "combat": return <CombatPanel run={run} />;
    case "event": return <EventPanel run={run} />;
    case "evening": return <EveningPanel run={run} />;
    case "hub": return <HubPanel run={run} />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  shrink: { flexShrink: 1 },
  busy: { opacity: 0.55, pointerEvents: "none" },
});
