export type Action = "exit" | "cancel" | "none";

const ACTION_MAP: Record<string, { position: Action; order: Action }> = {
  owned:                 { position: "none", order: "none"   },
  position_too_high:     { position: "none", order: "none"   },
  range_too_narrow:      { position: "none", order: "cancel" },
  no_resistance:         { position: "exit", order: "cancel" },
  no_support:            { position: "exit", order: "cancel" },
  trend_1m_out_of_range: { position: "none", order: "cancel" },
  trend_3m_out_of_range: { position: "exit", order: "cancel" },
  turnover_out_of_range: { position: "none", order: "cancel" },
  price_out_of_range:    { position: "exit", order: "cancel" },
  spread_out_of_range:   { position: "none", order: "cancel" },
  trend_inconsistent:    { position: "none", order: "cancel" },
  touches_too_low:       { position: "none", order: "cancel" },
  tick_range_invalid:    { position: "none", order: "cancel" },
  qty_zero:              { position: "none", order: "cancel" },
  insufficient_history:  { position: "none", order: "cancel" },
};

export function getPositionAction(reason: string | null): Action {
  if (!reason) return "none";
  return ACTION_MAP[reason]?.position ?? "none";
}

export function getOrderAction(reason: string | null): Action {
  if (!reason) return "none";
  return ACTION_MAP[reason]?.order ?? "none";
}
