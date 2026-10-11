import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { LINES, VO } from "./data/vo";
import { Bg, Big, Card, Chip, FadeIn, Kicker } from "./ui/Frame";
import { Captions } from "./ui/Captions";
import { useLayout } from "./ui/layout";
import { REGRESSION_COMMIT_SUBJECT, REGRESSION_SUITES, REGRESSION_TOTAL_SUITES } from "./scenes/Regression";
import type { ExplainerProps } from "./data/props";

// 30-second teaser for social (rendered 1920x1080 and 1080x1920): five beats, 5-6 s each, narration tz-* burned in as
// captions, music at 3% like the other compositions. Numbers come from props.ts (the full run) and Regression.tsx.
export const FPS = 30;
const MIN = 5.0;
export const BEATS: { key: string; frames: number }[] = ["tz-hook", "tz-before-after", "tz-replay", "tz-regression", "tz-cta"].map((key) => ({ key, frames: Math.ceil(Math.max(MIN, (VO[key] ?? MIN) + 0.5) * FPS) }));
export const TEASER_TOTAL = BEATS.reduce((n, b) => n + b.frames, 0);
const MUSIC_VOL = 0.03;

const Center: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const L = useLayout();
  return <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: L.pad, paddingBottom: L.pad + (L.captionBand || Math.round(L.height * 0.2)) }}>{children}</AbsoluteFill>;
};

const HookBeat: React.FC = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  const words = "Your agent passed the happy path.".split(" ");
  return (
    <Bg><Center>
      <FadeIn><Kicker>preflight</Kicker></FadeIn>
      <div style={{ marginTop: 30, fontSize: (L.square && !L.portrait) ? 76 : 100, fontWeight: 700, letterSpacing: -3, lineHeight: 1.08 }}>
        {words.map((w, i) => { const t = interpolate(f, [6 + i * 4, 14 + i * 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }); return <span key={i} style={{ opacity: t, filter: `blur(${(1 - t) * 8}px)`, marginRight: 20, display: "inline-block" }}>{w}</span>; })}
      </div>
      <FadeIn delay={40}><div style={{ marginTop: 24, fontSize: (L.square && !L.portrait) ? 44 : 56, color: "var(--muted)" }}>Production will not be so polite.</div></FadeIn>
    </Center></Bg>
  );
};

const BeforeAfterBeat: React.FC<ExplainerProps> = (p) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const big = (L.square && !L.portrait) ? 230 : 260;
  return (
    <Bg><Center>
      <FadeIn><Kicker>a real sales agent · 20 attacks · {p.total} seeds</Kicker></FadeIn>
      <div style={{ display: "flex", flexDirection: L.square ? "column" : "row", gap: L.square ? 10 : 70, alignItems: "center", marginTop: 30 }}>
        <div><div className="mono" style={{ color: "var(--muted)", fontSize: L.small + 4, letterSpacing: 4 }}>BEFORE</div><div style={{ display: "flex", alignItems: "baseline", gap: 14, justifyContent: "center" }}><Big value={p.before} color="var(--fail)" delay={10} size={big} /><span style={{ fontSize: (L.square && !L.portrait) ? 60 : 72, color: "var(--muted)" }}>/ {p.total}</span></div></div>
        <div style={{ fontSize: 80, color: "var(--muted)", opacity: interpolate(f, [55, 65], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), transform: L.square ? "rotate(90deg)" : undefined }}>→</div>
        <div style={{ opacity: interpolate(f, [60, 72], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}><div className="mono" style={{ color: "var(--muted)", fontSize: L.small + 4, letterSpacing: 4 }}>AFTER ITS FIXES</div><div style={{ display: "flex", alignItems: "baseline", gap: 14, justifyContent: "center" }}><Big value={p.after} from={p.before} color="var(--pass)" delay={65} size={big} /><span style={{ fontSize: (L.square && !L.portrait) ? 60 : 72, color: "var(--muted)" }}>/ {p.total}</span></div></div>
      </div>
      <FadeIn delay={100}><div className="mono" style={{ marginTop: 20, color: "var(--muted)", fontSize: L.small + 2 }}>attack runs that got through · {p.clusters} root causes · one Claude Code fixer each</div></FadeIn>
    </Center></Bg>
  );
};

const Dots: React.FC<{ n: number; ok: number; delay: number; size: number }> = ({ n, ok, delay, size }) => {
  const f = useCurrentFrame();
  return <div style={{ display: "flex", gap: Math.round(size * 0.4), flexWrap: "wrap", justifyContent: "center", maxWidth: size * 1.4 * 10 + 8 }}>{Array.from({ length: n }).map((_, i) => { const on = f > delay + i * 4; return <div key={i} style={{ width: size, height: size, borderRadius: size / 2, background: on ? (i < ok ? "var(--pass)" : "var(--fail)") : "rgba(255,255,255,.15)" }} />; })}</div>;
};

const ReplayBeat: React.FC<ExplainerProps> = (p) => {
  const L = useLayout();
  const [b1, b2] = p.replayBefore.split("/").map(Number);
  const [a1, a2] = p.replayAfter.split("/").map(Number);
  const dot = (L.square && !L.portrait) ? 44 : 48;
  return (
    <Bg><Center>
      <FadeIn><Kicker>is it luck? replay the exact failing seeds</Kicker></FadeIn>
      <div style={{ display: "flex", flexDirection: L.square ? "column" : "row", gap: L.square ? 20 : 50, marginTop: 30, alignItems: "stretch", width: "100%", justifyContent: "center" }}>
        <FadeIn delay={6} style={{ flex: 1 }}><Card style={{ height: "100%" }}><div className="mono" style={{ color: "var(--muted)", fontSize: L.small + 2 }}>before the fix</div><div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}><Dots n={b2} ok={b1} delay={10} size={dot} /></div><div className="mono" style={{ fontSize: (L.square && !L.portrait) ? 60 : 64, marginTop: 14, color: "var(--fail)" }}>{p.replayBefore} pass</div></Card></FadeIn>
        <FadeIn delay={40} style={{ flex: 1.4 }}><Card glow="var(--pass)" style={{ height: "100%" }}><div className="mono" style={{ color: "var(--muted)", fontSize: L.small + 2 }}>after the fix · {a2 / Math.max(1, b2)}× per seed</div><div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}><Dots n={a2} ok={a1} delay={45} size={dot} /></div><div className="mono" style={{ fontSize: (L.square && !L.portrait) ? 60 : 64, marginTop: 14, color: "var(--pass)" }}>{p.replayAfter} pass</div></Card></FadeIn>
      </div>
    </Center></Bg>
  );
};

const RegressionBeat: React.FC<ExplainerProps> = (p) => {
  const L = useLayout();
  const f = useCurrentFrame();
  const red = f > 45;
  const rows = REGRESSION_SUITES.filter((s) => s.regressed);
  return (
    <Bg><Center>
      <FadeIn><Kicker>does it stay fixed? · {REGRESSION_TOTAL_SUITES} regression suites</Kicker></FadeIn>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24, width: "100%" }}>
        {rows.map((s, i) => (
          <FadeIn key={s.id} delay={8 + i * 6}><Card style={{ padding: (L.square && !L.portrait) ? "10px 18px" : "12px 24px", display: "flex", alignItems: "center", gap: 20, borderColor: red ? "rgba(240,86,79,.7)" : undefined, boxShadow: red ? "0 0 50px -15px var(--fail)" : undefined }}>
            <span className="mono" style={{ fontSize: (L.square && !L.portrait) ? 26 : 32, flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.id}</span>
            <span className="mono" style={{ color: "var(--muted)", fontSize: L.small }}>{s.seeds} {s.seeds === 1 ? "seed" : "seeds"}</span>
            {red ? <Chip tone="fail">REGRESSED</Chip> : <Chip tone="pass">holding</Chip>}
          </Card></FadeIn>
        ))}
      </div>
      <FadeIn delay={60}><div style={{ marginTop: 24, fontSize: (L.square && !L.portrait) ? 34 : 38 }}>A later refactor <span className="mono" style={{ color: "var(--cp)" }}>{p.regressionCommit}</span> “{REGRESSION_COMMIT_SUBJECT}”: <span style={{ color: "var(--fail)" }}>{rows.length} of {REGRESSION_TOTAL_SUITES} suites failed</span>. Preflight named the commit.</div></FadeIn>
    </Center></Bg>
  );
};

const CTABeat: React.FC<ExplainerProps> = (p) => {
  const L = useLayout();
  return (
    <Bg><Center>
      <FadeIn><Kicker>preflight</Kicker></FadeIn>
      <FadeIn delay={8}><div style={{ fontSize: (L.square && !L.portrait) ? 70 : 92, fontWeight: 700, letterSpacing: -3, marginTop: 20 }}>attack · trace · fix · prove</div></FadeIn>
      <FadeIn delay={20}><div style={{ fontSize: (L.square && !L.portrait) ? 36 : 42, color: "var(--muted)", marginTop: 20 }}>Crash-test your AI agent before your customers do.</div></FadeIn>
      <FadeIn delay={32}><div className="mono" style={{ fontSize: (L.square && !L.portrait) ? 40 : 44, color: "var(--cyan)", marginTop: 44 }}>{p.repoUrl}</div><div className="mono" style={{ fontSize: (L.square && !L.portrait) ? 30 : 32, color: "var(--fg)", marginTop: 16 }}>#neatHack</div><div className="mono" style={{ fontSize: (L.square && !L.portrait) ? 22 : 26, color: "var(--muted)", marginTop: 16 }}>neatlogs · Entire · cfo.ai · Crustdata · Claude Code</div></FadeIn>
    </Center></Bg>
  );
};

const Cross: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Teaser: React.FC<ExplainerProps> = (p) => {
  let at = 0;
  const parts = [<HookBeat key="hook" />, <BeforeAfterBeat key="ba" {...p} />, <ReplayBeat key="replay" {...p} />, <RegressionBeat key="reg" {...p} />, <CTABeat key="cta" {...p} />];
  return (
    <AbsoluteFill style={{ background: "var(--bg)" }}>
      <Audio src={staticFile("music-ambient.mp3")} loop volume={(f) => MUSIC_VOL * Math.min(1, f / 30) * Math.min(1, Math.max(0, (TEASER_TOTAL - f) / 45))} />
      {BEATS.map((b, i) => { const from = at; at += b.frames; return (
        <Sequence key={b.key} from={from} durationInFrames={b.frames} name={b.key}>
          <Cross frames={b.frames}>{parts[i]}<Captions text={LINES[b.key] ?? ""} seconds={VO[b.key] ?? MIN} /></Cross>
          <Audio src={staticFile(`vo/${b.key}.mp3`)} />
        </Sequence>
      ); })}
    </AbsoluteFill>
  );
};
