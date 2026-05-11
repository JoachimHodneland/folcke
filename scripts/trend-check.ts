/**
 * Show trend values for all candidates that passed Stage A price/spread/turnover
 * but were eliminated by trend filters. Helps tune thresholds.
 */
import { config } from "dotenv";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: instruments } = await supabase
    .from("instruments")
    .select("ins_id, ticker");

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);

  // Fetch all prices paged
  const allPrices: { ins_id: number; date: string; high: number; low: number; close: number; volume: number }[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("daily_prices")
      .select("ins_id, date, high, low, close, volume")
      .gte("date", cutoff.toISOString().slice(0, 10))
      .range(from, from + 999)
      .order("date", { ascending: true });
    allPrices.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
    from += 1000;
  }

  const byIns = new Map<number, typeof allPrices>();
  for (const p of allPrices) {
    if (!byIns.has(p.ins_id)) byIns.set(p.ins_id, []);
    byIns.get(p.ins_id)!.push(p);
  }
  for (const arr of byIns.values()) arr.sort((a, b) => b.date.localeCompare(a.date));

  const tickerMap = new Map((instruments ?? []).map(i => [i.ins_id, i.ticker]));

  const borderline: { ticker: string; close: number; spread: number; turnover: number; t1m: number; t3m: number; diff: number; fail: string }[] = [];

  for (const [insId, history] of byIns) {
    if (history.length < 30) continue;
    const days90 = history.slice(0, 90);
    const latest = days90[0];
    const last_close = latest.close;

    if (last_close < 0.5 || last_close > 10) continue;

    const days30 = days90.slice(0, 30);
    const spread_pct = days30.reduce((s, d) => s + ((d.high - d.low) / d.close) * 100, 0) / days30.length;
    if (spread_pct < 2 || spread_pct > 12) continue;

    const avg_turnover_30d = days30.reduce((s, d) => s + d.close * d.volume, 0) / days30.length;
    if (avg_turnover_30d < 100_000 || avg_turnover_30d > 2_000_000) continue;

    const close21d = history[Math.min(21, history.length - 1)].close;
    const close90d = history[Math.min(89, history.length - 1)].close;
    const t1m = ((last_close - close21d) / close21d) * 100;
    const t3m = ((last_close - close90d) / close90d) * 100;

    const fails = [];
    if (t1m < -12 || t1m > 15) fails.push(`1m=${t1m.toFixed(1)}%`);
    if (t3m < -12 || t3m > 18) fails.push(`3m=${t3m.toFixed(1)}%`);
    if (Math.abs(t1m - t3m) > 20) fails.push(`|1m-3m|=${Math.abs(t1m-t3m).toFixed(1)}`);

    if (fails.length > 0) {
      borderline.push({
        ticker: tickerMap.get(insId) ?? `#${insId}`,
        close: last_close,
        spread: spread_pct,
        turnover: avg_turnover_30d,
        t1m,
        t3m,
        diff: Math.abs(t1m - t3m),
        fail: fails.join(", "),
      });
    }
  }

  borderline.sort((a, b) => Math.max(Math.abs(a.t1m), Math.abs(a.t3m)) - Math.max(Math.abs(b.t1m), Math.abs(b.t3m)));

  console.log("\nStocks passing price/spread/turnover but FAILING trend filters:\n");
  console.log("Ticker     Close    1m%      3m%    |diff|  Fails");
  console.log("─────────────────────────────────────────────────────────");
  for (const s of borderline) {
    console.log(
      `${s.ticker.padEnd(10)} ${s.close.toFixed(2).padStart(6)}  ${s.t1m.toFixed(1).padStart(6)}%  ${s.t3m.toFixed(1).padStart(6)}%  ${s.diff.toFixed(1).padStart(6)}  ${s.fail}`
    );
  }
  console.log(`\nTotal eliminated by trend: ${borderline.length}`);
}

main().catch(e => { console.error(e); process.exit(1); });
