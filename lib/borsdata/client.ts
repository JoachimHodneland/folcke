import type {
  BorsdataMarket,
  BorsdataMarketsResponse,
  BorsdataInstrument,
  BorsdataInstrumentsResponse,
  BorsdataStockPrice,
  BorsdataStockPricesResponse,
  BorsdataLastPricesResponse,
} from "./types";

const BASE_URL = "https://apiservice.borsdata.se/v1";

/** Sliding-window rate limiter: max 100 requests per 10 seconds */
class RateLimiter {
  private timestamps: number[] = [];
  private readonly maxRequests = 100;
  private readonly windowMs = 10_000;

  async throttle(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      // Recurse after waiting to re-check the window
      return this.throttle();
    }

    this.timestamps.push(Date.now());
  }
}

export class BorsdataClient {
  private readonly apiKey: string;
  private readonly limiter = new RateLimiter();

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("BORSDATA_API_KEY is not set");
    this.apiKey = apiKey;
  }

  private async fetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    await this.limiter.throttle();

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("authKey", this.apiKey);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const res = await fetch(url.toString());

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? "10");
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000));
      return this.fetch<T>(path, params);
    }

    if (!res.ok) {
      throw new Error(`Börsdata API error ${res.status} for ${path}`);
    }

    return res.json() as Promise<T>;
  }

  async getMarkets(): Promise<BorsdataMarket[]> {
    const data = await this.fetch<BorsdataMarketsResponse>("/markets");
    return data.markets;
  }

  async getInstruments(): Promise<BorsdataInstrument[]> {
    const data = await this.fetch<BorsdataInstrumentsResponse>("/instruments");
    return data.instruments;
  }

  /**
   * Latest price for ALL instruments in one call.
   * Returns a flat array of { insId, date, open, high, low, close, volume }.
   */
  async getLastPrices(): Promise<Array<{ insId: number } & BorsdataStockPrice>> {
    const data = await this.fetch<BorsdataLastPricesResponse>(
      "/instruments/stockprices/last"
    );
    return data.stockPricesList.map((p) => ({
      insId: p.i,
      d: p.d,
      o: p.o,
      h: p.h,
      l: p.l,
      c: p.c,
      v: p.v,
    }));
  }

  /**
   * Historical daily prices for one instrument.
   * @param from  YYYY-MM-DD
   * @param to    YYYY-MM-DD
   */
  async getHistoricalPrices(
    insId: number,
    from: string,
    to: string
  ): Promise<BorsdataStockPrice[]> {
    const data = await this.fetch<BorsdataStockPricesResponse>(
      `/instruments/${insId}/stockprices`,
      { from, to }
    );
    return data.stockPricesList ?? [];
  }
}
