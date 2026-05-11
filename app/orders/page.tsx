import { createClient } from "@/lib/supabase/server";
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

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, ins_id, side, limit_price, qty, status, placed_at, matched_at, instruments(ticker)"
    )
    .in("status", ["PLACED", "MATCHED"])
    .order("placed_at", { ascending: false });

  const rows = (orders ?? []) as unknown as Order[];

  // Fetch current closes for all instruments
  const insIds = [...new Set(rows.map((r) => r.ins_id))];
  const closesMap = new Map<number, number>();

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
    }
  }

  const statusVariant = (s: string) =>
    s === "PLACED" ? "secondary" : "default";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Active orders</h1>
          <p className="text-xs text-muted-foreground">{rows.length} open · PLACED + MATCHED</p>
        </div>
      </div>

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
                const distPct =
                  currentClose !== undefined
                    ? ((r.limit_price - currentClose) / currentClose) * 100
                    : null;

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
                    <TableCell className="text-right font-mono">{r.qty.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{Math.round(totalSek).toLocaleString("sv-SE")}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </TableCell>
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
                        currentStatus={r.status as "PLACED" | "MATCHED"}
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
