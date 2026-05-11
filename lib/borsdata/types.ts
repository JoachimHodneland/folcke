export interface BorsdataMarket {
  id: number;
  name: string;
  countryId: number;
  isIndex: boolean;
  exchangeName: string;
}

export interface BorsdataInstrument {
  insId: number;
  name: string;
  urlName: string;
  instrument: number;
  isin: string;
  ticker: string;
  yahoo: string;
  sectorId: number;
  marketId: number;
  branchId: number;
  countryId: number;
  listingDate: string;
}

/** Raw OHLCV entry from Börsdata. Field names are single letters to save bandwidth. */
export interface BorsdataStockPrice {
  d: string;  // date YYYY-MM-DD
  o: number;  // open
  h: number;  // high
  l: number;  // low
  c: number;  // close
  v: number;  // volume
}

export interface BorsdataMarketsResponse {
  markets: BorsdataMarket[];
}

export interface BorsdataInstrumentsResponse {
  instruments: BorsdataInstrument[];
}

export interface BorsdataStockPricesResponse {
  instrument: number;
  stockPricesList: BorsdataStockPrice[];
}

export interface BorsdataLastPricesResponse {
  stockPricesList: Array<{
    i: number;             // insId
    d: string;             // date
    o: number; h: number; l: number; c: number; v: number;
  }>;
}
