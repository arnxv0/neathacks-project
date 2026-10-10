import React from "react";
import { AbsoluteFill } from "remotion";
import { Bg, Card, FadeIn, Kicker } from "../ui/Frame";
import type { ExplainerProps } from "../data/props";

export const Business: React.FC<ExplainerProps> = (p) => (
  <Bg>
    <AbsoluteFill style={{ padding: 90 }}>
      <FadeIn><Kicker>6 · the business</Kicker><div style={{ fontSize: 64, fontWeight: 650, marginTop: 12 }}>Every LLM call is metered. The model prices itself.</div></FadeIn>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginTop: 60 }}>
        {[["cost per attack run", `$${p.costPerRun.toFixed(3)}`, "measured in neatlogs"], ["cost per assessment", `$${p.costPerAssessment.toFixed(2)}`, "attacks + fixers + replays"], ["Pro plan", "$499 / mo", "2,500 runs · 25 auto-fixes"]].map(([k, v, h], i) => (
          <FadeIn key={k} delay={10 + i * 8}><Card><div className="mono" style={{ color: "var(--muted)", fontSize: 22 }}>{k}</div><div style={{ fontSize: 64, fontWeight: 700, marginTop: 8 }}>{v}</div><div style={{ color: "var(--muted)", fontSize: 24 }}>{h}</div></Card></FadeIn>
        ))}
      </div>
      <FadeIn delay={40}><Card style={{ marginTop: 40 }}><div style={{ fontSize: 30 }}>Measured COGS from <span className="mono">cost_report.csv</span> flows into the <span style={{ color: "var(--cyan)" }}>cfo.ai</span> model: pricing, gross margin, runway. ~80% gross margin at Pro.</div></Card></FadeIn>
    </AbsoluteFill>
  </Bg>
);
