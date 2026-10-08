import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { actionStatus } from "@/core/day/actions";
import { canTrade } from "@/core/day/town";
import { possibleEvents } from "@/core/events/selector";
import { SHOPS, type ShopId } from "@/core/items/shop";
import { NPC_IDS, NPC_LABEL, type NpcId } from "@/core/labels";
import type { RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { ActionButton } from "@/ui/components/Buttons";
import { PickCell, PickGrid } from "@/ui/components/Controls";
import { DialogFrame, DialogHead, DialogSectionTitle, InfoDialog } from "@/ui/components/InfoDialog";
import { ChatCircleDotsIcon, StorefrontIcon } from "@/ui/icons";
import { NPC_INFO } from "@/ui/placeInfo";
import { colors, space, type } from "@/ui/theme";

const SHOP_IDS: ShopId[] = ["smithy", "healer", "inn"];

/** 가게마다 무엇을 하는지 (가게 칸의 둘째 줄) */
const SHOP_NOTE: Record<ShopId, string> = {
  smithy: "장비 사기와 수리",
  healer: "약과 상처 치료",
  inn: "식량·화살, 팔기, 빚",
};

/**
 * 마을 창: 가게에 들르거나(행동 소모 없음) 주민과 대화한다(행동 1칸).
 * 주민을 고르면 그 사람의 안내 창으로 바뀌고, "대화한다"를 눌러야 행동을 쓴다.
 */
export function VillageDialog({ run, visible, onClose }: { run: RunState; visible: boolean; onClose: () => void }) {
  const send = useGame((s) => s.send);
  const [npc, setNpc] = useState<NpcId | null>(null);
  const close = () => {
    setNpc(null);
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

  const trade = canTrade(run);
  const openShop = (tab: ShopId) => {
    close();
    router.push({ pathname: "/game/town", params: { tab } });
  };

  return (
    <DialogFrame visible={visible} onClose={close} actions={<ActionButton center label="닫기" onPress={close} />}>
      <DialogHead icon={StorefrontIcon} title="보리울" subtitle="가게에 들르거나 주민과 대화한다" />

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <DialogSectionTitle>가게</DialogSectionTitle>
          <Text style={styles.cost}>행동 소모 없음</Text>
        </View>
        <PickGrid>
          {SHOP_IDS.map((id) => (
            <PickCell
              key={id}
              label={SHOPS[id].name}
              sub={SHOP_NOTE[id]}
              reason={trade ? undefined : "지금은 갈 수 없다"}
              disabled={!trade}
              onPress={() => openShop(id)}
            />
          ))}
        </PickGrid>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <DialogSectionTitle>대화</DialogSectionTitle>
          <Text style={styles.cost}>행동 1칸</Text>
        </View>
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
      </View>
    </DialogFrame>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  cost: { ...type.caption, color: colors.textFaint },
});
