import { roundUpToTick, roundDownToTick } from "@/lib/utils/ticks";

interface RawPrice {
  ins_id: number;
  date: string;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface RawInstrument {
  ins_id: number;
  ticker: string;
  name: string;
  market_id: number;
}

export interface ScreeningCandidate {
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
  range_width_pct: number;
  position_in_range: number;
  score: number;
  suggested_buy_price: number;
  suggested_sell_price: number;
  suggested_qty: number;
  suggested_position_sek: number;
  rank: number;
}

// Supabase PostgREST default max-rows is 1000. Page accordingly.
const SUPABASE_PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchPaged(supabase: any, cutoff: string): Promise<RawPrice[]> {
  const rows: RawPrice[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("daily_prices")
      .select("ins_id, date, high, low, close, volume")
      .gte("date", cutoff)
      .range(from, from + SUPABASE_PAGE_SIZE - 1)
      .order("date", { ascending: true });

    if (error) throw new Error(`fetchPaged: ${error.message}`);
    rows.push(...(data as RawPrice[]));
    if ((data as RawPrice[]).length < SUPABASE_PAGE_SIZE) break;
    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runScreening(supabase: any): Promise<ScreeningCandidate[]> {
  // Load instruments from our three target markets
  const { data: instruments, error: insErr } = await supabase
    .from("instruments")
    .select("ins_id, ticker, name, market_id");
  if (insErr) throw new Error(`instruments: ${insErr.message}`);

  // 180 calendar days covers 90+ trading days safely
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const allPrices = await fetchPaged(supabase, cutoffStr);

  // Group and sort by date descending (most recent first)
  const byIns = new Map<number, RawPrice[]>();
  for (const p of allPrices) {
    if (!byIns.has(p.ins_id)) byIns.set(p.ins_id, []);
    byIns.get(p.ins_id)!.push(p);
  }
  for (const arr of byIns.values()) {
    arr.sort((a, b) => b.date.localeCompare(a.date));
  }

  const candidates: ScreeningCandidate[] = [];

  for (const ins of instruments as RawInstrument[]) {
    const history = byIns.get(ins.ins_id) ?? [];
    if (history.length < 30) continue;

    const days90 = history.slice(0, 90);
    const latest = days90[0];
    const last_close = latest.close;

    // ── Stage A: hard filters ──────────────────────────────────────────────

    if (last_close < 0.5 || last_close > 10) { continue; }

    const days30 = days90.slice(0, 30);

    // 30-day average spread: avoids single-day volatility spike disqualifying a stable stock
    const spread_pct =
      days30.reduce((s, d) => s + ((d.high - d.low) / d.close) * 100, 0) /
      days30.length;
    if (spread_pct < 2 || spread_pct > 12) { continue; }
    const avg_turnover_30d =
      days30.reduce((s, d) => s + d.close * d.volume, 0) / days30.length;
    if (avg_turnover_30d < 100_000 || avg_turnover_30d > 2_000_000) { continue; }

    const close21d = history[Math.min(21, history.length - 1)].close;
    const close90d = history[Math.min(89, history.length - 1)].close;
    const trend_1m_pct = ((last_close - close21d) / close21d) * 100;
    const trend_3m_pct = ((last_close - close90d) / close90d) * 100;

    if (trend_1m_pct < -12 || trend_1m_pct > 15) { continue; }
    if (trend_3m_pct < -12 || trend_3m_pct > 18) { continue; }
    if (Math.abs(trend_1m_pct - trend_3m_pct) > 20) { continue; }

    // ── Stage B: support / resistance touch count ──────────────────────────
    // Uses histogram banding: count days where the low/high was *within* each
    // 1% band below/above last_close. This identifies genuine price floors/ceilings
    // rather than cumulative "below level" which would always favour the nearest level.

    let support_level = 0;
    let support_touches = 0;

    for (let pct = 1; pct < 20; pct++) {
      const band_top = last_close * (1 - pct / 100);
      const band_bot = last_close * (1 - (pct + 1) / 100);
      const touches = days90.filter(
        (d) => d.low > band_bot && d.low <= band_top
      ).length;
      if (touches >= 5 && touches > support_touches) {
        support_touches = touches;
        support_level = band_top; // upper edge of band = support price
      }
    }
    if (support_level === 0) { continue; }

    let resistance_level = 0;
    let resistance_touches = 0;

    for (let pct = 1; pct < 20; pct++) {
      const band_bot = last_close * (1 + pct / 100);
      const band_top = last_close * (1 + (pct + 1) / 100);
      const touches = days90.filter(
        (d) => d.high >= band_bot && d.high < band_top
      ).length;
      if (touches >= 5 && touches > resistance_touches) {
        resistance_touches = touches;
        resistance_level = band_bot; // lower edge of band = resistance price
      }
    }
    if (resistance_level === 0) { continue; }

    // Combined touch minimum: each side needs ≥5, together ≥10
    if (support_touches + resistance_touches < 10) { continue; }

    const range_width_pct =
      ((resistance_level - support_level) / support_level) * 100;
    if (range_width_pct < 5) { continue; }

    // Position within the range: 0 = at support, 1 = at resistance
    const position_in_range =
      (last_close - support_level) / (resistance_level - support_level);
    if (position_in_range > 0.70) { continue; }

    // ── Scoring ────────────────────────────────────────────────────────────

    const score =
      Math.min(support_touches + resistance_touches, 100) * 0.35 +
      Math.min(range_width_pct / 25, 1.0) * 100 * 0.25 +
      Math.min(avg_turnover_30d / 500_000, 1.0) * 100 * 0.2 +
      Math.max(0, 1 - Math.abs(trend_3m_pct) / 20) * 100 * 0.2;

    // ── Order suggestion ───────────────────────────────────────────────────

    const suggested_buy_price = roundUpToTick(support_level);
    const suggested_sell_price = roundDownToTick(resistance_level);

    // Guard: tick rounding must not invert the range
    if (suggested_sell_price <= suggested_buy_price) { continue; }

    const suggested_position_sek = Math.max(
      25_000,
      Math.min(50_000, avg_turnover_30d * 0.1)
    );
    const suggested_qty = Math.floor(
      suggested_position_sek / suggested_buy_price
    );
    if (suggested_qty <= 0) { continue; }

    candidates.push({
      ins_id: ins.ins_id,
      last_close,
      spread_pct,
      avg_turnover_30d,
      trend_1m_pct,
      trend_3m_pct,
      support_level,
      support_touches,
      resistance_level,
      resistance_touches,
      range_width_pct,
      position_in_range,
      score,
      suggested_buy_price,
      suggested_sell_price,
      suggested_qty,
      suggested_position_sek,
      rank: 0,
    });
  }

  // Sort by score, assign rank, return top 30
  candidates.sort((a, b) => b.score - a.score);
  candidates.slice(0, 30).forEach((c, i) => {
    c.rank = i + 1;
  });

  return candidates.slice(0, 30);
}
