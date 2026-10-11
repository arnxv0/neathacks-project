import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, Big, Card, FadeIn, Kicker } from "../ui/Frame";
import { useLayout } from "../ui/layout";
import type { ExplainerProps } from "../data/props";

const Dots: React.FC<{ n: number; ok: number; delay: number; size?: number }> = ({ n, ok, delay, size = 26 }) => {
  const f = useCurrentFrame();
  return <div style={{ display: "flex", gap: Math.round(size * 0.4), flexWrap: "wrap" }}>{Array.from({ length: n }).map((_, i) => { const on = f > delay + i * 5; return <div key={i} style={{ width: size, height: size, borderRadius: size / 2, background: on ? (i < ok ? "var(--pass)" : "var(--fail)") : "rgba(255,255,255,.15)" }} />; })}</div>;
};

export const Proof: React.FC<ExplainerProps> = (p) => {
  const [b1, b2] = p.replayBefore.split("/").map(Number);
  const [a1, a2] = p.replayAfter.split("/").map(Number);
  const f = useCurrentFrame();
  const L = useLayout();
  const big = L.square ? 110 : 180;
  return (
    <Bg>
      <AbsoluteFill style={{ padding: L.pad }}>
        <FadeIn><Kicker>4 · prove</Kicker><div style={{ fontSize: L.h1, fontWeight: 650, marginTop: 12 }}>Replay the exact failing runs. Count the passes.</div></FadeIn>
        <div style={{ display: "flex", gap: L.square ? 24 : 60, marginTop: L.gap, alignItems: "flex-end" }}>
          <Card style={{ flex: 1, padding: L.square ? 16 : 28 }}>
            <div className="mono" style={{ color: "var(--muted)", fontSize: L.small }}>replay · before the fix</div>
            <div style={{ marginTop: 14 }}><Dots n={b2} ok={b1} delay={10} size={L.square ? 20 : 26} /></div>
            <div className="mono" style={{ fontSize: Math.round(44 * L.fs), marginTop: 12, color: "var(--fail)" }}>{p.replayBefore} pass</div>
          </Card>
          {!L.square && <div style={{ fontSize: 70, color: "var(--muted)" }}>→</div>}
          <Card style={{ flex: L.square ? 1.6 : 1, padding: L.square ? 16 : 28 }} glow="var(--pass)">
            <div className="mono" style={{ color: "var(--muted)", fontSize: L.small }}>replay · after the fix, {a2 / Math.max(1, b2)}× per seed</div>
            <div style={{ marginTop: 14 }}><Dots n={a2} ok={a1} delay={30} size={L.square ? 20 : 26} /></div>
            <div className="mono" style={{ fontSize: Math.round(44 * L.fs), marginTop: 12, color: "var(--pass)" }}>{p.replayAfter} pass</div>
          </Card>
        </div>
        <div style={{ display: "flex", gap: L.square ? 30 : 60, marginTop: L.gap, alignItems: "baseline" }}>
          <div><div className="mono" style={{ color: "var(--muted)", fontSize: L.small, letterSpacing: 4 }}>ATTACKS THAT SUCCEEDED</div><div style={{ display: "flex", alignItems: "baseline", gap: 16 }}><Big value={p.before} color="var(--fail)" delay={50} size={big} /><span style={{ fontSize: Math.round(60 * L.fs), color: "var(--muted)" }}>/ {p.total}</span></div></div>
          <div style={{ fontSize: Math.round(70 * L.fs), color: "var(--muted)", opacity: interpolate(f, [90, 100], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>→</div>
          <div style={{ opacity: interpolate(f, [95, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><div className="mono" style={{ color: "var(--muted)", fontSize: L.small, letterSpacing: 4 }}>AFTER FIXES</div><div style={{ display: "flex", alignItems: "baseline", gap: 16 }}><Big value={p.after} from={p.before} color="var(--pass)" delay={100} size={big} /><span style={{ fontSize: Math.round(60 * L.fs), color: "var(--muted)" }}>/ {p.total}</span></div></div>
        </div>
      </AbsoluteFill>
    </Bg>
  );
};
