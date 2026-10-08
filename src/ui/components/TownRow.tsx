import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { canTrade } from "@/core/day/town";
import { INVENTORY_CAPACITY, type RunState } from "@/core/types";
import { ActionButton } from "@/ui/components/Buttons";
import { VillageDialog } from "@/ui/components/VillageDialog";
import { BackpackIcon, StorefrontIcon } from "@/ui/icons";
import { space } from "@/ui/theme";
import { pushOnce } from "@/ui/navigate";

/**
 * 허브·저녁 패널의 가방·마을 버튼. 마을은 가운데 창을 열어 가게(행동 소모 없음)나
 * 대화할 주민(행동 1칸)을 고른다.
 */
export function TownRow({ run }: { run: RunState }) {
  const [village, setVillage] = useState(false);
  const used = run.inventory.slots.filter(Boolean).length;
  const trade = canTrade(run);
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <ActionButton fill icon={BackpackIcon} label="가방" detail={[`${used}/${INVENTORY_CAPACITY}칸`]} onPress={() => pushOnce("/game/inventory")} />
      </View>
      <View style={styles.cell}>
        <ActionButton
          fill
          icon={StorefrontIcon}
          label="마을"
          large
          detail={trade ? undefined : "지금은 갈 수 없다"}
          disabled={!trade}
          onPress={() => setVillage(true)}
        />
      </View>
      {village && <VillageDialog run={run} visible onClose={() => setVillage(false)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  cell: { flex: 1, flexDirection: "column" },
});
