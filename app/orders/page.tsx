import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { OrderActions } from "@/components/order-actions";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

function daysOpen(placed: string, reference: string | null): number {
  const from = new Date(placed);
  const to = reference ? new Date(reference) : new Date();
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

function statusBadge(status: string) {
  if (status === "PARTIAL") {
    return <Badge className="bg-orange-500 text-white hover:bg-orange-500/80">{status}</Badge>;
  }
  if (status === "MATCHED") {
    return <Badge variant="default">{status}</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

export default async function OrdersPage() {
  const supabase = createServiceClient();

  // Fetch all non-cancelled, non-sold orders for active view
  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, ins_id, side, limit_price, qty, qty_filled, avg_fill_price, last_fill_at, status, placed_at, matched_at, pair_id, instruments(ticker)"
    )
    .in("status", ["PLACED", "PARTIAL", "MATCHED"])
    .order("placed_at", { ascending: false });

  const rows = (orders ?? []) as unknown as Order[];

  // Also fetch all orders with fills for holdings calculation
  const { data: allOrders } = await supabase
    .from("orders")
    .select("ins_id, side, qty_filled, instruments(ticker)")
    .in("status", ["PARTIAL", "MATCHED", "SOLD"])
    .gt("qty_filled", 0);

  // Compute holdings: sum(buy.qty_filled) - sum(sell.qty_filled) per ins_id
  const holdingsMap = new Map<number, { ticker: string; qty: number }>();
  for (const o of (allOrders ?? []) as unknown as { ins_id: number; side: string; qty_filled: number; instruments: { ticker: string } | null }[]) {
    const existing = holdingsMap.get(o.ins_id) ?? { ticker: o.instruments?.ticker ?? `#${o.ins_id}`, qty: 0 };
    existing.qty += o.side === "BUY" ? (o.qty_filled ?? 0) : -(o.qty_filled ?? 0);
    holdingsMap.set(o.ins_id, existing);
  }
  const holdings = [...holdingsMap.entries()]
    .map(([insId, h]) => ({ insId, ...h }))
    .filter((h) => h.qty > 0);

  // Fetch current closes and screening sell prices for all instruments
  const insIds = [...new Set(rows.map((r) => r.ins_id))];
  const closesMap = new Map<number, number>();
  const sellPriceMap = new Map<number, number>();

  if (insIds.length > 0) {
    for (const insId of insIds) {
      const { data } = await supabase
        .from("daily_prices")
        .select("close")
        .eq("ins_id", insId)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) closesMap.set(insId, data.close);

      const { data: screening } = await supabase
        .from("screenings")
        .select("suggested_sell_price")
        .eq("ins_id", insId)
        .order("screened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (screening) sellPriceMap.set(insId, screening.suggested_sell_price);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Active orders</h1>
          <p className="text-xs text-muted-foreground">
            {rows.length} open · PLACED + PARTIAL + MATCHED
          </p>
        </div>
      </div>

      {/* Holdings summary */}
      {holdings.length > 0 && (
        <div className="border rounded-md p-3">
          <h2 className="text-xs font-semibold mb-2">Beholdning</h2>
          <div className="flex flex-wrap gap-3">
            {holdings.map((h) => (
              <div key={h.insId} className="text-xs">
                <Link href={`/stocks/${encodeURIComponent(h.ticker)}`} className="font-medium hover:underline">
                  {h.ticker}
                </Link>
                <span className="text-muted-foreground ml-1">{h.qty.toLocaleString("sv-SE")} stk</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No active orders.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Total SEK</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Days open</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Dist%</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const ticker = r.instruments?.ticker ?? `#${r.ins_id}`;
                const totalSek = r.limit_price * r.qty;
                const days = daysOpen(r.placed_at, null);
                const currentClose = closesMap.get(r.ins_id);
                const qtyFilled = r.qty_filled ?? 0;

                // Dist%: use avg_fill_price for PARTIAL/MATCHED, else limit_price
                const refPrice =
                  (r.status === "PARTIAL" || r.status === "MATCHED") && r.avg_fill_price
                    ? r.avg_fill_price
                    : r.limit_price;
                const distPct =
                  currentClose !== undefined
                    ? ((refPrice - currentClose) / currentClose) * 100
                    : null;

                // Qty display: "filled / total (pct%)" for PARTIAL
                const qtyDisplay =
                  r.status === "PARTIAL"
                    ? `${qtyFilled.toLocaleString("sv-SE")} / ${r.qty.toLocaleString("sv-SE")} (${Math.round((qtyFilled / r.qty) * 100)}%)`
                    : r.qty.toLocaleString("sv-SE");

                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link href={`/stocks/${encodeURIComponent(ticker)}`} className="hover:underline">
                        {ticker}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className={cn("font-medium", r.side === "BUY" ? "text-green-600" : "text-red-600")}>
                        {r.side}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmt(r.limit_price, 4)}</TableCell>
                    <TableCell className="text-right font-mono">{qtyDisplay}</TableCell>
                    <TableCell className="text-right font-mono">{Math.round(totalSek).toLocaleString("sv-SE")}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className={cn("text-right font-mono", days > 10 && "text-amber-600")}>
                      {days}d
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {currentClose !== undefined ? fmt(currentClose) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        distPct !== null && distPct < 0 && "text-green-600",
                        distPct !== null && distPct > 5 && "text-red-600"
                      )}
                    >
                      {distPct !== null
                        ? `${distPct >= 0 ? "+" : ""}${fmt(distPct, 1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <OrderActions
                        orderId={r.id}
                        currentStatus={r.status as "PLACED" | "PARTIAL" | "MATCHED"}
                        side={r.side}
                        qty={r.qty}
                        qtyFilled={qtyFilled}
                        avgFillPrice={r.avg_fill_price ?? null}
                        pairId={r.pair_id ?? null}
                        insId={r.ins_id}
                        suggestedSellPrice={sellPriceMap.get(r.ins_id) ?? null}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
