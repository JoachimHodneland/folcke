import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CandlestickChart } from "@/components/candlestick-chart";
import { AddOrderModal } from "@/components/add-order-modal";

interface Props {
  params: Promise<{ ticker: string }>;
}

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

export default async function StockDetailPage({ params }: Props) {
  const { ticker } = await params;
  const decodedTicker = decodeURIComponent(ticker);
  const supabase = await createClient();

  // Fetch instrument
  const { data: ins } = await supabase
    .from("instruments")
    .select("ins_id, ticker, name, market_id")
    .eq("ticker", decodedTicker)
    .maybeSingle();

  if (!ins) notFound();

  // 1-year prices for chart
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const { data: prices } = await supabase
    .from("daily_prices")
    .select("date, open, high, low, close, volume")
    .eq("ins_id", ins.ins_id)
    .gte("date", oneYearAgo.toISOString().slice(0, 10))
    .order("date", { ascending: true });

  const chartData = prices ?? [];

  // Latest 30 days for OHLCV table (most recent first)
  const ohlcv30 = [...chartData].reverse().slice(0, 30);

  // Latest screening result for this instrument
  const { data: screening } = await supabase
    .from("screenings")
    .select("*")
    .eq("ins_id", ins.ins_id)
    .order("screened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // All historical screening appearances
  const { data: screeningHistory } = await supabase
    .from("screenings")
    .select("screened_at, rank, score, support_level, resistance_level, suggested_buy_price, suggested_sell_price")
    .eq("ins_id", ins.ins_id)
    .order("screened_at", { ascending: false })
    .limit(30);

  const support = screening?.support_level;
  const resistance = screening?.resistance_level;

  const marketNames: Record<number, string> = { 4: "First North", 5: "Spotlight", 6: "NGM" };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">{ins.ticker}</h1>
          <p className="text-sm text-muted-foreground">{ins.name} · {marketNames[ins.market_id] ?? `Market ${ins.market_id}`}</p>
          {chartData.length > 0 && (
            <p className="text-sm mt-1">
              Close: <span className="font-mono font-medium">{fmt(chartData[chartData.length - 1].close)}</span>
            </p>
          )}
        </div>
        {screening && (
          <AddOrderModal
            insId={ins.ins_id}
            ticker={ins.ticker}
            suggestedBuy={screening.suggested_buy_price}
            suggestedSell={screening.suggested_sell_price}
            suggestedQty={screening.suggested_qty}
          />
        )}
      </div>

      {/* Candlestick chart */}
      {chartData.length > 0 ? (
        <div className="border rounded-md p-3">
          <CandlestickChart
            data={chartData}
            support={support}
            resistance={resistance}
          />
          {(support || resistance) && (
            <p className="text-xs text-muted-foreground mt-2">
              {support && <span className="text-green-600">── support {fmt(support)}</span>}
              {support && resistance && <span className="mx-2">·</span>}
              {resistance && <span className="text-red-600">── resistance {fmt(resistance)}</span>}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No price data available.</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Screening result */}
        {screening && (
          <div className="border rounded-md p-4 space-y-3">
            <h2 className="text-sm font-semibold">Latest screening ({new Date(screening.screened_at).toLocaleDateString("sv-SE")})</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {[
                ["Rank", `#${screening.rank}`],
                ["Score", fmt(screening.score, 1)],
                ["Spread% (30d avg)", fmt(screening.spread_pct, 1)],
                ["Avg turnover 30d", Math.round(screening.avg_turnover_30d).toLocaleString("sv-SE")],
                ["Trend 1m", `${screening.trend_1m_pct > 0 ? "+" : ""}${fmt(screening.trend_1m_pct, 1)}%`],
                ["Trend 3m", `${screening.trend_3m_pct > 0 ? "+" : ""}${fmt(screening.trend_3m_pct, 1)}%`],
                ["Support", `${fmt(screening.support_level)} ×${screening.support_touches}`],
                ["Resistance", `${fmt(screening.resistance_level)} ×${screening.resistance_touches}`],
                ["Position in range", fmt(screening.position_in_range, 3)],
                ["Range width", `${fmt(screening.range_width_pct, 1)}%`],
                ["Buy price", fmt(screening.suggested_buy_price, 4)],
                ["Sell price", fmt(screening.suggested_sell_price, 4)],
                ["Qty", screening.suggested_qty.toLocaleString()],
                ["Position SEK", Math.round(screening.suggested_position_sek).toLocaleString("sv-SE")],
                ["Gross%", `+${fmt(((screening.suggested_sell_price - screening.suggested_buy_price) / screening.suggested_buy_price) * 100, 1)}%`],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-mono">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Screening history */}
        {screeningHistory && screeningHistory.length > 1 && (
          <div className="border rounded-md p-4 space-y-3">
            <h2 className="text-sm font-semibold">Screening history</h2>
            <Table className="text-xs">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Rank</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead className="text-right">Buy</TableHead>
                  <TableHead className="text-right">Sell</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {screeningHistory.map((s) => (
                  <TableRow key={s.screened_at}>
                    <TableCell>{new Date(s.screened_at).toLocaleDateString("sv-SE")}</TableCell>
                    <TableCell className="text-right font-mono">#{s.rank}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.score, 1)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.suggested_buy_price, 4)}</TableCell>
                    <TableCell className="text-right font-mono">{fmt(s.suggested_sell_price, 4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* OHLCV table */}
      <div className="border rounded-md">
        <h2 className="text-sm font-semibold px-4 pt-4 pb-3">Last 30 trading days</h2>
        <Table className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Open</TableHead>
              <TableHead className="text-right">High</TableHead>
              <TableHead className="text-right">Low</TableHead>
              <TableHead className="text-right">Close</TableHead>
              <TableHead className="text-right">Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ohlcv30.map((p) => (
              <TableRow key={p.date}>
                <TableCell className="font-mono">{p.date}</TableCell>
                <TableCell className="text-right font-mono">{fmt(p.open)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(p.high)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(p.low)}</TableCell>
                <TableCell className="text-right font-mono">{fmt(p.close)}</TableCell>
                <TableCell className="text-right font-mono">{p.volume.toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
