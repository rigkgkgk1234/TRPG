import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { canTrade } from "@/core/day/town";
import { INVENTORY_CAPACITY, type RunState } from "@/core/types";
import { ActionButton } from "@/ui/components/Buttons";
import { BackpackIcon, StorefrontIcon } from "@/ui/icons";
import { space } from "@/ui/theme";

/** 허브·저녁 패널 아래의 가방·마을 버튼. 거래는 행동 슬롯을 쓰지 않는다. */
export function TownRow({ run }: { run: RunState }) {
  const used = run.inventory.slots.filter(Boolean).length;
  const trade = canTrade(run);
  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <ActionButton icon={BackpackIcon} label="가방" detail={[`${used}/${INVENTORY_CAPACITY}칸`]} onPress={() => router.push("/game/inventory")} />
      </View>
      <View style={styles.cell}>
        <ActionButton
          icon={StorefrontIcon}
          label="마을"
          detail={trade ? ["대장간", "약초방", "여관"] : "지금은 갈 수 없다"}
          disabled={!trade}
          onPress={() => router.push("/game/town")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm },
  cell: { flex: 1 },
});
