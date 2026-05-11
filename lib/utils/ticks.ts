/**
 * Nasdaq Nordic / Spotlight tick size table.
 * Source: Nasdaq Nordic Market Model – Equity Markets.
 */
const TICK_TABLE: Array<{ below: number; tick: number }> = [
  { below: 0.1,   tick: 0.001 },
  { below: 0.5,   tick: 0.005 },
  { below: 1.0,   tick: 0.005 },
  { below: 2.0,   tick: 0.01  },
  { below: 5.0,   tick: 0.02  },
  { below: 10.0,  tick: 0.05  },
  { below: 50.0,  tick: 0.10  },
  { below: 100.0, tick: 0.25  },
  { below: 500.0, tick: 0.50  },
  { below: Infinity, tick: 1.00 },
];

export function getTickSize(price: number): number {
  for (const { below, tick } of TICK_TABLE) {
    if (price < below) return tick;
  }
  return 1.0;
}

/** Round a buy limit price UP to the nearest valid tick. */
export function roundUpToTick(price: number): number {
  const tick = getTickSize(price);
  return Math.ceil(price / tick) * tick;
}

/** Round a sell limit price DOWN to the nearest valid tick. */
export function roundDownToTick(price: number): number {
  const tick = getTickSize(price);
  return Math.floor(price / tick) * tick;
}
