# cfo.ai model build report (2026-10-11)

Built through the cfo.ai MCP from Claude Code (`claude -p` with the `cfoai` server), from `cfo/assumptions.csv` and `BUSINESS.md`, plus the measured COGS of assessment `20261011-001111-d070`. Verbatim report of the build session:

The build is complete and verified by readback. Here is the report.
## What was created
The workspace is renamed **Preflight** (new slug `preflight-1af410fb`, the old kind-crow slug no longer resolves). The scenario calendar was extended from 2027-12-31 to 2028-10-31, so the model runs the full 24 months, Nov 2026 (month 1) through Oct 2028 (month 24). Nothing pre-existing was deleted; billing, team, triggers and integrations were not touched.
**Pages and tables (all in Main, inherited by the other scenarios)**
| Page | Tables | Variables |
|---|---|---|
| Assumptions | Assumptions (timeless), Unit COGS (derived), plus a units/notes text block | 75 + 10 |
| Model | Funnel & customers, Revenue, COGS & gross margin, Headcount & payroll, Operating expenses, Cash & runway | 19 + 8 + 9 + 11 + 10 + 19 |
| Unit economics | Unit economics (timeless) | 12 |
| Board summary | Text block + Board KPIs: Main vs Measured (scenario comparison columns) | 12 |
Total: 10 tables, 185 variables, 4 pages. All 59 csv rows are Variables with their exact csv names and base values. The 16 extras are labeled in the legend: scenario timing levers (seed month, enterprise monthly-from month, marketing step-up), founder post-seed salary, AE commission rate, tools per hire, and the typical-usage and planning-unit-cost inputs from BUSINESS.md section 5. Variables have no description field in cfo.ai, so units live in the legend text block on the Assumptions page.
**Scenarios:** Downside and Upside carry every csv downside/upside value as an override on the Assumptions table. Measured overrides only the four unit costs (0.00603, 1.4134, 1.67, 37.06).
## Main vs Measured
| KPI | Main | Measured |
|---|---|---|
| ARR month 12 | $1.62M | $1.62M |
| ARR month 24 | $16.5M | $16.5M |
| Gross margin month 12 | 76.1% | 81.0% |
| Gross margin month 24 | 75.0% | 80.5% |
| Cash low point | −$3,236 (month 2) | −$3,028 (month 2) |
| Runway at month 12 | blank (cash-flow positive) | blank |
| Break-even month | 11 | 11 |
| First month cash < 6× burn | 1 (pre-funding); never after pre-seed | same |
| Headcount month 24 | 8 | 8 |
| Pro COGS / customer / month | $90 | $62.45 |
| Assessment COGS | $470 | $487.06 |
Measurement lifts gross margin about 5 points because the measured attack-run cost is a third of the plan, which outweighs the higher fixer cost. Pro LTV:CAC moves from 12.3 to 13.1, Enterprise from 16.9 to 18.9. For context, Downside gives ARR of $333k at month 12, runs out of cash (low point −$737k with no seed) and never breaks even. Upside breaks even in month 3.
## Limitations and judgment calls
- **Month 2 cash goes negative in Main.** Starting cash of $25k does not cover two months of burn plus incorporation before the pre-seed lands in month 3. That is the model's finding, not a bug.
- **Runway is blank once trailing 3-month operating cash flow turns positive** (Main from about month 9, driven by annual prepayments). Burn is defined as the negative of the trailing 3-month average operating cash flow, including prepayment timing.
- **Downside double-counts COGS.** The csv raises both unit costs and per-customer COGS, so effective Pro COGS lands at $204. I applied the csv as given.
- **Upside is not credible past month 12.** 30% month-over-month signup growth compounded for 24 months produces $119M ARR at month 24.
- **Simplifications:** NRR is applied as a monthly compounding factor on Team and Enterprise MRR; assessment conversions go to Pro; Team CAC applies to direct new Team only; annual prepay billed at 12× monthly list, not the discounted annual price; per-customer COGS equal the csv planning values plus the difference between scenario and planning unit costs at typical usage, so the Measured scenario moves them without editing the csv values.
To push a new measured run later, update the four unit-cost rows on the Assumptions table with `scenario: "Measured"` through the same edit tool.
