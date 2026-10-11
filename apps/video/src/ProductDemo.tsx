import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { VO } from "./data/vo";
import { Bg, FadeIn, Kicker } from "./ui/Frame";
import type { ExplainerProps } from "./data/props";

export const FPS = 30;

type Clip = { file: string; seconds: number; vo: string; kicker: string; title: string; caption: string };
// Durations are trimmed to what the recordings contain; the recorder waits are the source of truth.
export const CLIPS: Clip[] = [
  { file: "01-scorecard.mp4", seconds: 7.4, vo: "pd-01", kicker: "1 · attack", title: "How bad is it? 23 of 50 attack runs got through", caption: "Hostile personas, chaos faults from a proxy, poisoned Crustdata records. 23 of 50 attack runs got through on the first pass against the unfixed agent." },
  { file: "02-pipeline.mp4", seconds: 8.7, vo: "pd-02", kicker: "2 · pipeline", title: "Every stage, live from the event ledger", caption: "Attack → grade → cluster → diverge → fix → review → regress → after. Fixer lanes and a live feed stream over SSE." },
  { file: "03-clusters.mp4", seconds: 11.9, vo: "pd-03", kicker: "3 · explain", title: "Why did it fail? Root cause and the divergent step", caption: "Deterministic clustering, an analyst hypothesis with suspected files, entire-graph blast radius, the exact step where the run went wrong, a neatlogs trace link." },
  { file: "04-fix.mp4", seconds: 11.3, vo: "pd-04", kicker: "4 · fix", title: "Who fixes it? One Claude Code fixer per root cause", caption: "25 fix attempts, 23 by Claude Code fixers (2 finished by a human merge), 3 in parallel, each in its own git worktree. This one failed its first replay 0/10 and passed on attempt 2, 10/10. A human approves, requests changes, edits, or rejects." },
  { file: "05-replay-proof.mp4", seconds: 8.0, vo: "pd-05", kicker: "5 · prove", title: "Is it luck? Replay the exact failing runs, 5×", caption: "0 of 4 before the fix, 20 of 20 after, against the fixed branch. A fix only counts when every replay passes." },
  { file: "06-regressions.mp4", seconds: 8.4, vo: "pd-06", kicker: "6 · never again", title: "Does it stay fixed? A refactor brought a bug back", caption: "15 regression suites at the time, one per approved fix. A refactor reverted the retry fix: 4 of 15 suites regressed and Preflight named the commit, 1bbce14." },
  { file: "07-cost.mp4", seconds: 8.0, vo: "pd-07", kicker: "7 · the business", title: "What does it cost? Every call is metered", caption: "$0.006 per attack run, $1.41 per fixer attempt, $37 per full assessment, measured. They flow into the cfo.ai model as the Measured scenario." },
  { file: "08-before-after.mp4", seconds: 6.1, vo: "pd-08", kicker: "result", title: "23 of 50 → 0 of 50", caption: "Same 50 seeds, merged main. Repeated passes: 22–23 before, 0–5 after, leftovers fixed in a second pass. 15 root causes, 17 approved fixes (15 + 2 in the second pass), 16 regression suites." },
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

const secs = (c: Clip) => Math.max(c.seconds, VO[c.vo] + 0.8);
export const TITLE_FRAMES = Math.ceil((VO["pd-title"] + 1.2) * FPS), OUTRO_FRAMES = Math.ceil((VO["pd-outro"] + 1.5) * FPS);
export const DEMO_TOTAL = TITLE_FRAMES + OUTRO_FRAMES + CLIPS.reduce((n, c) => n + Math.ceil(secs(c) * FPS), 0);


const MUSIC_VOL = 0.03;
const Music: React.FC<{ total: number }> = ({ total }) => (
  <Audio src={staticFile("music-ambient.mp3")} loop volume={(f) => MUSIC_VOL * Math.min(1, f / 45) * Math.min(1, Math.max(0, (total - f) / 60))} />
);

export const ProductDemo: React.FC<ExplainerProps> = (p) => {
  let at = TITLE_FRAMES;
  return (
    <AbsoluteFill style={{ background: "var(--bg)" }}>
      <Music total={DEMO_TOTAL} />
      <Sequence from={0} durationInFrames={TITLE_FRAMES} name="title"><Fade frames={TITLE_FRAMES}><Title p={p} /></Fade><Audio src={staticFile("vo/pd-title.mp3")} /></Sequence>
      {CLIPS.map((c) => { const from = at; const d = Math.ceil(secs(c) * FPS); const rate = Math.min(1, c.seconds / secs(c)); at += d; return (
        <Sequence key={c.file} from={from} durationInFrames={d} name={c.kicker}>
          <Fade frames={d}>
            <AbsoluteFill><OffthreadVideo src={staticFile(`clips/${c.file}`)} muted playbackRate={rate} style={{ width: "100%", height: "100%", objectFit: "cover" }} /></AbsoluteFill>
            <Lower {...c} />
            <Audio src={staticFile(`vo/${c.vo}.mp3`)} />
          </Fade>
        </Sequence>
      ); })}
      <Sequence from={at} durationInFrames={OUTRO_FRAMES} name="outro"><Fade frames={OUTRO_FRAMES}><Outro p={p} /></Fade><Audio src={staticFile("vo/pd-outro.mp3")} /></Sequence>
    </AbsoluteFill>
  );
};
