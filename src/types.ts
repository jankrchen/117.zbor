export type Side = 'BUY' | 'SELL';

/** A single fill / execution as reported by a broker. */
export interface Execution {
  id: string;
  /** ISO timestamp */
  time: string;
  symbol: string;
  side: Side;
  /** Always positive */
  quantity: number;
  price: number;
  /** Commission + fees, always positive (a cost) */
  fees: number;
  /** Contract multiplier (100 for US options, point value for futures, 1 for stocks) */
  multiplier: number;
  assetClass: string;
  account: string;
}

/** A round-trip trade: from flat to flat. */
export interface Trade {
  id: string;
  symbol: string;
  assetClass: string;
  account: string;
  multiplier: number;
  direction: 'LONG' | 'SHORT';
  openTime: string;
  closeTime: string | null;
  /** Largest absolute position held during the trade */
  maxQuantity: number;
  avgEntry: number;
  avgExit: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  /** netPnl / entry notional */
  returnPct: number;
  holdMinutes: number;
  isOpen: boolean;
  executions: Execution[];
}

export interface TradeMeta {
  tags: string[];
  notes: string;
  /** Planned risk in money, for R-multiple */
  risk?: number;
  rating?: number;
  /** Data-source ticker override for the price chart */
  chartSymbol?: string;
}
