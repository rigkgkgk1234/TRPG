import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { josa, PHASE_LABEL } from "@/core/labels";
import type { RunState } from "@/core/types";
import { selectView, type GameView } from "@/store/selectors";
import { useGame, useShownRun } from "@/store/gameStore";
import { NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { HIT_FX_MS } from "@/ui/components/HitEffect";
import { isVolley, VOLLEY_GAP_MS, VOLLEY_SHOTS } from "@/store/volley";
import { RunStatusBar } from "@/ui/components/RunStatusBar";
import { TurnLog } from "@/ui/components/TurnLog";
import { colors } from "@/ui/theme";
import { EndingHeader, EndingPanel } from "@/ui/views/EndingView";
import { CombatPanel } from "@/ui/views/CombatView";
import { EventPanel } from "@/ui/views/EventView";
import { EveningPanel } from "@/ui/views/EveningView";
import { HubPanel } from "@/ui/views/HubView";
import { PickIntro, PickPanel, type PickStep } from "@/ui/views/PickPanel";

/**
 * 게임 본 화면: 상태 바 / 결과 기록 / 아래 패널. 허브·이벤트·전투·저녁·엔딩은 라우터 이동 없이 상태에서 고른다. (ARCHITECTURE 3-3)
 * 결과 카드가 연출되는 동안에는 명령 전 상태를 그려서, 숫자와 화면 전환이 주사위보다 먼저 결과를 알려 주지 않게 한다.
 */
export default function GameScreen() {
  const run = useGame((s) => s.run);
  const shown = useShownRun();
  const busy = useGame((s) => s.playing !== null);
  const notice = useGame((s) => s.notice);
  const shake = useHurtShake();
  /** 훈련·교습·탐험·마을을 누르면 아래 패널 자리에 펼치는 고르기 단계. 그때의 날·때·뷰를 같이 적어 두고, 바뀌면 버린다 */
  const [pick, setPick] = useState<{ step: PickStep; at: string } | null>(null);
  // 저장 기능(5주차) 전에는 앱을 새로 고치면 회차가 사라진다 → 타이틀로
  if (!run || !shown) return <Redirect href="/" />;

  const view = selectView(shown);
  const at = `${shown.time.day}-${shown.time.phase}-${view}`;
  const step = (view === "hub" || view === "evening") && pick?.at === at ? pick.step : null;
  const onPick = (s: PickStep | null) => setPick(s ? { step: s, at } : null);
  return (
    <Animated.View style={[styles.root, { transform: [{ translateX: shake }] }]}>
      {view === "ending" ? <EndingHeader run={shown} /> : <RunStatusBar run={shown} />}
      <TurnLog
        compact={view === "combat"}
        intro={notice ? { title: "마지막 저장으로 돌아왔다", body: notice } : introFor(run)}
        cover={step ? { key: JSON.stringify(step), node: <PickIntro run={shown} step={step} /> } : undefined}
      />
      {/* 이벤트 패널과 고르기 패널은 글이 길면 줄어들어 스크롤한다. 전투 패널은 높이를 고정하고 결과 카드가 나머지를 쓴다 (나머지 패널은 내용 높이 그대로) */}
      {/* 연출 중에는 누를 수 없게. 전투 칸은 맞는 효과가 보여야 하므로 흐리게 하지 않는다 */}
      <View style={[(view === "event" || view === "combat" || step) && styles.shrink, busy && (view === "combat" ? styles.locked : styles.busy)]}>
        {step ? <PickPanel run={shown} step={step} onStep={onPick} /> : <Panel view={view} run={shown} onPick={onPick} />}
      </View>
    </Animated.View>
  );
}

/**
 * 적에게 맞으면 화면 전체가 짧게 좌우로 흔들린다 (급소면 더 세게). 내가 둔기·검·활로 맞혀도 흔들린다 (둔기가 가장 세다, 활은 화살이 닿을 때).
 * "동작 줄이기"면 연출 자체가 오지 않는다
 */
function useHurtShake(): Animated.Value {
  const fx = useGame((s) => s.fx);
  const [x] = useState(() => new Animated.Value(0));
  const hurt = fx?.fx.side === "foe" && fx.fx.hit;
  const weapon = fx?.fx.side === "player" && fx.fx.hit ? fx.fx.weapon : null;
  const smash = weapon === "blunt" || weapon === "blade" || weapon === "bow" ? weapon : null;
  const hurtSeq = hurt || smash ? fx!.seq : null;
  const crit = !!fx?.fx.crit;
  const volley = !!fx && isVolley(fx.fx);
  useEffect(() => {
    if (hurtSeq === null) return;
    // 활 대성공 연사: 화살이 꽂힐 때마다 작게 한 번씩
    if (volley) {
      const sway = (to: number) => Animated.timing(x, { toValue: to, duration: VOLLEY_GAP_MS / 3, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE_DRIVER });
      Animated.sequence([
        Animated.delay(HIT_FX_MS * 0.2),
        ...Array.from({ length: VOLLEY_SHOTS }, (_, i) => Animated.sequence([sway(-(3 + i * 2)), sway(2 + i), sway(0)])),
      ]).start();
      return;
    }
    const a = smash === "blunt" ? (crit ? 11 : 7) : smash ? (crit ? 7 : 4) : crit ? 9 : 5;
    // 검·활은 길고 부드럽게 출렁이고, 둔기와 적에게 맞을 때는 짧게 덜컹거린다
    const soft = smash === "blade" || smash === "bow";
    Animated.sequence([
      Animated.delay(smash === "bow" ? HIT_FX_MS * 0.2 : 0),
      ...(soft ? [a, -a * 0.6, a * 0.3, 0] : [a, -a, a * 0.6, -a * 0.4, 0]).map((v) =>
        Animated.timing(x, { toValue: v, duration: soft ? 90 : 45, easing: soft ? Easing.inOut(Easing.sin) : undefined, useNativeDriver: NATIVE_DRIVER })),
    ]).start();
  }, [hurtSeq, smash, crit, volley, x]);
  return x;
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

function Panel({ view, run, onPick }: { view: GameView; run: RunState; onPick: (s: PickStep) => void }) {
  switch (view) {
    case "ending": return <EndingPanel run={run} />;
    case "combat": return <CombatPanel run={run} />;
    case "event": return <EventPanel run={run} />;
    case "evening": return <EveningPanel run={run} />;
    case "hub": return <HubPanel run={run} onPick={onPick} />;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  shrink: { flexShrink: 1 },
  busy: { opacity: 0.55, pointerEvents: "none" },
  locked: { pointerEvents: "none" },
});
