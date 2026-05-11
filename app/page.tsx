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
