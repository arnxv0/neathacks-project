import React from "react";
import { AbsoluteFill } from "remotion";
import { Bg, Card, FadeIn, Kicker } from "../ui/Frame";
import { useLayout } from "../ui/layout";
import type { ExplainerProps } from "../data/props";

// Gross margin at month 12 in the cfo.ai Measured scenario (docs/evidence/cfo-model-build-20261011.md): 81.0%.
export const MEASURED_GROSS_MARGIN_PCT = 81;

export const Business: React.FC<ExplainerProps> = (p) => {
  const L = useLayout();
  const tiles = [
    ["cost per attack run", `$${p.costPerRun.toFixed(3)}`, "measured in neatlogs"],
    ["cost per full assessment", `$${Math.round(p.costPerAssessment)}`, "attacks + fixers + replays"],
    ["Pro plan", "$499 / mo", "2,500 runs · 25 auto-fixes"],
  ];
  return (
    <Bg>
      <AbsoluteFill style={{ padding: L.pad }}>
        <FadeIn><Kicker>6 · the business</Kicker><div style={{ fontSize: L.h1, fontWeight: 650, marginTop: 12 }}>Every LLM call is metered. The model prices itself.</div></FadeIn>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${L.square ? 1 : 3}, 1fr)`, gap: L.square ? 12 : 24, marginTop: L.gap }}>
          {tiles.map(([k, v, h], i) => (
            <FadeIn key={k} delay={10 + i * 8}><Card style={L.square ? { padding: "14px 20px", display: "flex", alignItems: "baseline", gap: 18 } : undefined}>
              <div className="mono" style={{ color: "var(--muted)", fontSize: L.small, flex: L.square ? 1 : undefined }}>{k}</div>
              <div style={{ fontSize: Math.round(64 * L.fs), fontWeight: 700, marginTop: L.square ? 0 : 8 }}>{v}</div>
              {!L.square && <div style={{ color: "var(--muted)", fontSize: 24 }}>{h}</div>}
            </Card></FadeIn>
          ))}
        </div>
        <FadeIn delay={40}><Card style={{ marginTop: L.gap * 0.8 }}><div style={{ fontSize: L.body }}>Measured COGS from <span className="mono">cost_report.csv</span> flows into the <span style={{ color: "var(--cyan)" }}>cfo.ai</span> model: pricing, gross margin, runway. {MEASURED_GROSS_MARGIN_PCT}% gross margin at month 12 in the Measured scenario.</div></Card></FadeIn>
      </AbsoluteFill>
    </Bg>
  );
};
