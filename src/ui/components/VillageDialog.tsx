import { useState } from "react";
import { actionStatus } from "@/core/day/actions";
import { canTrade } from "@/core/day/town";
import { possibleEvents } from "@/core/events/selector";
import { isNpcId, NPC_IDS, NPC_LABEL, PLACE_LABEL, type PlaceId, type VisitId } from "@/core/labels";
import type { RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { PickCell, PickGrid } from "@/ui/components/Controls";
import { DialogFrame, DialogHead, InfoDialog } from "@/ui/components/InfoDialog";
import { ChatCircleDotsIcon, ScrollIcon, StorefrontIcon, SwordIcon, type Icon } from "@/ui/icons";
import { NPC_INFO, PLACE_INFO } from "@/ui/placeInfo";
import { pushOnce } from "@/ui/navigate";

const PLACE_ICON: Record<PlaceId, Icon> = { arena: SwordIcon, guild: ScrollIcon };

/**
 * 마을 창: [가게] [주민과 대화] [결투장] [의뢰 중개소] 중에서 고른다.
 * 가게는 마을 화면(대장간·약초방·여관 탭)을 열고(행동 소모 없음), 대화는 주민 고르기 → 그 사람의 안내 창 → "대화한다"(행동 1칸).
 * 결투장·의뢰 중개소는 안내 창 → "들어간다"(행동 1칸). 둘 다 명성을 올리는 곳이다.
 */
export function VillageDialog({ run, visible, onClose }: { run: RunState; visible: boolean; onClose: () => void }) {
  const send = useGame((s) => s.send);
  const [step, setStep] = useState<"menu" | "talk">("menu");
  const [npc, setNpc] = useState<VisitId | null>(null);
  const close = () => {
    setNpc(null);
    setStep("menu");
    onClose();
  };

  if (npc && !isNpcId(npc)) {
    const info = PLACE_INFO[npc];
    const status = actionStatus(run, CONTENT, "village", { npc });
    return (
      <InfoDialog
        visible={visible}
        icon={PLACE_ICON[npc]}
        title={PLACE_LABEL[npc]}
        subtitle={info.subtitle}
        body={info.summary}
        facts={["행동 1칸", "겨루면 피로 +2", `내 명성 ${run.player.fame}`]}
        sections={[{ title: "얻을 수 있는 것", items: info.gains }, { title: "조심할 것", items: info.risks }]}
        confirmLabel="들어간다"
        lockedReason={status.available ? null : status.reason}
        onConfirm={() => {
          send({ type: "chooseAction", action: "village", npc });
          close();
        }}
        onClose={() => setNpc(null)}
      />
    );
  }

  if (npc) {
    const info = NPC_INFO[npc];
    const status = actionStatus(run, CONTENT, "village", { npc });
    const talks = possibleEvents(run, CONTENT, "npc", undefined, npc).length;
    return (
      <InfoDialog
        visible={visible}
        icon={ChatCircleDotsIcon}
        title={NPC_LABEL[npc]}
        subtitle={info.role}
        body={info.summary}
        facts={["행동 1칸", "피로 없음", talks > 0 ? `오늘 나눌 이야기 ${talks}가지` : "오늘은 바빠 보인다"]}
        sections={[{ title: "이야기하면", items: info.gains }]}
        confirmLabel="대화한다"
        lockedReason={status.available ? null : status.reason}
        onConfirm={() => {
          send({ type: "chooseAction", action: "village", npc });
          close();
        }}
        onClose={() => setNpc(null)}
      />
    );
  }

  if (step === "talk") {
    const back = () => setStep("menu");
    return (
      <DialogFrame visible={visible} onClose={close} actions={<ActionButton center label="뒤로" onPress={back} />}>
        <DialogHead icon={ChatCircleDotsIcon} title="주민과 대화" subtitle="행동 1칸, 피로 없음. 누구를 찾아갈까?" />
        <PickGrid>
          {NPC_IDS.map((id) => {
            const status = actionStatus(run, CONTENT, "village", { npc: id });
            return (
              <PickCell
                key={id}
                label={NPC_LABEL[id]}
                sub={NPC_INFO[id].role}
                reason={status.available ? undefined : status.reason}
                onPress={() => setNpc(id)}
              />
            );
          })}
        </PickGrid>
      </DialogFrame>
    );
  }

  const trade = canTrade(run);
  const talk = NPC_IDS.some((id) => actionStatus(run, CONTENT, "village", { npc: id }).available);
  const openShop = () => {
    if (pushOnce({ pathname: "/game/town" })) close();
  };

  return (
    <DialogFrame visible={visible} onClose={close} actions={<ActionButton center label="닫기" onPress={close} />}>
      <DialogHead icon={StorefrontIcon} title="보리울" subtitle={`가게·주민·결투장·의뢰 중개소. 내 명성 ${run.player.fame}`} />
      <ButtonGrid>
        <GridCell>
          <ActionButton
            fill
            large
            icon={StorefrontIcon}
            label="가게"
            detail={trade ? "행동 소모 없음" : "지금은 갈 수 없다"}
            disabled={!trade}
            onPress={openShop}
          />
        </GridCell>
        <GridCell>
          <ActionButton
            fill
            large
            icon={ChatCircleDotsIcon}
            label="주민과 대화"
            detail={talk ? "행동 1칸" : "지금은 대화할 수 없다"}
            onPress={() => setStep("talk")}
          />
        </GridCell>
        {(["arena", "guild"] as const).map((id) => {
          const status = actionStatus(run, CONTENT, "village", { npc: id });
          return (
            <GridCell key={id}>
              <ActionButton
                fill
                large
                icon={PLACE_ICON[id]}
                label={PLACE_LABEL[id]}
                detail={status.available ? "행동 1칸" : status.reason}
                onPress={() => setNpc(id)}
              />
            </GridCell>
          );
        })}
      </ButtonGrid>
    </DialogFrame>
  );
}

