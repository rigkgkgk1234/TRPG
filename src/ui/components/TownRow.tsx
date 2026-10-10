import { StyleSheet, View } from "react-native";
import { canTrade } from "@/core/day/town";
import { INVENTORY_CAPACITY, type RunState } from "@/core/types";
import { ActionButton } from "@/ui/components/Buttons";
import { BackpackIcon, StorefrontIcon } from "@/ui/icons";
import { space } from "@/ui/theme";
import { pushOnce } from "@/ui/navigate";

/**
 * 허브·저녁 패널의 가방·마을 버튼. 마을은 아래 패널 자리에 고르기 패널을 열어 가게(행동 소모 없음)나
 * 대화할 주민·결투장·의뢰 중개소(행동 1칸)를 고른다.
 */
export function TownRow({ run, onVillage }: { run: RunState; onVillage: () => void }) {
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
          onPress={onVillage}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  cell: { flex: 1, flexDirection: "column" },
});
