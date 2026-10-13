import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { canTrade } from "@/core/day/town";
import { EQUIP_SLOTS } from "@/core/items/equipment";
import {
  adjustedPrice, entryPrice, hasRoom, healPrice, maxHealable, SHOPS, STABILIZE_FATIGUE, STABILIZE_PRICE, treatable, TREAT_PRICE, type ShopEntry, type ShopId,
} from "@/core/items/shop";
import { WOUND_LABEL } from "@/core/labels";
import { FOOD_PRICE, maxHp, type ItemDef, type RunState } from "@/core/types";
import { CONTENT } from "@/data";
import { useGame } from "@/store/gameStore";
import { Chip, ChipRow, Section } from "@/ui/components/Controls";
import { ItemRow } from "@/ui/components/ItemRow";
import { QtyPicker, ShopControls } from "@/ui/components/ShopControls";
import { durabilityLabel, durabilityText, itemSummary } from "@/ui/itemText";
import { MODE_LABEL, repairRows, reputationNote, sellRows, SHOP_ICON, type ShopMode } from "@/ui/shopText";
import { DEFAULT_SORT, HEALER_GROUPS, SELL_GROUPS, SMITHY_GROUPS, sortRows, type ItemGroup, type SortState } from "@/ui/shopSort";
import { summarizeTurn } from "@/ui/turnSummary";
import { colors, icon as iconToken, space, type } from "@/ui/theme";
import { Text } from "@/ui/Text";

/**
 * 가게: 마을 고르기 패널에서 가게·모드(대장간 구매·수리 / 약초방 치료·물건 / 여관 구매·판매)를 고르면
 * 게임 화면의 스크립트 창(TurnLog의 cover)에 이 내용을 띄운다. 모드는 아래 고르기 패널에서 바꾼다.
 * 거래는 행동 슬롯을 쓰지 않는다. (SYSTEM_SPEC 5-4)
 * 목록은 분류 칩으로 묶어 보고, 가격·유형으로 정렬한다(기본 가격 오름차순). 겹치는 물건은 수량을 골라 사고판다.
 */
export function ShopView({ run, shop, mode }: { run: RunState; shop: ShopId; mode: ShopMode }) {
  const ShopIcon = SHOP_ICON[shop];
  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.titleRow}>
          <ShopIcon size={iconToken.lg + 4} weight={iconToken.weight} color={colors.accent} />
          <Text style={styles.title}>{SHOPS[shop].name}</Text>
          <Text style={styles.owner}>{SHOPS[shop].owner} · {MODE_LABEL[mode]}</Text>
        </View>
        <View style={styles.purse}>
          <Text style={styles.purseText}>가진 은화 <Text style={styles.purseValue}>{run.resources.silver}</Text></Text>
          <Text style={styles.repNote}>{reputationNote(run)}</Text>
        </View>
        <LastTrade />
      </View>

      {!canTrade(run) ? (
        <Text style={styles.note}>지금은 마을 일을 볼 수 없다.</Text>
      ) : shop === "smithy" ? (
        mode === "repair" ? <Repair run={run} /> : <SmithyBuy run={run} />
      ) : shop === "healer" ? (
        mode === "care" ? <Care run={run} /> : <HealerGoods run={run} />
      ) : mode === "sell" ? (
        <InnSell run={run} />
      ) : (
        <InnBuy run={run} />
      )}
    </View>
  );
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

/** 분류·정렬 상태 */
function useListControls(groups?: ItemGroup[]) {
  const [group, setGroup] = useState("all");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const match = groups?.find((g) => g.id === group)?.match ?? (() => true);
  return { group, setGroup, sort, setSort, match };
}

/** 수량 고르기를 펼친 줄 하나 */
function useOpenRow() {
  const [open, setOpen] = useState<string | null>(null);
  return { open, toggle: (key: string) => setOpen((cur) => (cur === key ? null : key)) };
}

/** 은화와 가방 자리로 살 수 있는 묶음 수 */
function maxBuyable(run: RunState, def: ItemDef, e: ShopEntry): number {
  const each = entryPrice(run, CONTENT, e);
  let n = each > 0 ? Math.floor(run.resources.silver / each) : 0;
  while (n > 0 && !hasRoom(run, def, e.qty * n)) n--;
  return n;
}

function stockRows(run: RunState, shop: ShopId) {
  return SHOPS[shop].stock.flatMap((e) => {
    const def = CONTENT.items[e.itemId];
    return def ? [{ e, def, price: entryPrice(run, CONTENT, e) }] : [];
  });
}

const Empty = ({ text }: { text: string }) => <Text style={styles.note}>{text}</Text>;

// ───────────────────────── 대장간 ─────────────────────────

function SmithyBuy({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  const c = useListControls(SMITHY_GROUPS);
  const rows = sortRows(stockRows(run, "smithy").filter((r) => c.match(r.def)), c.sort);
  return (
    <Section title="브록의 물건" hint="장비 칸이 비어 있으면 사자마자 걸친다.">
      <ShopControls groups={SMITHY_GROUPS} group={c.group} onGroup={c.setGroup} sort={c.sort} onSort={c.setSort} />
      {rows.length === 0 ? <Empty text="이 종류는 팔지 않는다." /> : (
        <View>
          {rows.map(({ e, def, price }) => {
            const owned = EQUIP_SLOTS.some((slot) => run.inventory.equipment[slot]?.itemId === def.id);
            return (
              <ItemRow
                key={e.itemId}
                title={def.name}
                price={`은화 ${price}`}
                meta={[...itemSummary(def), ...(durabilityLabel(def) ? [durabilityLabel(def)!] : []), ...(owned ? ["지금 쓰는 것"] : [])]}
                actions={[{ label: "사기", disabled: run.resources.silver < price, onPress: () => send({ type: "shop", op: "buy", shop: "smithy", target: e.itemId }) }]}
              />
            );
          })}
        </View>
      )}
    </Section>
  );
}

function Repair({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  const c = useListControls();
  const rows = sortRows(repairRows(run), c.sort);
  return (
    <Section title="수리" hint={run.player.job === "smith" ? "내구도 5당 은화 1, 견습생이라 반값" : "내구도 5당 은화 1"}>
      <ShopControls sort={c.sort} onSort={c.setSort} />
      {rows.length === 0 ? <Empty text="손볼 장비가 없다." /> : (
        <View>
          {rows.map((r) => (
            <ItemRow
              key={r.target}
              title={r.def.name}
              price={`은화 ${r.price}`}
              meta={[r.where, durabilityLabel(r.def, r.stack)!]}
              warn={durabilityText(r.def, r.stack) === "망가짐" ? "망가짐" : null}
              actions={[{ label: "수리", disabled: run.resources.silver < r.price, onPress: () => send({ type: "shop", op: "repair", target: r.target }) }]}
            />
          ))}
        </View>
      )}
    </Section>
  );
}

// ───────────────────────── 약초방 ─────────────────────────

type CareTab = "hp" | "wound";

function Care({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  // 다친 데가 있으면 부상 치료부터 보여 준다
  const [tab, setTab] = useState<CareTab>(run.player.wound.level === "critical" || treatable(run) ? "wound" : "hp");
  const wound = run.player.wound;
  const max = maxHp(run.player.stats);
  const treatPrice = adjustedPrice(run, TREAT_PRICE);
  const stabilizePrice = adjustedPrice(run, STABILIZE_PRICE);
  return (
    <Section title="마그다 할멈의 치료">
      <ChipRow>
        <Chip label="HP 회복" selected={tab === "hp"} onPress={() => setTab("hp")} />
        <Chip label="부상 치료" selected={tab === "wound"} onPress={() => setTab("wound")} />
      </ChipRow>
      {tab === "hp" ? (
        run.player.hp >= max ? <Empty text={`HP가 가득 차 있다 (${run.player.hp}/${max}).`} /> : (
          <ItemRow
            title="HP 회복"
            price={`HP 1당 은화 ${healPrice(run, 1)}`}
            meta={[`지금 HP ${run.player.hp}/${max}`, "약, 상처 손질"]}
            actions={[]}
            below={
              <QtyPicker
                key={run.player.hp}
                max={maxHealable(run)}
                unit=""
                slider
                maxConfirm="최대 회복"
                maxCost={String(healPrice(run, maxHealable(run)))}
                verb="회복"
                total={(n) => `은화 ${healPrice(run, n)} → HP ${run.player.hp + n}`}
                onConfirm={(n) => send({ type: "shop", op: "heal", qty: n })}
              />
            }
          />
        )
      ) : wound.level === "critical" ? (
        <ItemRow
          title="응급 처치"
          price={`은화 ${stabilizePrice}`}
          meta={["치명상 → 치료받은 중상", `피로 +${STABILIZE_FATIGUE}`]}
          actions={[{ label: "처치받기", disabled: run.resources.silver < stabilizePrice, onPress: () => send({ type: "shop", op: "stabilize" }) }]}
        />
      ) : treatable(run) ? (
        <ItemRow
          title="중상 치료"
          price={`은화 ${treatPrice}`}
          meta={["상처 봉합", "사흘 뒤 경상으로"]}
          actions={[{ label: "치료받기", disabled: run.resources.silver < treatPrice, onPress: () => send({ type: "shop", op: "treat" }) }]}
        />
      ) : (
        <Empty text={healerNote(run)} />
      )}
    </Section>
  );
}

function healerNote(run: RunState): string {
  const w = run.player.wound;
  if (w.level === "serious") return `치료를 받았다. ${w.treatedDays ?? 0}일째 아물고 있다.`;
  if (w.level === "light") return `${WOUND_LABEL.light}은 쉬거나 약초, 붕대로 낫는다.`;
  return "치료할 상처가 없다.";
}

function HealerGoods({ run }: { run: RunState }) {
  const c = useListControls(HEALER_GROUPS);
  const rows = sortRows(stockRows(run, "healer").filter((r) => c.match(r.def)), c.sort);
  return (
    <Section title="마그다 할멈의 약" hint={run.player.wound.level === "critical" ? "치유 물약을 쓰면 피로 없이 중상으로 가라앉는다." : undefined}>
      <ShopControls groups={HEALER_GROUPS} group={c.group} onGroup={c.setGroup} sort={c.sort} onSort={c.setSort} />
      {rows.length === 0 ? <Empty text="이 종류는 팔지 않는다." /> : <QtyStock run={run} shop="healer" rows={rows} />}
    </Section>
  );
}

/** 겹치는 물건 목록: "사기"를 누르면 그 줄 아래에 수량 고르기를 펼친다 */
function QtyStock({ run, shop, rows }: { run: RunState; shop: ShopId; rows: { e: ShopEntry; def: ItemDef; price: number }[] }) {
  const send = useGame((s) => s.send);
  const { open, toggle } = useOpenRow();
  return (
    <View>
      {rows.map(({ e, def, price }) => {
        const max = maxBuyable(run, def, e);
        const owned = run.inventory.slots.reduce((n, s) => n + (s?.itemId === def.id ? s.qty : 0), 0);
        return (
          <ItemRow
            key={e.itemId}
            title={def.name}
            price={`은화 ${price}`}
            meta={[...itemSummary(def), ...(owned > 0 ? [`가진 것 ${owned}`] : [])]}
            actions={[{ label: "사기", selected: open === e.itemId, disabled: max < 1 && open !== e.itemId, onPress: () => toggle(e.itemId) }]}
            below={open === e.itemId ? (
              <QtyPicker
                max={max}
                verb="사기"
                total={(n) => `은화 ${price * n}`}
                onConfirm={(n) => send({ type: "shop", op: "buy", shop, target: e.itemId, qty: n })}
              />
            ) : null}
          />
        );
      })}
    </View>
  );
}

// ───────────────────────── 여관 ─────────────────────────

function InnBuy({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  const c = useListControls();
  const { open, toggle } = useOpenRow();
  const { silver, food, debt } = run.resources;
  const foodMax = Math.floor(silver / FOOD_PRICE);
  const rows = sortRows(stockRows(run, "inn"), c.sort);
  return (
    <Section title="토비의 여관">
      <ShopControls sort={c.sort} onSort={c.setSort} />
      <View>
        {/* 빚이 있을 때만: 가진 은화로 갚을 만큼 골라 갚는다 */}
        {debt > 0 ? (
          <ItemRow
            title="빚 갚기"
            price={`남은 빚 ${debt}`}
            meta={[`가진 은화 ${silver}`, "납세일 전에 갚기"]}
            actions={[{ label: "갚기", selected: open === "debt", disabled: silver < 1 && open !== "debt", onPress: () => toggle("debt") }]}
            below={open === "debt" ? (
              <QtyPicker
                key={debt}
                max={Math.min(silver, debt)}
                unit=""
                slider
                verb="갚기"
                total={(n) => `은화 ${n} → 남은 빚 ${debt - n}`}
                onConfirm={(n) => send({ type: "shop", op: "payDebt", qty: n })}
              />
            ) : null}
          />
        ) : null}
        <ItemRow
          title="식량"
          price={`은화 ${FOOD_PRICE}`}
          meta={[`가진 식량 ${food}`, "저녁마다 한 사람에 1"]}
          actions={[{ label: "사기", selected: open === "food", disabled: foodMax < 1 && open !== "food", onPress: () => toggle("food") }]}
          below={open === "food" ? (
            <QtyPicker
              max={foodMax}
              verb="사기"
              total={(n) => `은화 ${FOOD_PRICE * n}`}
              onConfirm={(n) => send({ type: "shop", op: "buyFood", qty: n })}
            />
          ) : null}
        />
        <QtyStock run={run} shop="inn" rows={rows} />
      </View>
    </Section>
  );
}

function InnSell({ run }: { run: RunState }) {
  const send = useGame((s) => s.send);
  const c = useListControls(SELL_GROUPS);
  const { open, toggle } = useOpenRow();
  const rows = sortRows(sellRows(run).filter((r) => c.match(r.def)), c.sort);
  return (
    <Section title="팔기" hint="토비가 사들인다. 구매가의 절반, 가죽, 송곳니 같은 전리품은 정해진 값.">
      <ShopControls groups={SELL_GROUPS} group={c.group} onGroup={c.setGroup} sort={c.sort} onSort={c.setSort} />
      {rows.length === 0 ? <Empty text="팔 만한 물건이 없다." /> : (
        <View>
          {rows.map(({ index, stack, def, price }) => {
            const key = `${index}:${def.id}`;
            return (
              <ItemRow
                key={key}
                title={stack.qty > 1 ? `${def.name} ${stack.qty}개` : def.name}
                price={`개당 ${price}`}
                meta={durabilityLabel(def, stack) ? [durabilityLabel(def, stack)!] : undefined}
                warn={durabilityText(def, stack) === "망가짐" ? "망가짐" : null}
                actions={[
                  stack.qty > 1
                    ? { label: "팔기", selected: open === key, onPress: () => toggle(key) }
                    : { label: "팔기", onPress: () => send({ type: "shop", op: "sell", target: String(index), qty: 1 }) },
                ]}
                below={open === key && stack.qty > 1 ? (
                  <QtyPicker
                    max={stack.qty}
                    verb="팔기"
                    total={(n) => `은화 ${price * n}`}
                    onConfirm={(n) => send({ type: "shop", op: "sell", target: String(index), qty: n })}
                  />
                ) : null}
              />
            );
          })}
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  // 위 여백은 고르기 패널의 설명(PickIntro)과 같다
  root: { gap: space.xl, paddingTop: space.md },
  top: { gap: space.sm },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  title: { ...type.display, fontSize: 28, lineHeight: 36, color: colors.text },
  owner: { ...type.label, color: colors.textDim, marginLeft: "auto" },
  purse: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  purseText: { ...type.body, color: colors.textDim },
  purseValue: { ...type.bodyStrong, color: colors.text, fontVariant: ["tabular-nums"] },
  repNote: { ...type.caption, color: colors.textFaint },
  last: { ...type.caption, color: colors.success },
  note: { ...type.body, color: colors.textDim },
});
