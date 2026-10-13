# cfo.ai Measured scenario update (2026-10-12)

The Measured scenario was updated through the cfo.ai MCP from Claude Code with the costs of run `20261012-012855-7f28` ([cost report](cost-report-full-20261012.csv)). This is the session report, unedited.

**The edit succeeded.** All four steps completed with no failures. The write to "COGS (unit costs, measured)" in scenario Measured was applied at change log 291142, changing exactly 4 cells. Main, Downside and Upside were not touched. Nothing was deleted or renamed.

**Measured values now saved** (previous value in brackets):

| Variable | New Measured value | Was |
|---|---|---|
| cost_per_attack_run | 0.00599 | 0.00603 |
| cost_per_fix_attempt | 0.5553 | 1.4134 |
| attempts_per_accepted_fix | 1.13 | 1.67 |
| cost_per_full_assessment | 10.83 | 37.06 |

**Headline numbers, recalculated from scratch** (both tables returned "recalculated, differing cells 0", so the page cache already matched):

| KPI | Main | Measured |
|---|---|---|
| ARR at month 12 (Oct 2027) | $1,616,863 | $1,616,863 |
| ARR at month 24 (Oct 2028) | $16,457,312 | $16,457,312 |
| Gross margin at month 12 | 76.1% | 85.1% |
| Gross margin at month 24 | 75.0% | 85.2% |
| Break-even month | 11 | 11 |
| Cash low point (lowest month-end cash) | -$3,236 | -$2,789 |
| Pro COGS per customer per month | $90.00 | $36.40 |
| LTV:CAC, Pro | 12.3x | 13.9x |
| LTV:CAC, Enterprise | 16.9x | 20.3x |

Supporting values from the Unit economics table, Main vs Measured: Pro monthly margin $393 vs $446, Team LTV:CAC 12.0x vs 14.0x, Enterprise monthly margin $4,223 vs $5,077, Enterprise CAC payback 7.1 vs 5.9 months.

ARR and break-even are identical across scenarios because the Measured edits only change unit costs, not pricing, acquisition or churn. The gross-margin lift of roughly 9 to 10 points and the lower cash trough are the direct effect of the cheaper measured COGS.
