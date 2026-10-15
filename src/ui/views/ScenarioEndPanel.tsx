import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGame } from "@/store/gameStore";
import { ActionButton, ButtonStack } from "@/ui/components/Buttons";
import { ArrowCounterClockwiseIcon, HouseIcon, ListIcon } from "@/ui/icons";
import { once } from "@/ui/navigate";
import { colors, hairline, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

/** 상황 시험이 끝났을 때 아래 패널 자리: 같은 설정으로 다시, 다른 상황 고르기, 처음 화면으로. 시험에서 한 일은 저장되지 않는다 */
export function ScenarioEndPanel() {
  const insets = useSafeAreaInsets();
  const restart = useGame((s) => s.restartScenario);
  return (
    <View style={[styles.panel, { paddingBottom: insets.bottom + space.md }]}>
      <Text style={styles.title}>시험이 끝났다</Text>
      <Text style={styles.note}>여기서 한 일은 저장되지 않는다. 이어하던 회차는 그대로 남아 있다.</Text>
      <ButtonStack>
        <ActionButton icon={ArrowCounterClockwiseIcon} label="같은 설정으로 다시" onPress={restart} />
        <ActionButton icon={ListIcon} label="다른 상황 고르기" onPress={() => once(() => router.replace("/dev/scenario"))} />
        <ActionButton icon={HouseIcon} label="처음 화면으로" onPress={() => once(() => router.dismissTo("/"))} />
      </ButtonStack>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.sm,
    backgroundColor: colors.surface,
    borderTopWidth: hairline,
    borderColor: colors.borderStrong,
  },
  title: { ...type.heading, color: colors.text },
  note: { ...type.caption, color: colors.textDim },
});
