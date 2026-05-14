import { createClient } from "@/lib/supabase/server";
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
import { RunScreeningButton } from "@/components/run-screening-button";
import { CancelOrderButton, MarkSoldButton } from "@/components/action-lists";
import { getPositionAction, getOrderAction } from "@/lib/screening/actions";
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
  passed: boolean;
  failure_reason: string | null;
  instruments: { ticker: string; name: string } | null;
}

interface DroppedCandidate {
  ins_id: number;
  ticker: string;
  lastPassedAt: string;
  lastRank: number | null;
  lastScore: number | null;
  currentReason: string | null;
  daysSinceDropped: number;
}

interface PositionExit {
  orderId: string;
  insId: number;
  ticker: string;
  name: string;
  reason: string;
  avgFillPrice: number;
  lastClose: number | null;
  qtyFilled: number;
}

interface OrderCancel {
  orderId: string;
  insId: number;
  ticker: string;
  name: string;
  side: string;
  limitPrice: number;
  qty: number;
  reason: string;
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
  const streakMap = new Map<number, number>();
  const rankChangeMap = new Map<number, number | null>(); // null = NY
  const dropped: DroppedCandidate[] = [];
  const positionExits: PositionExit[] = [];
  const orderCancels: OrderCancel[] = [];

  if (latest) {
    // Fetch today's passed candidates
    const { data } = await supabase
      .from("screenings")
      .select(
        "rank, ins_id, last_close, spread_pct, avg_turnover_30d, trend_1m_pct, trend_3m_pct, support_level, support_touches, resistance_level, resistance_touches, position_in_range, range_width_pct, score, suggested_buy_price, suggested_sell_price, suggested_qty, suggested_position_sek, screened_at, passed, failure_reason, instruments(ticker, name)"
      )
      .eq("screened_at", latest.screened_at)
      .eq("passed", true)
      .not("rank", "is", null)
      .order("rank", { ascending: true });
    rows = (data ?? []) as unknown as Screening[];

    // Get all distinct screening run timestamps (for streak + rank change)
    const { data: runs } = await supabase
      .from("screenings")
      .select("screened_at")
      .eq("passed", true)
      .not("rank", "is", null)
      .order("screened_at", { ascending: false })
      .limit(100);

    const uniqueRuns = [...new Set((runs ?? []).map((r: { screened_at: string }) => r.screened_at))];
    const previousRun = uniqueRuns.length > 1 ? uniqueRuns[1] : null;

    // Rank change: compare with previous run
    if (previousRun) {
      const { data: prevData } = await supabase
        .from("screenings")
        .select("ins_id, rank")
        .eq("screened_at", previousRun)
        .eq("passed", true)
        .not("rank", "is", null);

      const prevRankMap = new Map<number, number>();
      for (const r of (prevData ?? []) as { ins_id: number; rank: number }[]) {
        prevRankMap.set(r.ins_id, r.rank);
      }

      for (const r of rows) {
        const prevRank = prevRankMap.get(r.ins_id);
        if (prevRank === undefined) {
          rankChangeMap.set(r.ins_id, null); // NY
        } else {
          rankChangeMap.set(r.ins_id, prevRank - r.rank); // positive = improved
        }
      }
    }

    // Streak: for each candidate, count consecutive passed runs
    for (const r of rows) {
      const { data: history } = await supabase
        .from("screenings")
        .select("passed")
        .eq("ins_id", r.ins_id)
        .order("screened_at", { ascending: false })
        .limit(30);

      let streak = 0;
      for (const h of (history ?? []) as { passed: boolean }[]) {
        if (h.passed) streak++;
        else break;
      }
      streakMap.set(r.ins_id, streak);
    }

    // Recently dropped: passed in last 7 days but failed in latest (exclude owned)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Get ins_ids that passed in last 7 days
    const { data: recentPassed } = await supabase
      .from("screenings")
      .select("ins_id, screened_at, rank, score, instruments(ticker)")
      .eq("passed", true)
      .not("rank", "is", null)
      .gte("screened_at", sevenDaysAgo.toISOString())
      .order("screened_at", { ascending: false });

    // Get ins_ids that failed in latest run (exclude owned)
    const { data: latestFailed } = await supabase
      .from("screenings")
      .select("ins_id, failure_reason")
      .eq("screened_at", latest.screened_at)
      .eq("passed", false)
      .neq("failure_reason", "owned");

    const latestFailedMap = new Map<number, string>();
    for (const f of (latestFailed ?? []) as { ins_id: number; failure_reason: string }[]) {
      latestFailedMap.set(f.ins_id, f.failure_reason);
    }

    const currentPassedIds = new Set(rows.map((r) => r.ins_id));
    const seenDropped = new Set<number>();

    for (const rp of (recentPassed ?? []) as unknown as { ins_id: number; screened_at: string; rank: number; score: number; instruments: { ticker: string } | null }[]) {
      if (currentPassedIds.has(rp.ins_id)) continue;
      if (seenDropped.has(rp.ins_id)) continue;
      if (!latestFailedMap.has(rp.ins_id)) continue;

      seenDropped.add(rp.ins_id);
      const daysSince = Math.floor(
        (new Date(latest.screened_at).getTime() - new Date(rp.screened_at).getTime()) / 86_400_000
      );

      dropped.push({
        ins_id: rp.ins_id,
        ticker: rp.instruments?.ticker ?? `#${rp.ins_id}`,
        lastPassedAt: rp.screened_at,
        lastRank: rp.rank,
        lastScore: rp.score,
        currentReason: latestFailedMap.get(rp.ins_id) ?? null,
        daysSinceDropped: Math.max(daysSince, 0),
      });
    }

    dropped.sort((a, b) => a.daysSinceDropped - b.daysSinceDropped);

    // ── Action lists: positions to exit + orders to cancel ──────────────
    const svc = createServiceClient();

    // Fetch all active orders
    const { data: activeOrders } = await svc
      .from("orders")
      .select("id, ins_id, side, status, limit_price, qty, qty_filled, avg_fill_price, instruments(ticker, name)")
      .in("status", ["PLACED", "PARTIAL", "MATCHED"]);

    const orderRows = (activeOrders ?? []) as unknown as {
      id: string; ins_id: number; side: string; status: string;
      limit_price: number; qty: number; qty_filled: number;
      avg_fill_price: number | null;
      instruments: { ticker: string; name: string } | null;
    }[];

    // Get unique ins_ids from orders to fetch their latest screenings
    const orderInsIds = [...new Set(orderRows.map((o) => o.ins_id))];

    // Fetch latest screening per ins_id (may not be at latest.screened_at)
    const screeningByIns = new Map<number, { passed: boolean; failure_reason: string | null; last_close: number | null }>();
    for (const insId of orderInsIds) {
      const { data: s } = await supabase
        .from("screenings")
        .select("passed, failure_reason, last_close")
        .eq("ins_id", insId)
        .order("screened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (s) screeningByIns.set(insId, s);
    }

    // Compute position exits (BUY MATCHED/PARTIAL with fills)
    for (const o of orderRows) {
      if (o.side !== "BUY" || !["MATCHED", "PARTIAL"].includes(o.status) || (o.qty_filled ?? 0) <= 0) continue;
      const s = screeningByIns.get(o.ins_id);
      if (!s || s.passed !== false) continue;
      if (getPositionAction(s.failure_reason) !== "exit") continue;
      positionExits.push({
        orderId: o.id,
        insId: o.ins_id,
        ticker: o.instruments?.ticker ?? `#${o.ins_id}`,
        name: o.instruments?.name ?? "",
        reason: s.failure_reason ?? "unknown",
        avgFillPrice: o.avg_fill_price ?? o.limit_price,
        lastClose: s.last_close,
        qtyFilled: o.qty_filled,
      });
    }

    // Compute order cancels (PLACED/PARTIAL orders)
    for (const o of orderRows) {
      if (!["PLACED", "PARTIAL"].includes(o.status)) continue;
      const s = screeningByIns.get(o.ins_id);
      if (!s || s.passed !== false) continue;
      if (getOrderAction(s.failure_reason) !== "cancel") continue;
      orderCancels.push({
        orderId: o.id,
        insId: o.ins_id,
        ticker: o.instruments?.ticker ?? `#${o.ins_id}`,
        name: o.instruments?.name ?? "",
        side: o.side,
        limitPrice: o.limit_price,
        qty: o.qty,
        reason: s.failure_reason ?? "unknown",
      });
    }
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

      {/* Positions to exit */}
      {positionExits.length > 0 && (
        <div className="border border-red-300 rounded-md overflow-hidden">
          <div className="bg-red-50 px-4 py-2">
            <h2 className="text-sm font-semibold text-red-700">Positions to exit ({positionExits.length})</h2>
          </div>
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Bought at</TableHead>
                <TableHead className="text-right">Current</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positionExits.map((p) => (
                <TableRow key={p.orderId}>
                  <TableCell className="font-medium">
                    <Link href={`/stocks/${encodeURIComponent(p.ticker)}`} className="hover:underline">{p.ticker}</Link>
                    <span className="text-muted-foreground ml-1">{p.name}</span>
                  </TableCell>
                  <TableCell className="text-red-600">{p.reason}</TableCell>
                  <TableCell className="text-right font-mono">{fmt(p.avgFillPrice, 4)}</TableCell>
                  <TableCell className="text-right font-mono">{p.lastClose != null ? fmt(p.lastClose) : "—"}</TableCell>
                  <TableCell className="text-right font-mono">{p.qtyFilled.toLocaleString("sv-SE")}</TableCell>
                  <TableCell>
                    <MarkSoldButton
                      buyOrderId={p.orderId}
                      insId={p.insId}
                      qtyFilled={p.qtyFilled}
                      avgFillPrice={p.avgFillPrice}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Orders to cancel */}
      {orderCancels.length > 0 && (
        <div className="border border-amber-300 rounded-md overflow-hidden">
          <div className="bg-amber-50 px-4 py-2">
            <h2 className="text-sm font-semibold text-amber-700">Orders to cancel ({orderCancels.length})</h2>
          </div>
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderCancels.map((o) => (
                <TableRow key={o.orderId}>
                  <TableCell className="font-medium">
                    <Link href={`/stocks/${encodeURIComponent(o.ticker)}`} className="hover:underline">{o.ticker}</Link>
                    <span className="text-muted-foreground ml-1">{o.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("font-medium", o.side === "BUY" ? "text-green-600" : "text-red-600")}>{o.side}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmt(o.limitPrice, 4)}</TableCell>
                  <TableCell className="text-right font-mono">{o.qty.toLocaleString("sv-SE")}</TableCell>
                  <TableCell className="text-amber-600">{o.reason}</TableCell>
                  <TableCell>
                    <CancelOrderButton orderId={o.orderId} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

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

                const streak = streakMap.get(r.ins_id) ?? 1;
                const rankChange = rankChangeMap.get(r.ins_id);

                return (
                  <TableRow
                    key={r.ins_id}
                    className={cn(
                      r.score >= 50 && "bg-green-50",
                      r.position_in_range < 0.3 && "bg-green-100"
                    )}
                  >
                    <TableCell className="font-mono">
                      <span>{r.rank}</span>
                      {rankChange !== undefined && (
                        <span className={cn(
                          "ml-1 text-[10px]",
                          rankChange === null && "text-blue-600",
                          rankChange !== null && rankChange > 0 && "text-green-600",
                          rankChange !== null && rankChange < 0 && "text-red-600",
                          rankChange !== null && rankChange === 0 && "text-muted-foreground",
                        )}>
                          {rankChange === null ? "NY" : rankChange > 0 ? `↑${rankChange}` : rankChange < 0 ? `↓${Math.abs(rankChange)}` : "="}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/stocks/${encodeURIComponent(ticker)}`}
                        className="hover:underline"
                      >
                        {ticker}
                      </Link>
                      {streak <= 1 ? (
                        <span className="ml-1 text-[10px] text-blue-600 font-semibold">NY</span>
                      ) : (
                        <span className="ml-1 text-[10px] text-orange-600">{streak}d</span>
                      )}
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

      {/* Recently dropped */}
      {dropped.length > 0 && (
        <details className="border rounded-md">
          <summary className="px-4 py-3 text-sm font-semibold cursor-pointer hover:bg-muted/50">
            Recently dropped ({dropped.length})
          </summary>
          <div className="px-4 pb-3 space-y-1.5">
            {dropped.map((d) => (
              <div key={d.ins_id} className="text-xs text-muted-foreground flex gap-1.5">
                <Link
                  href={`/stocks/${encodeURIComponent(d.ticker)}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {d.ticker}
                </Link>
                <span>·</span>
                <span>Dropped {d.daysSinceDropped === 0 ? "today" : `${d.daysSinceDropped}d ago`}</span>
                {d.lastRank && (
                  <>
                    <span>·</span>
                    <span>Was rank {d.lastRank}</span>
                  </>
                )}
                {d.currentReason && (
                  <>
                    <span>·</span>
                    <span className="text-orange-600">{d.currentReason}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
