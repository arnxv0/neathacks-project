import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Bg, FadeIn, Kicker } from "./ui/Frame";
import type { ExplainerProps } from "./data/props";

export const FPS = 30;

type Clip = { file: string; seconds: number; kicker: string; title: string; caption: string };
// Durations are trimmed to what the recordings contain; the recorder waits are the source of truth.
export const CLIPS: Clip[] = [
  { file: "01-scorecard.mp4", seconds: 7, kicker: "1 · attack", title: "20 attack types, 50 seeds, one scorecard", caption: "Hostile personas, chaos faults from a proxy, poisoned Crustdata records. 8 of 20 attacks got through on the first pass." },
  { file: "02-pipeline.mp4", seconds: 8, kicker: "2 · pipeline", title: "Every stage, live from the event ledger", caption: "Attack → grade → cluster → diverge → fix → review → regress → after. Fixer lanes and a live feed stream over SSE." },
  { file: "03-clusters.mp4", seconds: 11, kicker: "3 · explain", title: "Root cause and the first divergent step", caption: "Deterministic clustering, an analyst hypothesis with suspected files, entire-graph blast radius, the exact step where the run went wrong, a neatlogs trace link." },
  { file: "04-fix.mp4", seconds: 11, kicker: "4 · fix", title: "One Claude Code fixer per root cause", caption: "Each fixer works in its own git worktree from a short brief. The diff is reviewed by a human: approve, request changes, edit, or reject." },
  { file: "05-replay-proof.mp4", seconds: 8, kicker: "5 · prove", title: "Replay the exact failing runs", caption: "0 of 1 before the fix, 2 of 2 after, against the fixed branch. A fix only counts when every replay passes." },
  { file: "06-regressions.mp4", seconds: 8, kicker: "6 · never again", title: "A refactor brought the bug back. The suite caught it.", caption: "Every approved fix is a permanent regression test. Preflight names the commit that reintroduced the injection." },
  { file: "07-cost.mp4", seconds: 8, kicker: "7 · the business", title: "Every LLM call is metered", caption: "Measured cost per attack run and per assessment flow into the cfo.ai model as the Measured scenario." },
  { file: "08-before-after.mp4", seconds: 6, kicker: "result", title: "3 of 3 → 0 of 3", caption: "Same seeds, merged main. The hero attack, indirect injection through a company record, is closed." },
];

const Lower: React.FC<Clip> = (c) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [8, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 60, right: 60, bottom: 50, opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>
      <div style={{ display: "inline-block", background: "rgba(15,17,23,.86)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, padding: "18px 26px", maxWidth: 1400 }}>
        <div className="mono" style={{ color: "var(--cyan)", letterSpacing: 5, fontSize: 18, textTransform: "uppercase" }}>{c.kicker}</div>
        <div style={{ fontSize: 40, fontWeight: 650, marginTop: 4, color: "var(--fg)" }}>{c.title}</div>
        <div style={{ fontSize: 24, color: "var(--muted)", marginTop: 6, lineHeight: 1.35 }}>{c.caption}</div>
      </div>
    </div>
  );
};

const Title: React.FC<{ p: ExplainerProps }> = ({ p }) => (
  <Bg>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 120 }}>
      <FadeIn><Kicker>preflight · product demo</Kicker></FadeIn>
      <FadeIn delay={8}><div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, marginTop: 24 }}>Crash-test an AI agent before launch</div></FadeIn>
      <FadeIn delay={22}><div style={{ fontSize: 34, color: "var(--muted)", marginTop: 22 }}>Real target: AcmeSales Copilot (Claude + Crustdata). Real attacks, real fixes, real numbers: {p.before}/{p.total} → {p.after}/{p.total}.</div></FadeIn>
      <FadeIn delay={36}><div className="mono" style={{ fontSize: 24, color: "var(--muted)", marginTop: 40 }}>neatlogs · Entire · cfo.ai · Claude Code · Crustdata · #neatHack</div></FadeIn>
    </AbsoluteFill>
  </Bg>
);

const Outro: React.FC<{ p: ExplainerProps }> = ({ p }) => (
  <Bg>
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: 120 }}>
      <FadeIn><Kicker>attack · trace · fix · prove</Kicker></FadeIn>
      <FadeIn delay={10}><div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, marginTop: 24 }}>Find it, fix it, prove it, keep it fixed.</div></FadeIn>
      <FadeIn delay={24}><div className="mono" style={{ fontSize: 32, color: "var(--cyan)", marginTop: 40 }}>{p.repoUrl}</div></FadeIn>
    </AbsoluteFill>
  </Bg>
);

const Fade: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8, frames - 8, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o, background: "var(--bg)" }}>{children}</AbsoluteFill>;
};

export const TITLE_FRAMES = 150, OUTRO_FRAMES = 150;
export const DEMO_TOTAL = TITLE_FRAMES + OUTRO_FRAMES + CLIPS.reduce((n, c) => n + c.seconds * FPS, 0);

export const ProductDemo: React.FC<ExplainerProps> = (p) => {
  let at = TITLE_FRAMES;
  return (
    <AbsoluteFill style={{ background: "var(--bg)" }}>
      <Sequence from={0} durationInFrames={TITLE_FRAMES} name="title"><Fade frames={TITLE_FRAMES}><Title p={p} /></Fade></Sequence>
      {CLIPS.map((c) => { const from = at; const d = c.seconds * FPS; at += d; return (
        <Sequence key={c.file} from={from} durationInFrames={d} name={c.kicker}>
          <Fade frames={d}>
            <AbsoluteFill><OffthreadVideo src={staticFile(`clips/${c.file}`)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>
            <Lower {...c} />
          </Fade>
        </Sequence>
      ); })}
      <Sequence from={at} durationInFrames={OUTRO_FRAMES} name="outro"><Fade frames={OUTRO_FRAMES}><Outro p={p} /></Fade></Sequence>
    </AbsoluteFill>
  );
};
