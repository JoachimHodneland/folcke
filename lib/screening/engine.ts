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

export interface ScreeningResult {
  ins_id: number;
  passed: boolean;
  failure_reason: string | null;
  is_owned: boolean;
  last_close: number | null;
  spread_pct: number | null;
  avg_turnover_30d: number | null;
  trend_1m_pct: number | null;
  trend_3m_pct: number | null;
  support_level: number | null;
  support_touches: number | null;
  resistance_level: number | null;
  resistance_touches: number | null;
  range_width_pct: number | null;
  position_in_range: number | null;
  score: number | null;
  suggested_buy_price: number | null;
  suggested_sell_price: number | null;
  suggested_qty: number | null;
  suggested_position_sek: number | null;
  rank: number | null;
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

function makeFailedResult(
  ins_id: number,
  reason: string,
  is_owned: boolean,
  partial: Partial<ScreeningResult> = {}
): ScreeningResult {
  return {
    ins_id,
    passed: false,
    failure_reason: reason,
    is_owned,
    last_close: null,
    spread_pct: null,
    avg_turnover_30d: null,
    trend_1m_pct: null,
    trend_3m_pct: null,
    support_level: null,
    support_touches: null,
    resistance_level: null,
    resistance_touches: null,
    range_width_pct: null,
    position_in_range: null,
    score: null,
    suggested_buy_price: null,
    suggested_sell_price: null,
    suggested_qty: null,
    suggested_position_sek: null,
    rank: null,
    ...partial,
  };
}

export async function runScreening(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ownedInsIds: Set<number> = new Set()
): Promise<{ candidates: ScreeningCandidate[]; all: ScreeningResult[] }> {
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
  const allResults: ScreeningResult[] = [];

  for (const ins of instruments as RawInstrument[]) {
    const isOwned = ownedInsIds.has(ins.ins_id);

    // Check owned first
    if (isOwned) {
      const history = byIns.get(ins.ins_id) ?? [];
      const lastClose = history.length > 0 ? history[0].close : null;
      allResults.push(makeFailedResult(ins.ins_id, "owned", true, { last_close: lastClose }));
      continue;
    }

    const history = byIns.get(ins.ins_id) ?? [];
    if (history.length < 30) {
      allResults.push(makeFailedResult(ins.ins_id, "insufficient_history", false));
      continue;
    }

    const days90 = history.slice(0, 90);
    const latest = days90[0];
    const last_close = latest.close;

    // ── Stage A: hard filters ──────────────────────────────────────────────

    if (last_close < 0.5 || last_close > 10) {
      allResults.push(makeFailedResult(ins.ins_id, "price_out_of_range", false, { last_close }));
      continue;
    }

    const days30 = days90.slice(0, 30);

    const spread_pct =
      days30.reduce((s, d) => s + ((d.high - d.low) / d.close) * 100, 0) /
      days30.length;
    if (spread_pct < 2 || spread_pct > 12) {
      allResults.push(makeFailedResult(ins.ins_id, "spread_out_of_range", false, { last_close, spread_pct }));
      continue;
    }

    const avg_turnover_30d =
      days30.reduce((s, d) => s + d.close * d.volume, 0) / days30.length;
    if (avg_turnover_30d < 100_000 || avg_turnover_30d > 2_000_000) {
      allResults.push(makeFailedResult(ins.ins_id, "turnover_out_of_range", false, { last_close, spread_pct, avg_turnover_30d }));
      continue;
    }

    const close21d = history[Math.min(21, history.length - 1)].close;
    const close90d = history[Math.min(89, history.length - 1)].close;
    const trend_1m_pct = ((last_close - close21d) / close21d) * 100;
    const trend_3m_pct = ((last_close - close90d) / close90d) * 100;

    const stageAPartial = { last_close, spread_pct, avg_turnover_30d, trend_1m_pct, trend_3m_pct };

    if (trend_1m_pct < -12 || trend_1m_pct > 15) {
      allResults.push(makeFailedResult(ins.ins_id, "trend_1m_out_of_range", false, stageAPartial));
      continue;
    }
    if (trend_3m_pct < -12 || trend_3m_pct > 18) {
      allResults.push(makeFailedResult(ins.ins_id, "trend_3m_out_of_range", false, stageAPartial));
      continue;
    }
    if (Math.abs(trend_1m_pct - trend_3m_pct) > 20) {
      allResults.push(makeFailedResult(ins.ins_id, "trend_inconsistent", false, stageAPartial));
      continue;
    }

    // ── Stage B: support / resistance touch count ──────────────────────────

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
        support_level = band_top;
      }
    }
    if (support_level === 0) {
      allResults.push(makeFailedResult(ins.ins_id, "no_support", false, stageAPartial));
      continue;
    }

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
        resistance_level = band_bot;
      }
    }
    if (resistance_level === 0) {
      allResults.push(makeFailedResult(ins.ins_id, "no_resistance", false, {
        ...stageAPartial, support_level, support_touches,
      }));
      continue;
    }

    if (support_touches + resistance_touches < 10) {
      allResults.push(makeFailedResult(ins.ins_id, "touches_too_low", false, {
        ...stageAPartial, support_level, support_touches, resistance_level, resistance_touches,
      }));
      continue;
    }

    const range_width_pct =
      ((resistance_level - support_level) / support_level) * 100;
    if (range_width_pct < 5) {
      allResults.push(makeFailedResult(ins.ins_id, "range_too_narrow", false, {
        ...stageAPartial, support_level, support_touches, resistance_level, resistance_touches, range_width_pct,
      }));
      continue;
    }

    const position_in_range =
      (last_close - support_level) / (resistance_level - support_level);
    if (position_in_range > 0.70) {
      allResults.push(makeFailedResult(ins.ins_id, "position_too_high", false, {
        ...stageAPartial, support_level, support_touches, resistance_level, resistance_touches, range_width_pct, position_in_range,
      }));
      continue;
    }

    // ── Scoring ────────────────────────────────────────────────────────────

    const score =
      Math.min(support_touches + resistance_touches, 100) * 0.35 +
      Math.min(range_width_pct / 25, 1.0) * 100 * 0.25 +
      Math.min(avg_turnover_30d / 500_000, 1.0) * 100 * 0.2 +
      Math.max(0, 1 - Math.abs(trend_3m_pct) / 20) * 100 * 0.2;

    // ── Order suggestion ───────────────────────────────────────────────────

    const suggested_buy_price = roundUpToTick(support_level);
    const suggested_sell_price = roundDownToTick(resistance_level);

    if (suggested_sell_price <= suggested_buy_price) {
      allResults.push(makeFailedResult(ins.ins_id, "tick_range_invalid", false, {
        ...stageAPartial, support_level, support_touches, resistance_level, resistance_touches, range_width_pct, position_in_range,
      }));
      continue;
    }

    const suggested_position_sek = Math.max(
      25_000,
      Math.min(50_000, avg_turnover_30d * 0.1)
    );
    const suggested_qty = Math.floor(
      suggested_position_sek / suggested_buy_price
    );
    if (suggested_qty <= 0) {
      allResults.push(makeFailedResult(ins.ins_id, "qty_zero", false, {
        ...stageAPartial, support_level, support_touches, resistance_level, resistance_touches, range_width_pct, position_in_range,
      }));
      continue;
    }

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
  const top30 = candidates.slice(0, 30);
  top30.forEach((c, i) => {
    c.rank = i + 1;
  });

  // Add passed candidates to allResults
  for (const c of top30) {
    allResults.push({
      ins_id: c.ins_id,
      passed: true,
      failure_reason: null,
      is_owned: false,
      last_close: c.last_close,
      spread_pct: c.spread_pct,
      avg_turnover_30d: c.avg_turnover_30d,
      trend_1m_pct: c.trend_1m_pct,
      trend_3m_pct: c.trend_3m_pct,
      support_level: c.support_level,
      support_touches: c.support_touches,
      resistance_level: c.resistance_level,
      resistance_touches: c.resistance_touches,
      range_width_pct: c.range_width_pct,
      position_in_range: c.position_in_range,
      score: c.score,
      suggested_buy_price: c.suggested_buy_price,
      suggested_sell_price: c.suggested_sell_price,
      suggested_qty: c.suggested_qty,
      suggested_position_sek: c.suggested_position_sek,
      rank: c.rank,
    });
  }

  // Also add candidates that passed filters but didn't make top 30 (unranked)
  for (const c of candidates.slice(30)) {
    allResults.push({
      ins_id: c.ins_id,
      passed: true,
      failure_reason: null,
      is_owned: false,
      last_close: c.last_close,
      spread_pct: c.spread_pct,
      avg_turnover_30d: c.avg_turnover_30d,
      trend_1m_pct: c.trend_1m_pct,
      trend_3m_pct: c.trend_3m_pct,
      support_level: c.support_level,
      support_touches: c.support_touches,
      resistance_level: c.resistance_level,
      resistance_touches: c.resistance_touches,
      range_width_pct: c.range_width_pct,
      position_in_range: c.position_in_range,
      score: c.score,
      suggested_buy_price: c.suggested_buy_price,
      suggested_sell_price: c.suggested_sell_price,
      suggested_qty: c.suggested_qty,
      suggested_position_sek: c.suggested_position_sek,
      rank: null,
    });
  }

  return { candidates: top30, all: allResults };
}
