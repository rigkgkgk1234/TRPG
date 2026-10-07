import { useMemo, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEEP_FATIGUE, EXPLORE_CARDS } from "@/core/events/explore";
import { sceneView, type ChoiceView, type ExploreProgress } from "@/core/events/runner";
import { MODE_LABEL, REGION_LABEL } from "@/core/labels";
import type { EventCategory, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { NATIVE_DRIVER } from "@/ui/components/DiceRoll";
import { ArrowRightIcon, CaretDownIcon, CaretRightIcon, CaretUpIcon, ChatCircleDotsIcon, LockSimpleIcon, MoonStarsIcon, ScrollIcon, SignOutIcon, SkullIcon, SunHorizonIcon, TreeIcon, type Icon } from "@/ui/icons";
import { colors, icon, radius, space, type } from "@/ui/theme";

/**
 * 이벤트 패널: 장면 글 → 선택지. 선택지마다 성공 확률·비용·잠김 사유·위험 표시를 붙인다. (SYSTEM_SPEC 4-2)
 * 고른 결과(굴림·결과 문장·변화)는 위쪽 결과 카드가 보여 주고, 이 패널은 다음 장면으로 바뀐다.
 * 바텀시트처럼 손잡이(제목 줄)를 끌어내리면 제목 줄만 남기고 접히고, 끌어올리거나 누르면 다시 펼친다 (위쪽 결과 기록을 넓게 볼 때).
 * 펼친 높이는 내용만큼이고, 글과 선택지가 화면에 다 들어가지 않으면 제목 아래를 스크롤한다.
 */
export function EventPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const view = sceneView(run, CONTENT);
  // 장면이 바뀌면 스크롤을 맨 위로 (새 ScrollView로 갈아 끼운다) + 접어 둔 창을 다시 편다
  const sceneKey = `${run.activeEvent?.eventId}/${run.activeEvent?.sceneId}/${view?.kind}`;
  const sheet = useSheet(sceneKey);
  if (!view) return null;

  return (
    <Animated.View style={[styles.panel, sheet.collapsed && { paddingBottom: insets.bottom + space.md }, { transform: [{ translateY: sheet.drag }] }]}>
      <View {...sheet.panHandlers}>
        <Pressable
          onPress={sheet.toggle}
          accessibilityRole="button"
          accessibilityLabel={sheet.collapsed ? "이벤트 창 펼치기" : "이벤트 창 접기"}
          style={styles.grab}
        >
          <View style={styles.handle} />
          {view.kind === "deeper" ? (
            <Header title={`${REGION_LABEL[view.region]} 깊은 곳`} progress={view.progress} collapsed={sheet.collapsed} />
          ) : (
            <Header title={view.title} progress={view.progress} category={view.category} collapsed={sheet.collapsed} />
          )}
        </Pressable>
      </View>
      {!sheet.collapsed && (
        <ScrollView
          key={sceneKey}
          style={styles.scroll}
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + space.md }]}
        >
          {view.kind === "deeper" ? (
            <>
              <Text lineBreakStrategyIOS="hangul-word" style={styles.text}>
                안쪽은 더 어둡고 조용하다. 더 들어가면 위험하지만, 남들이 못 본 것을 찾을지도 모른다.
              </Text>
              <View style={styles.choices}>
                <ActionButton
                  icon={CaretRightIcon}
                  label="더 깊이 들어간다"
                  detail={["카드 1장 더", "위험 등급 +1", `피로 +${DEEP_FATIGUE}`]}
                  onPress={() => send({ type: "goDeeper", yes: true })}
                />
                <ActionButton icon={SignOutIcon} label="마을로 돌아간다" onPress={() => send({ type: "goDeeper", yes: false })} />
              </View>
            </>
          ) : (
            <>
              <Text lineBreakStrategyIOS="hangul-word" style={styles.text}>{view.text}</Text>
              <View style={styles.choices}>
                {view.kind === "continue" ? (
                  <ActionButton primary icon={ArrowRightIcon} label="계속" onPress={() => send({ type: "continue" })} />
                ) : (
                  view.choices.map((c) => (
                    <ChoiceButton key={c.id} choice={c} onPress={() => send({ type: "chooseChoice", choiceId: c.id })} />
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </Animated.View>
  );
}

/** 이만큼 끌면 접거나 편다 */
const SWIPE_DISTANCE = 40;

/**
 * 끌어서 접고 펴는 시트. 펼친 상태에서 아래로 끌면 손가락을 따라 내려가고, 놓을 때 거리가 충분하면 접는다.
 * 접힌 상태에서는 위로 끌거나 누르면 편다. 새 장면이 오면 선택지를 놓치지 않게 다시 편다.
 */
function useSheet(sceneKey: string) {
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

const CATEGORY_ICON: Partial<Record<EventCategory, Icon>> = { morning: SunHorizonIcon, night: MoonStarsIcon, npc: ChatCircleDotsIcon };

/** 탐험 중이면 숲 아이콘, 아침·밤·마을 볼일은 그에 맞는 아이콘, 스토리는 두루마리 */
function Header({ title, progress, category, collapsed }: { title: string; progress?: ExploreProgress; category?: EventCategory; collapsed: boolean }) {
  const HeaderIcon = progress ? TreeIcon : (category && CATEGORY_ICON[category]) || ScrollIcon;
  const Caret = collapsed ? CaretUpIcon : CaretDownIcon;
  return (
    <View style={styles.header}>
      <HeaderIcon size={icon.md} weight={icon.weight} color={colors.accent} />
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {progress && <Text style={styles.progress}>{progressText(progress)}</Text>}
      <Caret size={icon.sm} weight={icon.weight} color={colors.textFaint} style={!progress && styles.caretEnd} />
    </View>
  );
}

/** "카드 1/2", 더 깊이 들어갔으면 "깊은 곳" */
function progressText(p: ExploreProgress): string {
  return p.deep ? "깊은 곳" : `카드 ${Math.min(p.card, EXPLORE_CARDS)}/${EXPLORE_CARDS}`;
}

/** 선택지 버튼: 확률은 오른쪽 배지, 비용·유불리·잠김 사유는 둘째 줄, 실패가 위험하면 해골 */
function ChoiceButton({ choice: c, onPress }: { choice: ChoiceView; onPress: () => void }) {
  const locked = c.lockedReason !== null;
  const detail = locked
    ? [c.lockedReason!]
    : [...c.cost, c.mode && c.mode !== "normal" ? MODE_LABEL[c.mode] : null, c.danger ? (c.chance === undefined ? "싸움이 벌어진다" : "실패하면 위험") : null].filter((x): x is string => !!x);
  return (
    <ActionButton
      label={c.label}
      icon={locked ? LockSimpleIcon : c.danger ? SkullIcon : undefined}
      iconColor={!locked && c.danger ? colors.fail : undefined}
      badge={!locked && c.chance !== undefined ? `${Math.round(c.chance * 100)}%` : undefined}
      detail={detail.length > 0 ? detail : undefined}
      disabled={locked}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  panel: {
    flexShrink: 1,
    paddingTop: space.sm,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  // 내용이 짧으면 내용만큼, 길면 남은 자리까지만 차지하고 스크롤한다
  scroll: { flexGrow: 0, flexShrink: 1 },
  body: { paddingHorizontal: space.lg, gap: space.md },
  /** 손잡이 + 제목 줄: 누르면 접고 펴고, 끌어서도 접는다 */
  grab: { gap: space.sm },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg },
  caretEnd: { marginLeft: "auto" },
  title: { ...type.heading, color: colors.text, flexShrink: 1 },
  progress: { ...type.label, color: colors.textFaint, marginLeft: "auto", fontVariant: ["tabular-nums"] },
  text: { ...type.body, color: colors.text },
  choices: { gap: space.sm, marginTop: space.xs },
});
