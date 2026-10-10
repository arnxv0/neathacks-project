import React from "react";
import { AbsoluteFill } from "remotion";
import { Bg, FadeIn, Kicker } from "../ui/Frame";
import type { ExplainerProps } from "../data/props";

export const CTA: React.FC<ExplainerProps> = (p) => (
  <Bg>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 120 }}>
      <FadeIn><Kicker>preflight</Kicker></FadeIn>
      <FadeIn delay={8}><div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -3, marginTop: 24 }}>attack · trace · fix · prove</div></FadeIn>
      <FadeIn delay={22}><div style={{ fontSize: 36, color: "var(--muted)", marginTop: 24 }}>Crash-test your AI agent before your customers do.</div></FadeIn>
      <FadeIn delay={36}><div className="mono" style={{ fontSize: 34, color: "var(--cyan)", marginTop: 50 }}>{p.repoUrl}</div><div className="mono" style={{ fontSize: 26, color: "var(--muted)", marginTop: 14 }}>built with neatlogs · Entire · cfo.ai · Crustdata · Claude  #neatHack</div></FadeIn>
    </AbsoluteFill>
  </Bg>
);
