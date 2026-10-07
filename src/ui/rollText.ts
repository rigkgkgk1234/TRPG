/** 확률 배지: "45% · D20 12+" (성공하려면 주사위에서 12 이상) */
export function chanceBadge(chance: number, need?: number): string {
  const pct = `${Math.round(chance * 100)}%`;
  return need === undefined ? pct : `${pct} · D20 ${need}+`;
}
