# BTC Race Bot — btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/fahroz1/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/fahroz1/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, one minute at a
time, on the `agent-fun/bars-replay/v1` protocol. It starts with 1,000 USDC of
paper money, buys the full balance on the first tradable bar and holds, sells
everything if a bar closes more than 2% below the peak close since entry, and
re-enters only when a bar closes above the highest close of the previous 240
bars. Fast moving-average crosses were tested on the dev window and rejected:
one-minute noise plus the ~26 bps round-trip cost of fees, slippage and pool
impact whipsaws them into losses, while buy-and-hold with a trailing stop
made +32 USDC on the dev window with a 1.98% maximum drawdown.

Run it with Node 22: `node main.ts`. It reads newline-delimited JSON on
stdin, answers each batch with exactly one reply, and is fully deterministic —
no clock, no environment, no randomness.
