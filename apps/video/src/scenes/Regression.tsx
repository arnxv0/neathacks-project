import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bg, Card, Chip, FadeIn, Kicker } from "../ui/Frame";
import { useLayout } from "../ui/layout";
import type { ExplainerProps } from "../data/props";

// Regression beat on the fixed main, ledger regress-20261011-020324-9852: 15 suites, 4 REGRESSED,
// all blamed on the planted refactor 1bbce14 (docs/evidence/regression-caught-blame-20261011.json).
export const REGRESSION_SUITES: { id: string; seeds: number; regressed: boolean }[] = [
  { id: "b1-b2-b3-honesty-retry-0af0c9", seeds: 4, regressed: true },
  { id: "b2-b3-retry-5988d4", seeds: 2, regressed: true },
  { id: "d1-watchlist-0fd51c", seeds: 1, regressed: true },
  { id: "d1-watchlist-2884e5", seeds: 1, regressed: true },
  { id: "g2-g3-watchlist-aaaeb2", seeds: 4, regressed: false },
  { id: "a6-watchlist-0c3c1b", seeds: 2, regressed: false },
];
export const REGRESSION_TOTAL_SUITES = 15;
export const REGRESSION_COMMIT_SUBJECT = "refactor: simplify upstream retry loop";
const REGRESSED = REGRESSION_SUITES.filter((s) => s.regressed).length;
const HOLDING_HIDDEN = REGRESSION_TOTAL_SUITES - REGRESSION_SUITES.length;

export const Regression: React.FC<ExplainerProps> = (p) => {
  const f = useCurrentFrame();
  const L = useLayout();
  const red = f > 50;
  return (
    <Bg>
      <AbsoluteFill style={{ padding: L.pad }}>
        <FadeIn><Kicker>5 · never again</Kicker><div style={{ fontSize: L.h1, fontWeight: 650, marginTop: 12 }}>Every approved fix becomes a permanent regression test.</div></FadeIn>
        <div style={{ marginTop: L.gap, display: "flex", alignItems: "center", gap: 18 }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: L.small }}>preflight regress · {REGRESSION_TOTAL_SUITES} suites</span>
          {red && <Chip tone="fail">{REGRESSED} REGRESSED</Chip>}
        </div>
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: L.square ? 8 : 10 }}>
          {REGRESSION_SUITES.map((s, i) => {
            const hot = s.regressed && red;
            return (
              <FadeIn key={s.id} delay={10 + i * 5}>
                <Card style={{ padding: L.square ? "8px 16px" : "10px 22px", display: "flex", alignItems: "center", gap: 20, borderColor: hot ? "rgba(240,86,79,.7)" : undefined, boxShadow: hot ? "0 0 50px -15px var(--fail)" : undefined }}>
                  <span className="mono" style={{ fontSize: L.body, flex: 1 }}>{s.id}.yaml</span>
                  <span className="mono" style={{ color: "var(--muted)", fontSize: L.small }}>{s.seeds} {s.seeds === 1 ? "seed" : "seeds"}</span>
                  {hot ? <Chip tone="fail">REGRESSED</Chip> : <Chip tone="pass">holding</Chip>}
                </Card>
              </FadeIn>
            );
          })}
          <FadeIn delay={10 + REGRESSION_SUITES.length * 5}><div className="mono" style={{ color: "var(--muted)", fontSize: L.small, paddingLeft: 22 }}>+ {HOLDING_HIDDEN} more suites holding</div></FadeIn>
        </div>
        <FadeIn delay={60}><Card style={{ marginTop: L.gap * 0.6, borderColor: "rgba(240,86,79,.5)" }}>
          <div style={{ fontSize: L.body }}>A later commit <span className="mono" style={{ color: "var(--cp)" }}>{p.regressionCommit}</span> “{REGRESSION_COMMIT_SUBJECT}” quietly reverted the retry fix. {REGRESSED} of {REGRESSION_TOTAL_SUITES} suites failed.</div>
          <div style={{ fontSize: L.small, color: "var(--muted)", marginTop: 8 }}>Preflight caught it on the next run and named the commit; <span style={{ color: "var(--cp)" }}>Entire</span> shows whether a checkpointed session wrote it.</div>
        </Card></FadeIn>
      </AbsoluteFill>
    </Bg>
  );
};
