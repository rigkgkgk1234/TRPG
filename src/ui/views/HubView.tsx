import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { actionStatus, jobOf, MVP_ACTIONS, REST_HP } from "@/core/day/actions";
import { PHASE_LABEL } from "@/core/labels";
import type { DailyActionDef, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { townCells } from "@/ui/components/TownCells";
import { ACTION_ICON, JOB_ICON } from "@/ui/gameIcons";
import { isPicking, pickingStatus, workBadge } from "@/ui/hubText";
import { CaretDownIcon, CaretUpIcon } from "@/ui/icons";
import { colors, hairline, icon, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";
import { useSheet } from "@/ui/useSheet";
import type { PickStep } from "@/ui/views/PickPanel";

/**
 * 허브 격자의 행동. 마을 볼일은 "마을" 고르기 패널에서 고르고(가게와 한곳에), 휴식은 맨 아래 한 줄을 따로 쓴다.
 * 순서: [일][훈련] [교습][탐험] / [가방][마을] / [휴식]
 */
const HUB_ACTIONS = MVP_ACTIONS.filter((a) => a.id !== "village" && a.id !== "rest");
const REST = MVP_ACTIONS.find((a) => a.id === "rest")!;

/**
 * 오전·오후 행동을 고르는 아래 패널. 버튼은 엄지가 닿는 아래쪽에 모은다.
 * 이벤트 창처럼 손잡이를 끌어내리거나 누르면 "N일차 오전 행동" 한 줄만 남기고 접는다 (위쪽 기록을 넓게 볼 때). 때가 바뀌면 다시 편다.
 */
export function HubPanel({ run, onPick }: { run: RunState; onPick: (step: PickStep) => void }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);

  const choose = (def: DailyActionDef) => {
    if (isPicking(def.id)) onPick({ kind: def.id });
    else send({ type: "chooseAction", action: def.id });
  };

  const sheet = useSheet(`${run.time.day}/${run.time.phase}`);
  const Caret = sheet.collapsed ? CaretUpIcon : CaretDownIcon;

  return (
    <Animated.View style={[styles.panel, { paddingBottom: insets.bottom + space.md, transform: [{ translateY: sheet.drag }] }]}>
      <View {...sheet.panHandlers}>
        <Pressable
          onPress={sheet.toggle}
          accessibilityRole="button"
          accessibilityLabel={sheet.collapsed ? "행동 칸 펼치기" : "행동 칸 접기"}
          style={styles.grab}
        >
          <View style={styles.handle} />
          {!sheet.collapsed && <Caret size={icon.sm} weight={icon.weight} color={colors.textFaint} style={styles.caretOpen} />}
          {sheet.collapsed && (
            <View style={styles.header}>
              <Text style={styles.title}>{run.time.day}일차 {PHASE_LABEL[run.time.phase]} 행동</Text>
              <Caret size={icon.sm} weight={icon.weight} color={colors.textFaint} style={styles.caret} />
            </View>
          )}
        </Pressable>
      </View>
      {!sheet.collapsed && <ButtonGrid>
        {HUB_ACTIONS.map((def) => {
          const status = isPicking(def.id) ? pickingStatus(run, def.id) : actionStatus(run, CONTENT, def.id);
          // 일만 확률·보수를 적고, 고르기 패널을 여는 훈련·교습·탐험은 이름만 크게 (잠기면 사유는 보인다)
          const plain = def.id !== "work";
          return (
            <GridCell key={def.id}>
              <ActionButton
                fill
                icon={def.id === "work" ? JOB_ICON[run.player.job] : ACTION_ICON[def.id]}
                label={def.id === "work" ? jobOf(CONTENT, run).work.label : def.label}
                {...(status.available && def.id === "work" ? workBadge(run, jobOf(CONTENT, run).work.check) : {})}
                badgeBelow
                large={plain}
                detail={!status.available ? status.reason : plain ? undefined : actionDetail(run, def)}
                disabled={!status.available}
                onPress={() => choose(def)}
              />
            </GridCell>
          );
        })}
        {townCells(run, () => onPick({ kind: "village" }))}
        <GridCell>
          <RestButton run={run} onPress={() => choose(REST)} />
        </GridCell>
      </ButtonGrid>}
    </Animated.View>
  );
}

function RestButton({ run, onPress }: { run: RunState; onPress: () => void }) {
  const status = actionStatus(run, CONTENT, "rest");
  return (
    <ActionButton
      icon={ACTION_ICON.rest}
      label={REST.label}
      detail={status.available ? actionDetail(run, REST) : status.reason}
      disabled={!status.available}
      onPress={onPress}
    />
  );
}

/** 행동 버튼의 두 번째 줄: 비용·보상·피로 (항목 단위로 줄을 바꾼다) */
function actionDetail(run: RunState, def: DailyActionDef): string[] {
  switch (def.id) {
    case "work": {
      const w = jobOf(CONTENT, run).work;
      return [`은화 ${w.baseSilver}~${w.baseSilver + w.bonusSilver * 2}`, `피로 +${w.fatigue}`];
    }
    case "rest": return [`피로 ${def.fatigue}`, `HP +${REST_HP}`];
    default: return [];
  }
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderColor: colors.borderStrong,
  },
  /** 손잡이 (+ 접혔을 때 제목 줄): 누르면 접고 펴고, 끌어서도 접는다. 이벤트 창 손잡이와 같은 모양 */
  grab: { gap: space.sm, paddingBottom: space.xs },
  handle: { alignSelf: "center", width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.borderStrong },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { ...type.heading, color: colors.text, flexShrink: 1 },
  caret: { marginLeft: "auto" },
  // 펼쳤을 때 내리는 화살표: 손잡이 줄 오른쪽 끝 (줄 높이는 늘리지 않는다)
  caretOpen: { position: "absolute", right: 0, top: 2 },
});
