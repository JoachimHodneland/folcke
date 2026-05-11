export type OrderStatus = 'PLACED' | 'PARTIAL' | 'MATCHED' | 'SOLD' | 'CANCELLED';

export interface Order {
  id: string;
  ins_id: number;
  side: string;
  limit_price: number;
  qty: number;
  qty_filled: number;
  avg_fill_price: number | null;
  last_fill_at: string | null;
  status: OrderStatus;
  placed_at: string;
  matched_at: string | null;
  closed_at: string | null;
  pair_id: string | null;
  pnl_sek: number | null;
  notes: string | null;
  instruments: { ticker: string; name?: string } | null;
}
