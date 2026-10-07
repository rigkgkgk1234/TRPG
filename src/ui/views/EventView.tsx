import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DEEP_FATIGUE, EXPLORE_CARDS } from "@/core/events/explore";
import { sceneView, type ChoiceView, type ExploreProgress } from "@/core/events/runner";
import { MODE_LABEL, REGION_LABEL } from "@/core/labels";
import type { RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { ArrowRightIcon, CaretRightIcon, LockSimpleIcon, ScrollIcon, SignOutIcon, SkullIcon, TreeIcon } from "@/ui/icons";
import { colors, icon, radius, space, type } from "@/ui/theme";

/**
 * 이벤트 패널: 장면 글 → 선택지. 선택지마다 성공 확률·비용·잠김 사유·위험 표시를 붙인다. (SYSTEM_SPEC 4-2)
 * 고른 결과(굴림·결과 문장·변화)는 위쪽 결과 카드가 보여 주고, 이 패널은 다음 장면으로 바뀐다.
 */
export function EventPanel({ run }: { run: RunState }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const view = sceneView(run, CONTENT);
  if (!view) return null;

  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      {view.kind === "deeper" ? (
        <>
          <Header title={`${REGION_LABEL[view.region]} 깊은 곳`} progress={view.progress} />
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
          <Header title={view.title} progress={view.progress} />
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
    </View>
  );
}

/** 탐험 중이면 숲 아이콘, 마을 일(스토리)이면 두루마리 */
function Header({ title, progress }: { title: string; progress?: ExploreProgress }) {
  const HeaderIcon = progress ? TreeIcon : ScrollIcon;
  return (
    <View style={styles.header}>
      <HeaderIcon size={icon.md} weight={icon.weight} color={colors.accent} />
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {progress && <Text style={styles.progress}>{progressText(progress)}</Text>}
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
    paddingHorizontal: space.lg,
    paddingTop: space.lg + 4,
    gap: space.md,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.heading, color: colors.text, flexShrink: 1 },
  progress: { ...type.label, color: colors.textFaint, marginLeft: "auto", fontVariant: ["tabular-nums"] },
  text: { ...type.body, color: colors.text },
  choices: { gap: space.sm, marginTop: space.xs },
});
