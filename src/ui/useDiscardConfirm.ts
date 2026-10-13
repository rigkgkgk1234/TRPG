import { useState } from "react";
import type { RowAction } from "@/ui/components/ItemRow";

/** "정말 버린다"를 받기 시작하는 시간 */
const CONFIRM_DELAY_MS = 400;

/**
 * 가방 칸의 "버리기" 버튼: 되돌릴 수 없으므로 한 번 누르면 "정말 버린다"로 바뀌고, 한 번 더 눌러야 버린다.
 * 같은 칸에 같은 물건일 때만 확인으로 이어지고(칸이 비거나 바뀌면 풀린다), 두 번 빠르게 누르면 확인 없이 버려지므로 잠깐 뒤부터 받는다.
 */
export function useDiscardConfirm(discard: (slotIndex: number) => void): (slotIndex: number, itemId: string, disabled?: boolean) => RowAction {
  const [pending, setPending] = useState<{ slot: number; itemId: string; at: number } | null>(null);
  return (slot, itemId, disabled) => {
    const confirming = pending?.slot === slot && pending.itemId === itemId;
    return {
      label: confirming ? "정말 버린다" : "버리기",
      danger: confirming,
      disabled,
      onPress: () => {
        if (!confirming) return setPending({ slot, itemId, at: Date.now() });
        if (Date.now() - pending.at < CONFIRM_DELAY_MS) return;
        setPending(null);
        discard(slot);
      },
    };
  };
}
