import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export const Bg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: "var(--bg)", color: "var(--fg)", fontFamily: "Inter, ui-sans-serif, system-ui", overflow: "hidden" }}>
    <AbsoluteFill style={{ backgroundImage: "linear-gradient(to right, rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.035) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
    <AbsoluteFill style={{ background: "radial-gradient(1200px 500px at 50% -10%, rgba(95,212,238,.14), transparent 60%)" }} />
    {children}
  </AbsoluteFill>
);

export const FadeIn: React.FC<{ delay?: number; duration?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({ delay = 0, duration = 14, y = 18, children, style }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [delay, delay + duration], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ease = 1 - Math.pow(1 - t, 3);
  return <div style={{ opacity: ease, transform: `translateY(${(1 - ease) * y}px)`, ...style }}>{children}</div>;
};

export const Chip: React.FC<{ tone?: "pass" | "fail" | "pending" | "trace" | "cp" | "muted"; children: React.ReactNode }> = ({ tone = "muted", children }) => {
  const c = { pass: "var(--pass)", fail: "var(--fail)", pending: "var(--pending)", trace: "var(--trace)", cp: "var(--cp)", muted: "var(--muted)" }[tone];
  return <span className="mono" style={{ color: c, border: `1px solid ${c}55`, background: `${c}18`, borderRadius: 8, padding: "6px 12px", fontSize: 22 }}>{children}</span>;
};

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties; glow?: string }> = ({ children, style, glow }) => (
  <div style={{ background: "var(--card)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 20, padding: 28, boxShadow: glow ? `0 0 60px -20px ${glow}` : undefined, ...style }}>{children}</div>
);

export const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mono" style={{ color: "var(--cyan)", letterSpacing: 6, fontSize: 22, textTransform: "uppercase" }}>{children}</div>
);

export const Big: React.FC<{ value: number; color?: string; from?: number; delay?: number }> = ({ value, color = "var(--fg)", from = 0, delay = 0 }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [delay, delay + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const v = Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3)));
  return <span style={{ color, fontSize: 180, fontWeight: 700, letterSpacing: -8, lineHeight: 1 }}>{v}</span>;
};
