import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GameCommand } from "@/core/commands";
import { actionStatus, EXERCISE_USES, LESSON_SKILLS, LESSON_XP, MVP_ACTIONS, SOLO_TRAINING_DC } from "@/core/day/actions";
import { canTrade } from "@/core/day/town";
import { SHOPS, type ShopId } from "@/core/items/shop";
import { dangerTierFor, DEEP_FATIGUE, EXPLORE_CARDS, EXPLORE_REGIONS } from "@/core/events/explore";
import { possibleEvents } from "@/core/events/selector";
import {
  EXERCISE_LABEL, EXERCISE_STATS, isNpcId, josa, NPC_IDS, NPC_LABEL, PLACE_IDS, PLACE_LABEL, REGION_LABEL, SKILL_LABEL, STAT_GROWTH_NOTE, type VisitId,
} from "@/core/labels";
import type { RegionId, RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, ButtonStack, GridCell } from "@/ui/components/Buttons";
import { ACTION_ICON, EXERCISE_ICON, NPC_ICON, REGION_ICON, SKILL_ICON } from "@/ui/gameIcons";
import { exerciseDetail, skillDetail, workBadge } from "@/ui/hubText";
import { ChatCircleDotsIcon, StorefrontIcon, type Icon } from "@/ui/icons";
import { MODE_ICON, MODE_LABEL, modeDetail, reputationNote, SHOP_ICON, SHOP_IDS, SHOP_MODES, type ShopMode } from "@/ui/shopText";
import { ShopView } from "@/ui/views/ShopView";
import { NPC_INFO, PLACE_ICON, PLACE_INFO, REGION_INFO } from "@/ui/placeInfo";
import { colors, hairline, icon as iconToken, radius, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

/**
 * 아래 패널 자리에서 고르는 단계. 훈련·교습·탐험·마을 버튼이 연다.
 * 안내(place)는 어디서 왔는지(from)를 기억해 "뒤로"가 그 목록으로 간다.
 */
export type PickStep =
  | { kind: "trainSolo" }
  | { kind: "trainLesson" }
  | { kind: "explore" }
  | { kind: "village" }
  | { kind: "talk" }
  | { kind: "shops" }
  | { kind: "shop"; shop: ShopId }
  | { kind: "store"; shop: ShopId; mode: ShopMode }
  | { kind: "region"; region: RegionId }
  | { kind: "visit"; id: VisitId };

/** "뒤로"를 누르면 갈 단계. null이면 원래 패널로 */
function backOf(step: PickStep): PickStep | null {
  switch (step.kind) {
    case "region": return { kind: "explore" };
    case "visit": return isNpcId(step.id) ? { kind: "talk" } : { kind: "village" };
    case "talk": return { kind: "village" };
    case "shops": return { kind: "village" };
    case "shop": return { kind: "shops" };
    // 가게 안에서는 아래 패널이 모드 버튼을 그대로 보여 주므로 "뒤로"는 가게 고르기로
    case "store": return { kind: "shops" };
    default: return null;
  }
}

/**
 * 고르기 패널: 게임 화면은 그대로 두고, 아래 행동 칸 자리에 선택지를 펼친다 (넘치면 스크롤).
 * 무엇을 고르는지에 대한 설명은 위쪽 스크립트 창이 보여 준다(PickIntro). 맨 아래는 "뒤로", 안내 단계면 확인 버튼도.
 * 행동을 고르면 명령을 보내고 원래 패널로 돌아간다.
 */
export function PickPanel({ run, step, onStep }: { run: RunState; step: PickStep; onStep: (s: PickStep | null) => void }) {
  const insets = useSafeAreaInsets();
  const send = useGame((s) => s.send);
  const choose = (cmd: GameCommand) => {
    onStep(null);
    send(cmd);
  };
  const back = <ActionButton center compact raised label="뒤로" onPress={() => onStep(backOf(step))} />;

  if (step.kind === "region" || step.kind === "visit") {
    const place = step.kind === "region" ? regionInfo(run, step.region) : visitInfo(run, step.id);
    return (
      <Frame insets={insets.bottom} actions={
        [
          <ActionButton key="go" primary label={place.confirmLabel} cornerNote={place.lockedReason ?? undefined} disabled={!!place.lockedReason} onPress={() => choose(place.cmd)} />,
          <View key="back">{back}</View>,
        ]
      } />
    );
  }

  return (
    <Frame insets={insets.bottom} actions={back}>
      {step.kind === "trainSolo" && <Exercises run={run} onPick={choose} />}
      {step.kind === "trainLesson" && <Lessons run={run} onPick={choose} />}
      {step.kind === "explore" && <Regions run={run} onPick={(region) => onStep({ kind: "region", region })} />}
      {step.kind === "village" && <Village run={run} onStep={onStep} />}
      {step.kind === "talk" && <Talk run={run} onPick={(id) => onStep({ kind: "visit", id })} />}
      {step.kind === "shops" && <Shops onPick={(shop) => onStep({ kind: "shop", shop })} />}
      {step.kind === "shop" && <ShopModes run={run} shop={step.shop} onPick={(mode) => onStep({ kind: "store", shop: step.shop, mode })} />}
      {step.kind === "store" && <ShopModes run={run} shop={step.shop} selected={step.mode} onPick={(mode) => onStep({ kind: "store", shop: step.shop, mode })} />}
    </Frame>
  );
}

interface InfoSection {
  title: string;
  items: string[];
}

/** 스크립트 창에 올리는 설명: 아이콘 + 큰 제목, 한 줄 설명, 본문, 짧은 사실들, 항목 묶음 */
interface Intro {
  icon?: Icon;
  title: string;
  subtitle?: string;
  body: string;
  facts?: string[];
  sections?: InfoSection[];
}

function introOf(run: RunState, step: PickStep): Intro {
  if (step.kind === "region") return regionInfo(run, step.region);
  if (step.kind === "visit") return visitInfo(run, step.id);
  if (step.kind === "shop" || step.kind === "store") {
    const shop = SHOPS[step.shop];
    return { icon: SHOP_ICON[step.shop], title: shop.name, subtitle: shop.owner, body: SHOP_NOTE[step.shop], facts: [`가진 은화 ${run.resources.silver}`, reputationNote(run)] };
  }
  const head = HEAD[step.kind];
  return { icon: head.icon, title: head.title, body: head.note(run) };
}

/** 고르는 동안 스크립트 창(결과 카드 자리)에 보여 줄 설명 */
export function PickIntro({ run, step }: { run: RunState; step: PickStep }) {
  if (step.kind === "store") return <ShopView run={run} shop={step.shop} mode={step.mode} />;
  const { icon: IconC, title, subtitle, body, facts, sections } = introOf(run, step);
  return (
    <View style={styles.intro}>
      <View style={styles.introHead}>
        {IconC && <IconC size={iconToken.lg + 4} weight={iconToken.weight} color={colors.accent} />}
        <Text style={styles.introTitle}>{title}</Text>
      </View>
      {subtitle ? <Text style={styles.introSubtitle}>{subtitle}</Text> : null}
      <Text style={styles.introBody}>{body}</Text>
      {facts && facts.length > 0 && (
        <View style={styles.facts}>
          {facts.map((f) => <Text key={f} style={styles.fact}>{f}</Text>)}
        </View>
      )}
      {sections?.map((sec) => (
        <View key={sec.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{sec.title}</Text>
          {sec.items.map((it) => <Text key={it} style={styles.item}>· {it}</Text>)}
        </View>
      ))}
    </View>
  );
}

/** 선택지 버튼 높이: 이름 / 확률 / 설명 세 줄이 꼭 들어가는 높이로 모든 고르기 패널을 맞춘다 */
const PICK_CELL_HEIGHT = 86;

const def = (id: string) => MVP_ACTIONS.find((a) => a.id === id)!;

const SHOP_NOTE: Record<ShopId, string> = {
  smithy: "브록이 무기와 방어구를 팔고, 닳은 장비를 손봐 준다.",
  healer: "마그다 할멈이 상처를 돌보고 약을 판다.",
  inn: "토비가 식량과 음식을 팔고, 쓸 만한 물건을 사들인다.",
};

const HEAD: Record<"trainSolo" | "trainLesson" | "explore" | "village" | "talk" | "shops", { icon?: Icon; title: string; note: (run: RunState) => string }> = {
  trainSolo: {
    icon: ACTION_ICON.trainSolo,
    title: def("trainSolo").label,
    note: () => `판정 목표 ${SOLO_TRAINING_DC}, 피로 +${def("trainSolo").fatigue}. 성공하면 성장 +${EXERCISE_USES.success}, 실패해도 +${EXERCISE_USES.other} (대성공 +${EXERCISE_USES.critSuccess}). ${STAT_GROWTH_NOTE}`,
  },
  trainLesson: {
    icon: ACTION_ICON.trainLesson,
    title: def("trainLesson").label,
    note: () => `은화 ${def("trainLesson").silverCost}을 내고 판정 없이 성장 +${LESSON_XP}, 피로 +${def("trainLesson").fatigue}`,
  },
  explore: {
    icon: ACTION_ICON.explore,
    title: def("explore").label,
    note: () => `카드 ${EXPLORE_CARDS}장을 보고, 원하면 1장 더. 피로 +${def("explore").fatigue}~${def("explore").fatigue + DEEP_FATIGUE}. 위험 등급은 날이 갈수록 오르고, 곳마다 다르다`,
  },
  village: {
    icon: StorefrontIcon,
    title: "보리울",
    note: (run) => `가게, 주민, 결투장, 의뢰 중개소. 내 명성 ${run.player.fame}`,
  },
  talk: {
    icon: ChatCircleDotsIcon,
    title: "주민과 대화",
    note: () => "행동 1칸, 피로 없음. 누구를 찾아갈까?",
  },
  shops: {
    icon: StorefrontIcon,
    title: "가게",
    note: (run) => `거래는 행동을 쓰지 않는다. 가진 은화 ${run.resources.silver}, ${reputationNote(run)}`,
  },
};

/** 틀: 패널 배경 + 스크롤되는 선택지(안내 단계면 없음) + 맨 아래 버튼 */
function Frame({ insets, actions, children }: { insets: number; actions: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={[styles.panel, { paddingBottom: insets + space.md }]}>
      {children ? (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false}>
          {children}
        </ScrollView>
      ) : null}
      <View style={styles.actions}>
        <ButtonStack>{actions}</ButtonStack>
      </View>
    </View>
  );
}

/** 운동: 마을 메뉴와 같은 2열 버튼 (아이콘 + 이름 / 성공 확률 배지 / 성장) */
function Exercises({ run, onPick }: { run: RunState; onPick: (cmd: GameCommand) => void }) {
  return (
    <ButtonGrid>
      {EXERCISE_STATS.map((stat) => {
        const status = actionStatus(run, CONTENT, "trainSolo", { stat });
        return (
          <GridCell key={stat} minHeight={PICK_CELL_HEIGHT}>
            <ActionButton
              fill
              large
              tight
              icon={EXERCISE_ICON[stat]}
              label={EXERCISE_LABEL[stat]}
              {...(status.available ? workBadge(run, { stat, dc: SOLO_TRAINING_DC }) : {})}
              badgeBelow
              detail={status.available ? exerciseDetail(run, stat) : status.reason}
              disabled={!status.available}
              onPress={() => onPick({ type: "chooseAction", action: "trainSolo", stat })}
            />
          </GridCell>
        );
      })}
    </ButtonGrid>
  );
}

/** 교습: 운동과 같은 2열 버튼 (아이콘 + 숙련 이름 / 레벨·성장 한 줄) */
function Lessons({ run, onPick }: { run: RunState; onPick: (cmd: GameCommand) => void }) {
  return (
    <ButtonGrid>
      {LESSON_SKILLS.map((skill) => {
        const status = actionStatus(run, CONTENT, "trainLesson", { skill });
        return (
          <GridCell key={skill} minHeight={PICK_CELL_HEIGHT}>
            <ActionButton
              fill
              large
              tight
              icon={SKILL_ICON[skill]}
              label={`${SKILL_LABEL[skill]} 훈련`}
              detail={status.available ? skillDetail(run, skill) : status.reason}
              disabled={!status.available}
              onPress={() => onPick({ type: "chooseAction", action: "trainLesson", skill })}
            />
          </GridCell>
        );
      })}
    </ButtonGrid>
  );
}

/** 갈 곳: 운동과 같은 2열 버튼 (아이콘 + 이름 / 오늘 위험 등급, 얻을 수 있는 것). 고를 수 없는 곳도 안내는 볼 수 있다 (사유를 설명 줄에) */
function Regions({ run, onPick }: { run: RunState; onPick: (r: RegionId) => void }) {
  return (
    <ButtonGrid>
      {EXPLORE_REGIONS.map((r) => {
        const status = actionStatus(run, CONTENT, "explore", { region: r });
        return (
          <GridCell key={r} minHeight={PICK_CELL_HEIGHT}>
            <ActionButton
              fill
              large
              tight
              icon={REGION_ICON[r]}
              label={REGION_LABEL[r]}
              detail={status.available ? [`위험 ${dangerTierFor(r, run.time.day)}/3`, ...(REGION_INFO[r] ? [REGION_INFO[r].gains[0]] : [])] : status.reason}
              onPress={() => onPick(r)}
            />
          </GridCell>
        );
      })}
    </ButtonGrid>
  );
}

/** 가게 고르기: 대장간·약초방·여관 */
function Shops({ onPick }: { onPick: (shop: ShopId) => void }) {
  return (
    <ButtonGrid>
      {SHOP_IDS.map((id) => (
        <GridCell key={id} minHeight={PICK_CELL_HEIGHT}>
          <ActionButton fill large tight icon={SHOP_ICON[id]} label={SHOPS[id].name} detail={SHOPS[id].owner} onPress={() => onPick(id)} />
        </GridCell>
      ))}
    </ButtonGrid>
  );
}

/** 가게에서 할 일 두 가지(구매·수리 등). 고르면 스크립트 창에 그 목록을 띄운다. 가게 안에서는 지금 모드를 표시한다 */
function ShopModes({ run, shop, selected, onPick }: { run: RunState; shop: ShopId; selected?: ShopMode; onPick: (mode: ShopMode) => void }) {
  return (
    <ButtonGrid>
      {SHOP_MODES[shop].map((mode) => (
        <GridCell key={mode} minHeight={PICK_CELL_HEIGHT}>
          <ActionButton
            fill
            large
            tight
            icon={MODE_ICON[mode]}
            label={MODE_LABEL[mode]}
            detail={modeDetail(run, shop, mode)}
            selected={selected === mode}
            onPress={() => onPick(mode)}
          />
        </GridCell>
      ))}
    </ButtonGrid>
  );
}

/** 마을: 가게·주민·장소는 다음 단계로 */
function Village({ run, onStep }: { run: RunState; onStep: (s: PickStep | null) => void }) {
  const trade = canTrade(run);
  const talk = NPC_IDS.some((id) => actionStatus(run, CONTENT, "village", { npc: id }).available);
  return (
    <ButtonGrid>
      <GridCell minHeight={PICK_CELL_HEIGHT}>
        <ActionButton
          fill
          large
          icon={StorefrontIcon}
          label="가게"
          detail={trade ? "행동 소모 없음" : "지금은 갈 수 없음"}
          disabled={!trade}
          onPress={() => onStep({ kind: "shops" })}
        />
      </GridCell>
      <GridCell minHeight={PICK_CELL_HEIGHT}>
        <ActionButton
          fill
          large
          icon={ChatCircleDotsIcon}
          label="주민과 대화"
          detail={talk ? "행동 1칸" : "지금은 대화할 수 없음"}
          onPress={() => onStep({ kind: "talk" })}
        />
      </GridCell>
      {PLACE_IDS.map((id) => {
        const status = actionStatus(run, CONTENT, "village", { npc: id });
        return (
          <GridCell key={id} minHeight={PICK_CELL_HEIGHT}>
            <ActionButton
              fill
              large
              tight
              icon={PLACE_ICON[id]}
              label={PLACE_LABEL[id]}
              detail={status.available ? "행동 1칸" : status.reason}
              onPress={() => onStep({ kind: "visit", id })}
            />
          </GridCell>
        );
      })}
    </ButtonGrid>
  );
}

/** 주민: 마을 메뉴와 같은 2열 버튼 (아이콘 + 이름 / 하는 일). 대화할 수 없는 사람도 안내는 볼 수 있다 (사유를 설명 줄에) */
function Talk({ run, onPick }: { run: RunState; onPick: (id: VisitId) => void }) {
  return (
    <ButtonGrid>
      {NPC_IDS.map((id) => {
        const status = actionStatus(run, CONTENT, "village", { npc: id });
        return (
          <GridCell key={id} minHeight={PICK_CELL_HEIGHT}>
            <ActionButton
              fill
              large
              tight
              icon={NPC_ICON[id]}
              label={NPC_LABEL[id]}
              detail={status.available ? NPC_INFO[id].role : status.reason}
              onPress={() => onPick(id)}
            />
          </GridCell>
        );
      })}
    </ButtonGrid>
  );
}

interface PlaceView extends Intro {
  confirmLabel: string;
  lockedReason: string | null;
  cmd: GameCommand;
}

/** 갈 곳 안내: 어떤 곳인지, 무엇을 얻고 무엇을 조심할지, 지금 나올 수 있는 일이 몇 가지인지 */
function regionInfo(run: RunState, region: RegionId): PlaceView {
  const info = REGION_INFO[region];
  const status = actionStatus(run, CONTENT, "explore", { region });
  const tier = dangerTierFor(region, run.time.day);
  const explore = def("explore");
  return {
    icon: REGION_ICON[region],
    title: REGION_LABEL[region],
    subtitle: `위험 등급 ${tier}/3, 깊은 곳 ${Math.min(3, tier + 1)}`,
    body: info?.summary ?? "",
    facts: [`카드 ${EXPLORE_CARDS}~${EXPLORE_CARDS + 1}장`, `피로 +${explore.fatigue}~${explore.fatigue + DEEP_FATIGUE}`, `나올 수 있는 일 ${possibleEvents(run, CONTENT, "explore", region).length}가지`],
    sections: info ? [{ title: "얻을 수 있는 것", items: info.gains }, { title: "조심할 것", items: info.risks }] : [],
    confirmLabel: `${josa(REGION_LABEL[region], "으로/로")} 간다`,
    lockedReason: status.available ? null : status.reason,
    cmd: { type: "chooseAction", action: "explore", region },
  };
}

/** 주민·결투장·의뢰 중개소 안내 */
function visitInfo(run: RunState, id: VisitId): PlaceView {
  const status = actionStatus(run, CONTENT, "village", { npc: id });
  const lockedReason = status.available ? null : status.reason;
  const cmd: GameCommand = { type: "chooseAction", action: "village", npc: id };
  if (isNpcId(id)) {
    const info = NPC_INFO[id];
    const talks = possibleEvents(run, CONTENT, "npc", undefined, id).length;
    return {
      icon: ChatCircleDotsIcon,
      title: NPC_LABEL[id],
      subtitle: info.role,
      body: info.summary,
      facts: ["행동 1칸", "피로 없음", talks > 0 ? `이야기 ${talks}가지` : "오늘은 바쁨"],
      sections: [{ title: "이야기하면", items: info.gains }],
      confirmLabel: "대화한다",
      lockedReason,
      cmd,
    };
  }
  const info = PLACE_INFO[id];
  return {
    icon: PLACE_ICON[id],
    title: PLACE_LABEL[id],
    subtitle: info.subtitle,
    body: info.summary,
    facts: ["행동 1칸", "피로 +2", `내 명성 ${run.player.fame}`],
    sections: [{ title: "얻을 수 있는 것", items: info.gains }, { title: "조심할 것", items: info.risks }],
    confirmLabel: "들어간다",
    lockedReason,
    cmd,
  };
}

const styles = StyleSheet.create({
  // 하루 패널과 같은 바탕. 선택지가 길면 위쪽 기록 칸을 줄이고 그래도 넘치면 선택지만 스크롤한다
  panel: {
    flexShrink: 1,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderColor: colors.borderStrong,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: { gap: space.md },
  actions: {},
  // 스크립트 창의 첫 안내("3일차 오전")와 같은 크기·같은 위 여백
  intro: { gap: space.sm, paddingTop: space.md },
  introHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  introTitle: { ...type.display, fontSize: 28, lineHeight: 36, color: colors.text, flexShrink: 1 },
  introSubtitle: { ...type.caption, color: colors.textDim },
  introBody: { ...type.body, color: colors.textDim },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
  fact: {
    ...type.label,
    color: colors.textDim,
    borderWidth: hairline,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    overflow: "hidden",
  },
  section: { gap: space.xs, marginTop: space.sm },
  sectionTitle: { ...type.overline, color: colors.textFaint },
  item: { ...type.body, color: colors.textDim },
});
