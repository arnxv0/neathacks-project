import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, Big, Card, FadeIn, Kicker } from "../ui/Frame";
import type { ExplainerProps } from "../data/props";

const Dots: React.FC<{ n: number; ok: number; delay: number }> = ({ n, ok, delay }) => {
  const f = useCurrentFrame();
  return <div style={{ display: "flex", gap: 10 }}>{Array.from({ length: n }).map((_, i) => { const on = f > delay + i * 5; return <div key={i} style={{ width: 26, height: 26, borderRadius: 13, background: on ? (i < ok ? "var(--pass)" : "var(--fail)") : "rgba(255,255,255,.15)" }} />; })}</div>;
};

export const Proof: React.FC<ExplainerProps> = (p) => {
  const [b1, b2] = p.replayBefore.split("/").map(Number);
  const [a1, a2] = p.replayAfter.split("/").map(Number);
  const f = useCurrentFrame();
  return (
    <Bg>
      <AbsoluteFill style={{ padding: 90 }}>
        <FadeIn><Kicker>4 · prove</Kicker><div style={{ fontSize: 64, fontWeight: 650, marginTop: 12 }}>Replay the exact failing runs. Count the passes.</div></FadeIn>
        <div style={{ display: "flex", gap: 60, marginTop: 70, alignItems: "flex-end" }}>
          <Card style={{ flex: 1 }}>
            <div className="mono" style={{ color: "var(--muted)", fontSize: 22 }}>replay · before the fix</div>
            <div style={{ marginTop: 18 }}><Dots n={b2} ok={b1} delay={10} /></div>
            <div className="mono" style={{ fontSize: 44, marginTop: 14, color: "var(--fail)" }}>{p.replayBefore} pass</div>
          </Card>
          <div style={{ fontSize: 70, color: "var(--muted)" }}>→</div>
          <Card style={{ flex: 1 }} glow="var(--pass)">
            <div className="mono" style={{ color: "var(--muted)", fontSize: 22 }}>replay · after the fix, {a2 / Math.max(1, b2)}× per seed</div>
            <div style={{ marginTop: 18 }}><Dots n={a2} ok={a1} delay={30} /></div>
            <div className="mono" style={{ fontSize: 44, marginTop: 14, color: "var(--pass)" }}>{p.replayAfter} pass</div>
          </Card>
        </div>
        <div style={{ display: "flex", gap: 60, marginTop: 70, alignItems: "baseline" }}>
          <div><div className="mono" style={{ color: "var(--muted)", fontSize: 24, letterSpacing: 4 }}>ATTACKS THAT SUCCEEDED</div><div style={{ display: "flex", alignItems: "baseline", gap: 16 }}><Big value={p.before} color="var(--fail)" delay={50} /><span style={{ fontSize: 60, color: "var(--muted)" }}>/ {p.total}</span></div></div>
          <div style={{ fontSize: 70, color: "var(--muted)", opacity: interpolate(f, [90, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>→</div>
          <div style={{ opacity: interpolate(f, [95, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><div className="mono" style={{ color: "var(--muted)", fontSize: 24, letterSpacing: 4 }}>AFTER FIXES</div><div style={{ display: "flex", alignItems: "baseline", gap: 16 }}><Big value={p.after} from={p.before} color="var(--pass)" delay={100} /><span style={{ fontSize: 60, color: "var(--muted)" }}>/ {p.total}</span></div></div>
        </div>
      </AbsoluteFill>
    </Bg>
  );
};
