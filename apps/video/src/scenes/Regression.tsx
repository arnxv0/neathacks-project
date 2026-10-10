import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bg, Card, Chip, FadeIn, Kicker } from "../ui/Frame";
import type { ExplainerProps } from "../data/props";

export const Regression: React.FC<ExplainerProps> = (p) => {
  const f = useCurrentFrame();
  const red = f > 50;
  return (
    <Bg>
      <AbsoluteFill style={{ padding: 90 }}>
        <FadeIn><Kicker>5 · never again</Kicker><div style={{ fontSize: 64, fontWeight: 650, marginTop: 12 }}>Every approved fix becomes a permanent regression test.</div></FadeIn>
        <div style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 14 }}>
          {["d1-indirect-injection", "b2-retry-backoff", "g3-confirm-credits"].map((n, i) => (
            <FadeIn key={n} delay={10 + i * 6}>
              <Card style={{ padding: "16px 24px", display: "flex", alignItems: "center", gap: 24, borderColor: i === 0 && red ? "rgba(240,86,79,.7)" : undefined, boxShadow: i === 0 && red ? "0 0 50px -15px var(--fail)" : undefined }}>
                <span className="mono" style={{ fontSize: 28, flex: 1 }}>{n}.yaml</span>
                <span className="mono" style={{ color: "var(--muted)", fontSize: 22 }}>3 seeds</span>
                {i === 0 && red ? <Chip tone="fail">REGRESSED</Chip> : <Chip tone="pass">holding</Chip>}
              </Card>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={60}><Card style={{ marginTop: 40, borderColor: "rgba(240,86,79,.5)" }}>
          <div style={{ fontSize: 30 }}>A later commit <span className="mono" style={{ color: "var(--cp)" }}>{p.regressionCommit}</span> “simplify prompt assembly” brought the injection back.</div>
          <div style={{ fontSize: 26, color: "var(--muted)", marginTop: 10 }}>Preflight’s suite caught it on the next run; <span style={{ color: "var(--cp)" }}>Entire</span> names the commit and the session that wrote it.</div>
        </Card></FadeIn>
      </AbsoluteFill>
    </Bg>
  );
};
