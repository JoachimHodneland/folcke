import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";

export const dynamic = "force-dynamic";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Order } from "@/lib/types";

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

function daysBetween(a: string, b: string | null): number | null {
  if (!b) return null;
  return Math.floor(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000
  );
}

export default async function HistoryPage() {
  const supabase = createServiceClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, ins_id, side, limit_price, qty, qty_filled, avg_fill_price, status, placed_at, matched_at, closed_at, pnl_sek, pair_id, instruments(ticker)"
    )
    .eq("status", "SOLD")
    .order("closed_at", { ascending: false });

  const rows = (orders ?? []) as unknown as Order[];

  // Pair BUY+SELL orders via pair_id to compute PnL when not stored
  // Build a map of pair_id → [buy, sell]
  const pairMap = new Map<string, Order[]>();
  for (const r of rows) {
    if (r.pair_id) {
      if (!pairMap.has(r.pair_id)) pairMap.set(r.pair_id, []);
      pairMap.get(r.pair_id)!.push(r);
    }
  }

  // KPIs — computed from pnl_sek where available
  const withPnl = rows.filter((r) => r.pnl_sek !== null);
  const totalPnl = withPnl.reduce((s, r) => s + (r.pnl_sek ?? 0), 0);
  const wins = withPnl.filter((r) => (r.pnl_sek ?? 0) > 0);
  const losses = withPnl.filter((r) => (r.pnl_sek ?? 0) <= 0);
  const winRate = withPnl.length > 0 ? (wins.length / withPnl.length) * 100 : null;
  const avgGain = wins.length > 0 ? wins.reduce((s, r) => s + (r.pnl_sek ?? 0), 0) / wins.length : null;
  const avgLoss = losses.length > 0 ? losses.reduce((s, r) => s + (r.pnl_sek ?? 0), 0) / losses.length : null;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Trade history</h1>

      {/* KPI boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ["Total trades", String(rows.length)],
          ["Total PnL", withPnl.length > 0 ? `${totalPnl >= 0 ? "+" : ""}${Math.round(totalPnl).toLocaleString("sv-SE")} SEK` : "—"],
          ["Win rate", winRate !== null ? `${fmt(winRate, 0)}%` : "—"],
          ["Avg gain", avgGain !== null ? `+${Math.round(avgGain).toLocaleString("sv-SE")} SEK` : "—"],
          ["Avg loss", avgLoss !== null ? `${Math.round(avgLoss).toLocaleString("sv-SE")} SEK` : "—"],
        ].map(([label, value]) => (
          <div key={label} className="border rounded-md p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={cn(
              "text-base font-semibold font-mono mt-0.5",
              label === "Total PnL" && totalPnl > 0 && "text-green-600",
              label === "Total PnL" && totalPnl < 0 && "text-red-600",
            )}>{value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">No closed trades yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Avg fill</TableHead>
                <TableHead className="text-right">Qty filled</TableHead>
                <TableHead>Placed</TableHead>
                <TableHead>Matched</TableHead>
                <TableHead>Closed</TableHead>
                <TableHead className="text-right">Days held</TableHead>
                <TableHead className="text-right">PnL SEK</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const ticker = r.instruments?.ticker ?? `#${r.ins_id}`;
                const days = daysBetween(r.matched_at ?? r.placed_at, r.closed_at);
                const pnl = r.pnl_sek;

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
                    <TableCell className="text-right font-mono">{fmt(r.avg_fill_price ?? r.limit_price, 4)}</TableCell>
                    <TableCell className="text-right font-mono">{(r.qty_filled ?? r.qty).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {new Date(r.placed_at).toLocaleDateString("sv-SE")}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {r.matched_at ? new Date(r.matched_at).toLocaleDateString("sv-SE") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {r.closed_at ? new Date(r.closed_at).toLocaleDateString("sv-SE") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {days !== null ? `${days}d` : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono font-semibold",
                        pnl !== null && pnl > 0 && "text-green-600",
                        pnl !== null && pnl < 0 && "text-red-600"
                      )}
                    >
                      {pnl !== null
                        ? `${pnl >= 0 ? "+" : ""}${Math.round(pnl).toLocaleString("sv-SE")}`
                        : "—"}
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
