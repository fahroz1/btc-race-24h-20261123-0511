// btc-race-24h-20261123-0511: a cbBTC trend bot for agent-fun/bars-replay/v1.
//
// The bot speaks the protocol through the vendored shim: the harness sends a
// hello first, then one batch per minute (each batch carries the bar that just
// closed, the fills of the orders sent on the previous batch, and the
// account), and the bot answers every batch with exactly one reply carrying
// its orders. Everything is deterministic: no clock, no environment, no
// randomness at all, so two runs on the same bars give identical replies.
//
// Strategy (designed on the frozen dev window, 1,440 one-minute bars):
//   * Buy the full cash balance on the first tradable batch and hold. The dev
//     window drifts up (+3.6% close to close) and one-minute noise is about
//     8 bps, so fast moving-average crosses only whipsaw: every EMA-cross
//     variant backtested lost money after the ~26-46 bps round-trip cost of
//     fees, slippage and pool impact, while buy-and-hold made +32 USDC.
//   * Crash guard: track the highest close since entry; sell everything if a
//     bar closes more than 2% below that peak. On the dev window the peak-to-
//     trough drawdown was 1.98%, so the guard never fires there; on a
//     reversed (falling) copy of the window it caps the loss near -3.4%
//     instead of buy-and-hold's -3.9%, with max drawdown about 4%.
//   * Re-entry: after a stop-out, buy again only when a bar closes above the
//     highest close of the previous 240 bars (a genuine 4-hour high), never
//     on a dip — dip-buying backtests worse in a falling market.
//   * No take-profit: ranking is by net PnL, so a strong rally should be
//     ridden, not capped. At most one position, full size, at most one order
//     per reply, so the caps are never approached.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Sell everything once a close sits this far below the peak close since entry.
const TRAILING_STOP_BPS = 200;
// Re-enter only on a close above the highest close of this many prior bars.
const REENTRY_LOOKBACK = 240;
// Max slippage on any order, in bps from the latest close we were sent.
// Fills sit at the next bar's open; 3% is far above normal one-minute moves
// (about 8 bps of noise) yet still guards against filling into a wild gap.
const MAX_SLIPPAGE_BPS = 300;

// The bot's own memory of the run: closes seen, whether we ever held the
// asset, whether the stop sold us out, and the peak close since entry.
const closes: number[] = [];
let everLong = false;
let stoppedOut = false;
let peakSinceEntry = 0;

// Turn a raw close (bigint at the symbol's price scale) into USDC per coin.
function closeToUsdc(state: BarsState, raw: bigint): number {
  const symbol = state.symbols.get(SYMBOL);
  const scale = symbol === undefined ? 5 : symbol.price_scale;
  return Number(raw) / 10 ** scale;
}

function highestOfLast(n: number): number {
  // Highest close among the n closes before the latest one.
  const start = Math.max(0, closes.length - 1 - n);
  let high = 0;
  for (let i = start; i < closes.length - 1; i += 1) {
    if (closes[i]! > high) high = closes[i]!;
  }
  return high;
}

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    // A batch with no bar for our symbol (a gap minute) carries no new
    // information: hold whatever we hold and send no orders on it.
    const hasBar = batch.bars.some((bar) => bar.symbol === SYMBOL);
    if (!hasBar) return [];

    // Fold the fills of the previous batch's orders into our flags. A buy
    // fill also seeds the trailing stop's peak with the actual fill price:
    // the peak is the highest price since entry, and the fill price is one.
    for (const fill of batch.fills) {
      if (fill.status !== 'filled' || fill.symbol !== SYMBOL) continue;
      if (fill.side === 'buy') {
        everLong = true;
        stoppedOut = false;
        peakSinceEntry = closeToUsdc(state, BigInt(fill.price));
      } else if (fill.side === 'sell') {
        stoppedOut = true;
        peakSinceEntry = 0;
      }
    }

    const rawClose = state.close(SYMBOL);
    if (rawClose === null) return [];
    const close = closeToUsdc(state, rawClose);
    closes.push(close);

    // Warm-up batches build history only: any order decided on one is
    // rejected, so never trade while warming up.
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const heldQty = held === undefined ? 0n : held.qty;

    if (heldQty > 0n) {
      // Long: maintain the trailing stop on closes.
      if (close > peakSinceEntry) peakSinceEntry = close;
      const stopPrice = (peakSinceEntry * (10_000 - TRAILING_STOP_BPS)) / 10_000;
      if (close < stopPrice) {
        return [{ side: 'sell', symbol: SYMBOL, qty: heldQty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: buy on the first tradable batch, or after a stop-out only on a
    // new 240-bar high. Never spend more than the cash we hold.
    const cash = state.cash;
    if (cash < 1_000_000n) return [];
    if (!everLong) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    if (stoppedOut && closes.length > REENTRY_LOOKBACK && close > highestOfLast(REENTRY_LOOKBACK)) {
      return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
    }
    return [];
  },
});
