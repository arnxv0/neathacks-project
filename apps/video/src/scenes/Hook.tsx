import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, FadeIn, Kicker } from "../ui/Frame";

export const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const words = "Your agent passed the happy path.".split(" ");
  return (
    <Bg>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 120 }}>
        <FadeIn delay={0}><Kicker>preflight</Kicker></FadeIn>
        <div style={{ marginTop: 40, fontSize: 92, fontWeight: 650, letterSpacing: -3, textAlign: "center", lineHeight: 1.1 }}>
          {words.map((w, i) => { const t = interpolate(f, [8 + i * 5, 18 + i * 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); return <span key={i} style={{ opacity: t, filter: `blur(${(1 - t) * 8}px)`, marginRight: 22 }}>{w}</span>; })}
        </div>
        <FadeIn delay={48} y={10}><div style={{ marginTop: 28, fontSize: 60, color: "var(--muted)", textAlign: "center" }}>Now meet the users who didn’t read it.</div></FadeIn>
      </AbsoluteFill>
    </Bg>
  );
};
