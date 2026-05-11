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
import { RunScreeningButton } from "@/components/run-screening-button";
import { cn } from "@/lib/utils";

interface Screening {
  rank: number;
  ins_id: number;
  last_close: number;
  spread_pct: number;
  avg_turnover_30d: number;
  trend_1m_pct: number;
  trend_3m_pct: number;
  support_level: number;
  support_touches: number;
  resistance_level: number;
  resistance_touches: number;
  position_in_range: number;
  range_width_pct: number;
  score: number;
  suggested_buy_price: number;
  suggested_sell_price: number;
  suggested_qty: number;
  suggested_position_sek: number;
  screened_at: string;
  instruments: { ticker: string; name: string } | null;
}

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

function fmtSEK(n: number) {
  return Math.round(n).toLocaleString("sv-SE");
}

function trendClass(pct: number) {
  if (pct > 5) return "text-green-600";
  if (pct < -5) return "text-red-600";
  return "";
}

export default async function TodayPage() {
  const supabase = await createClient();

  // Get latest screened_at
  const { data: latest } = await supabase
    .from("screenings")
    .select("screened_at")
    .order("screened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let rows: Screening[] = [];

  if (latest) {
    const { data } = await supabase
      .from("screenings")
      .select(
        "rank, ins_id, last_close, spread_pct, avg_turnover_30d, trend_1m_pct, trend_3m_pct, support_level, support_touches, resistance_level, resistance_touches, position_in_range, range_width_pct, score, suggested_buy_price, suggested_sell_price, suggested_qty, suggested_position_sek, screened_at, instruments(ticker, name)"
      )
      .eq("screened_at", latest.screened_at)
      .order("rank", { ascending: true });
    rows = (data ?? []) as unknown as Screening[];
  }

  const screenedAt = latest
    ? new Date(latest.screened_at).toLocaleString("sv-SE", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Today&apos;s candidates</h1>
          <p className="text-xs text-muted-foreground">
            {rows.length} candidates · screened {screenedAt}
          </p>
        </div>
        <RunScreeningButton />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          No screening data yet. Run the screener to populate.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Close</TableHead>
                <TableHead className="text-right">Spread%</TableHead>
                <TableHead className="text-right">Turnover 30d</TableHead>
                <TableHead className="text-right">1m%</TableHead>
                <TableHead className="text-right">3m%</TableHead>
                <TableHead className="text-right">Support</TableHead>
                <TableHead className="text-right">Resistance</TableHead>
                <TableHead className="text-right">Pos</TableHead>
                <TableHead className="text-right">Range%</TableHead>
                <TableHead className="text-right">Buy (SEK)</TableHead>
                <TableHead className="text-right">Sell</TableHead>
                <TableHead className="text-right">Gross%</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const ticker = r.instruments?.ticker ?? `#${r.ins_id}`;
                const name = r.instruments?.name ?? "";
                const grossPct =
                  ((r.suggested_sell_price - r.suggested_buy_price) /
                    r.suggested_buy_price) *
                  100;
                const buySEK = fmtSEK(r.suggested_buy_price * r.suggested_qty);

                return (
                  <TableRow
                    key={r.ins_id}
                    className={cn(
                      r.score >= 50 && "bg-green-50",
                      r.position_in_range < 0.3 && "bg-green-100"
                    )}
                  >
                    <TableCell className="font-mono">{r.rank}</TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/stocks/${encodeURIComponent(ticker)}`}
                        className="hover:underline"
                      >
                        {ticker}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[140px] truncate">
                      {name}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.score, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.last_close)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        r.spread_pct > 8 && "text-amber-600 font-semibold"
                      )}
                    >
                      {fmt(r.spread_pct, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtSEK(r.avg_turnover_30d)}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono", trendClass(r.trend_1m_pct))}>
                      {r.trend_1m_pct > 0 ? "+" : ""}{fmt(r.trend_1m_pct, 1)}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono", trendClass(r.trend_3m_pct))}>
                      {r.trend_3m_pct > 0 ? "+" : ""}{fmt(r.trend_3m_pct, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.support_level)} <span className="text-muted-foreground">×{r.support_touches}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.resistance_level)} <span className="text-muted-foreground">×{r.resistance_touches}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.position_in_range, 2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.range_width_pct, 1)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.suggested_buy_price, 4)}{" "}
                      <span className="text-muted-foreground">
                        ×{r.suggested_qty} = {buySEK}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(r.suggested_sell_price, 4)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-green-700">
                      +{fmt(grossPct, 1)}%
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
