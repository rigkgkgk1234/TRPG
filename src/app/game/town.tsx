import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { canTrade } from "@/core/day/town";
import { slotOf } from "@/core/items/equipment";
import {
  adjustedPrice, entryPrice, repairPrice, sellPrice, SHOPS, stackAt, treatable, TREAT_PRICE, type RepairTarget, type ShopId,
} from "@/core/items/shop";
import { WOUND_LABEL } from "@/core/labels";
import { FOOD_PRICE, REP_DISCOUNT_THRESHOLD, REP_HEAVY_SURCHARGE_THRESHOLD, REP_SURCHARGE_THRESHOLD, type RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { Section } from "@/ui/components/Controls";
import { ItemRow } from "@/ui/components/ItemRow";
import { durabilityText, itemSummary } from "@/ui/itemText";
import { summarizeTurn } from "@/ui/turnSummary";
import { colors, radius, space, type } from "@/ui/theme";

const TABS: ShopId[] = ["smithy", "healer", "inn"];

/**
 * 마을 모달: 대장간(장비·수리) / 약초방(약·치료) / 여관(식량·화살·팔기·빚). 거래는 행동 슬롯을 쓰지 않는다. (SYSTEM_SPEC 5-4)
 * 가격은 평판 보정이 들어간 값이다. 맨 위에 방금 한 거래의 결과를 한 줄로 보여 준다.
 */
export default function TownScreen() {
  const insets = useSafeAreaInsets();
  const run = useGame((s) => s.run);
  const [tab, setTab] = useState<ShopId>("smithy");
  if (!run) return null;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.tabs}>
          {TABS.map((id) => (
            <Pressable
              key={id}
              onPress={() => setTab(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === id }}
              style={[styles.tab, tab === id && styles.tabSelected]}
            >
              <Text style={[styles.tabText, tab === id && styles.tabTextSelected]}>{SHOPS[id].name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.purse}>
          <Text style={styles.purseText}>가진 은화 <Text style={styles.purseValue}>{run.resources.silver}</Text></Text>
          <Text style={styles.repNote}>{reputationNote(run)}</Text>
        </View>
        <LastTrade />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xl }]}>
        {!canTrade(run) ? (
          <Text style={styles.note}>지금은 마을 일을 볼 수 없다.</Text>
        ) : tab === "smithy" ? (
          <Smithy run={run} />
        ) : tab === "healer" ? (
          <Healer run={run} />
        ) : (
          <Inn run={run} />
        )}
      </ScrollView>
    </View>
  );
}

function reputationNote(run: RunState): string {
  const rep = run.player.reputation;
  if (rep >= REP_DISCOUNT_THRESHOLD) return `평판 ${rep}: 물건값 10% 할인`;
  if (rep < REP_HEAVY_SURCHARGE_THRESHOLD) return `평판 ${rep}: 물건값 20% 더 받는다`;
  if (rep < REP_SURCHARGE_THRESHOLD) return `평판 ${rep}: 물건값 10% 더 받는다`;
  return `평판 ${rep}`;
}

/** 방금 한 거래의 결과나 거절 사유 */
function LastTrade() {
  const last = useGame((s) => s.log.at(-1));
  if (!last || (last.cmd.type !== "shop" && last.cmd.type !== "equip")) return null;
  const s = summarizeTurn(last);
  const text = s.notices[0] ?? s.events[0]?.text ?? s.changes.map((c) => `${c.label} ${c.delta > 0 ? "+" : ""}${c.delta}`).join(", ");
  if (!text) return null;
  return <Text style={[styles.last, s.notices.length > 0 && { color: colors.partial }]} numberOfLines={2}>{text}</Text>;
}

function StockList({ run, shop }: { run: RunState; shop: ShopId }) {
  const send = useGame((s) => s.send);
  return (
    <View>
      {SHOPS[shop].stock.map((e) => {
        const def = CONTENT.items[e.itemId];
        if (!def) return null;
        const price = entryPrice(run, CONTENT, e);
        const slot = slotOf(def);
        const owned = slot && run.inventory.equipment[slot]?.itemId === def.id;
        return (
          <ItemRow
            key={e.itemId}
            title={e.qty > 1 ? `${def.name} ${e.qty}개` : def.name}
            price={`은화 ${price}`}
            meta={[...itemSummary(def), ...(owned ? ["지금 쓰는 것"] : [])]}
            actions={[{ label: "사기", disabled: run.resources.silver < price, onPress: () => send({ type: "shop", op: "buy", shop, target: e.itemId }) }]}
          />
        );
      })}
    </View>
  );
}

function Smithy({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  const targets: { target: RepairTarget; where: string }[] = [
    ...(["weapon", "armor", "shield"] as const).map((slot) => ({ target: slot as RepairTarget, where: "걸친 것" })),
    ...run.inventory.slots.map((_, i) => ({ target: `bag:${i}` as RepairTarget, where: "가방" })),
  ];
  const repairs = targets.flatMap(({ target, where }) => {
    const stack = stackAt(run, target);
    const def = stack ? CONTENT.items[stack.itemId] : undefined;
    const price = stack ? repairPrice(run, CONTENT, stack) : 0;
    return stack && def && price > 0 ? [{ target, where, stack, def, price }] : [];
  });
  return (
    <>
      <Section title="브록의 물건" hint="장비 칸이 비어 있으면 사자마자 걸친다.">
        <StockList run={run} shop="smithy" />
      </Section>
      <Section title="수리" hint={run.player.job === "smith" ? "내구도 5당 은화 1, 견습생이라 반값" : "내구도 5당 은화 1"}>
        {repairs.length === 0 ? (
          <Text style={styles.note}>손볼 장비가 없다.</Text>
        ) : (
          <View>
            {repairs.map((r) => (
              <ItemRow
                key={r.target}
                title={r.def.name}
                price={`은화 ${r.price}`}
                meta={[r.where]}
                warn={durabilityText(r.def, r.stack)}
                actions={[{ label: "수리", disabled: run.resources.silver < r.price, onPress: () => send({ type: "shop", op: "repair", target: r.target }) }]}
              />
            ))}
          </View>
        )}
      </Section>
    </>
  );
}

function Healer({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  const wound = run.player.wound;
  const price = adjustedPrice(run, TREAT_PRICE);
  return (
    <>
      <Section title="치료" hint="중상을 치료하면 사흘 뒤 경상으로 낫는다.">
        {treatable(run) ? (
          <ItemRow
            title="중상 치료"
            price={`은화 ${price}`}
            meta={["마그다 할멈이 상처를 꿰매 준다"]}
            actions={[{ label: "치료받기", disabled: run.resources.silver < price, onPress: () => send({ type: "shop", op: "treat" }) }]}
          />
        ) : (
          <Text style={styles.note}>{healerNote(run)}</Text>
        )}
      </Section>
      <Section title="마그다 할멈의 약" hint={wound.level === "critical" ? "치명상에는 치유 물약을 써야 한다." : undefined}>
        <StockList run={run} shop="healer" />
      </Section>
    </>
  );
}

function healerNote(run: RunState): string {
  const w = run.player.wound;
  if (w.level === "serious") return `치료를 받았다. ${w.treatedDays ?? 0}일째 아물고 있다.`;
  if (w.level === "critical") return "할멈 손으로는 어렵다. 치유 물약이 필요하다.";
  if (w.level === "light") return `${WOUND_LABEL.light}은 쉬거나 약초·붕대로 낫는다.`;
  return "아픈 데가 없다.";
}

function Inn({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  const { silver, debt } = run.resources;
  const sellable = run.inventory.slots
    .map((stack, i) => ({ stack, i, def: stack ? CONTENT.items[stack.itemId] : undefined }))
    .filter((x) => x.stack && sellPrice(x.def) > 0);
  return (
    <>
      <Section title="토비의 여관">
        <View>
          <ItemRow
            title="식량 1"
            price={`은화 ${FOOD_PRICE}`}
            meta={[`가진 식량 ${run.resources.food}`]}
            actions={[{ label: "사기", disabled: silver < FOOD_PRICE, onPress: () => send({ type: "shop", op: "buyFood", qty: 1 }) }]}
          />
          <StockList run={run} shop="inn" />
          {debt > 0 && (
            <ItemRow
              title={`빚 ${debt}`}
              meta={[`가진 만큼 갚는다 (최대 ${Math.min(silver, debt)})`]}
              actions={[{ label: "갚기", disabled: silver <= 0, onPress: () => send({ type: "shop", op: "payDebt", qty: debt }) }]}
            />
          )}
        </View>
      </Section>
      <Section title="팔기" hint="토비가 사들인다. 구매가의 절반, 가죽·약초는 정해진 값.">
        {sellable.length === 0 ? (
          <Text style={styles.note}>팔 만한 물건이 없다.</Text>
        ) : (
          <View>
            {sellable.map(({ stack, i, def }) => (
              <ItemRow
                key={i}
                title={stack!.qty > 1 ? `${def!.name} ${stack!.qty}개` : def!.name}
                price={`개당 ${sellPrice(def)}`}
                warn={durabilityText(def!, stack!) === "망가짐" ? "망가짐" : null}
                actions={[
                  { label: "1개", onPress: () => send({ type: "shop", op: "sell", target: String(i), qty: 1 }) },
                  ...(stack!.qty > 1 ? [{ label: "전부", onPress: () => send({ type: "shop", op: "sell", target: String(i), qty: stack!.qty }) }] : []),
                ]}
              />
            ))}
          </View>
        )}
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md },
  tabs: { flexDirection: "row", padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface },
  tab: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  tabSelected: { backgroundColor: colors.surfaceRaised },
  tabText: { ...type.label, color: colors.textDim },
  tabTextSelected: { color: colors.text },
  purse: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  purseText: { ...type.body, color: colors.textDim },
  purseValue: { ...type.bodyStrong, color: colors.text, fontVariant: ["tabular-nums"] },
  repNote: { ...type.caption, color: colors.textFaint },
  last: { ...type.caption, color: colors.success },
  content: { padding: space.lg, gap: space.xl },
  note: { ...type.body, color: colors.textDim },
});
