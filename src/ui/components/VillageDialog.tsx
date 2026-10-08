import { useState } from "react";
import { actionStatus } from "@/core/day/actions";
import { canTrade } from "@/core/day/town";
import { possibleEvents } from "@/core/events/selector";
import { NPC_IDS, NPC_LABEL, type NpcId } from "@/core/labels";
import type { RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonGrid, GridCell } from "@/ui/components/Buttons";
import { PickCell, PickGrid } from "@/ui/components/Controls";
import { DialogFrame, DialogHead, InfoDialog } from "@/ui/components/InfoDialog";
import { ChatCircleDotsIcon, StorefrontIcon } from "@/ui/icons";
import { NPC_INFO } from "@/ui/placeInfo";
import { pushOnce } from "@/ui/navigate";

/**
 * 마을 창: 먼저 [가게] [주민과 대화] 둘 중 하나를 고른다.
 * 가게는 마을 화면(대장간·약초방·여관 탭)을 열고(행동 소모 없음), 대화는 주민 고르기 → 그 사람의 안내 창 → "대화한다"(행동 1칸).
 */
export function VillageDialog({ run, visible, onClose }: { run: RunState; visible: boolean; onClose: () => void }) {
  const send = useGame((s) => s.send);
  const [step, setStep] = useState<"menu" | "talk">("menu");
  const [npc, setNpc] = useState<NpcId | null>(null);
  const close = () => {
    setNpc(null);
    setStep("menu");
    onClose();
  };

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
      <DialogHead icon={StorefrontIcon} title="보리울" subtitle="가게에 들르거나 주민과 대화한다" />
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
      </ButtonGrid>
    </DialogFrame>
  );
}

