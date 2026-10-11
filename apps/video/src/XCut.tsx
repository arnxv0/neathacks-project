import React from "react";
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/Archivo";
import { VO } from "./data/vo";
import { FPS } from "./ProductDemo";
import type { ExplainerProps } from "./data/props";

// Crash-test lab: dummy yellow placards, the two-quadrant calibration target, and caption tape stuck under the footage.
const { fontFamily } = loadFont("normal", { weights: ["500", "700", "800"], subsets: ["latin"] });
const YELLOW = "#FFD200", INK = "#000000", CHALK = "#ECEAE4", SMOKE = "rgba(0,0,0,.78)";

type Shot = { file: string; seconds: number; vo: string; line: string; detail: string };
const SHOTS: Shot[] = [
  { file: "08-before-after.mp4", seconds: 6.1, vo: "pd-08", line: "Same 50 attacks after the fixes: 0 got through", detail: "Five repeat runs: 22–23 before, 0–5 after. A second fix pass closed the leftovers." },
  { file: "04-fix.mp4", seconds: 11.3, vo: "pd-04", line: "Each root cause gets its own Claude Code fixer", detail: "This fix failed its first replay and passed on the second try. A person approves every merge." },
  { file: "05-replay-proof.mp4", seconds: 8.0, vo: "pd-05", line: "Every fix is replayed 5 times on the attacks that broke it", detail: "0 of 4 passed before the fix. 20 of 20 after." },
  { file: "06-regressions.mp4", seconds: 8.4, vo: "pd-06", line: "A later refactor brought a bug back, and Preflight caught it", detail: "4 regression tests failed, each traced to that one commit." },
];
// The scorecard recording opens on a loading skeleton and a count-up; start on the settled numbers.
const SKIP_LOADING = Math.round(1.6 * FPS);
const OPEN = Math.round(2.6 * FPS), REVEAL = Math.round(0.7 * FPS);
const shotFrames = (s: Shot) => Math.ceil((Math.max(s.seconds, VO[s.vo]) + 0.6) * FPS);
const OUTRO = Math.ceil((VO["pd-outro"] + 1.4) * FPS);
export const XCUT_TOTAL = OPEN + SHOTS.reduce((n, s) => n + shotFrames(s), 0) + OUTRO;

const Target: React.FC<{ size: number; spin?: number }> = ({ size, spin = 0 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `rotate(${spin}deg)` }}>
    <circle cx="50" cy="50" r="48" fill={YELLOW} stroke={INK} strokeWidth="4" />
    <path d="M50 50 L50 2 A48 48 0 0 1 98 50 Z" fill={INK} />
    <path d="M50 50 L50 98 A48 48 0 0 1 2 50 Z" fill={INK} />
  </svg>
);

const Placard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: YELLOW, color: INK, fontFamily, padding: "120px 140px", justifyContent: "flex-end" }}>{children}</AbsoluteFill>
);

// The result shot pushes in on the before/after numbers so they read on a phone.
const Footage: React.FC<{ s: Shot; frames: number; zoom?: boolean }> = ({ s, frames, zoom }) => {
  const f = useCurrentFrame();
  const z = zoom ? interpolate(f, [REVEAL, REVEAL + 40], [1, 1.75], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) }) : 1;
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <OffthreadVideo src={staticFile(`clips/${s.file}`)} muted startFrom={zoom ? SKIP_LOADING : 0} playbackRate={Math.min(1, s.seconds / (frames / FPS))}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})`, transformOrigin: "22% 12%" }} />
    </AbsoluteFill>
  );
};

const Tape: React.FC<Shot> = (s) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [4, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 72, bottom: 64, maxWidth: 1500, fontFamily, opacity: o }}>
      <div style={{ display: "inline-block", background: YELLOW, color: INK, fontSize: 64, fontWeight: 800, lineHeight: 1.08, letterSpacing: -1.2, padding: "14px 26px 16px" }}>{s.line}</div>
      <div style={{ background: SMOKE, color: CHALK, fontSize: 34, fontWeight: 500, lineHeight: 1.3, padding: "14px 26px", maxWidth: 1180 }}>{s.detail}</div>
    </div>
  );
};

// The one orchestrated moment: the result placard, then the calibration target opens onto the real dashboard.
const Open: React.FC<{ p: ExplainerProps; next: Shot }> = ({ p, next }) => {
  const f = useCurrentFrame();
  const r = interpolate(f, [OPEN - REVEAL, OPEN], [0, 2300], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const spin = interpolate(f, [0, OPEN], [0, 140]);
  return (
    <AbsoluteFill>
      <Placard>
        <div style={{ position: "absolute", top: 120, right: 140 }}><Target size={190} spin={spin} /></div>
        <div style={{ fontSize: 44, fontWeight: 500 }}>We crash tested our sales agent before launch.</div>
        <div style={{ fontSize: 196, fontWeight: 800, letterSpacing: -9, lineHeight: 0.92, marginTop: 28 }}>{p.before} of {p.total} attacks<br />got through.</div>
      </Placard>
      <AbsoluteFill style={{ clipPath: `circle(${r}px at ${1920 - 140 - 95}px ${120 + 95}px)` }}>
        <Footage s={next} frames={shotFrames(next)} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ p: ExplainerProps }> = ({ p }) => (
  <Placard>
    <div style={{ position: "absolute", top: 120, right: 140 }}><Target size={190} /></div>
    <div style={{ fontSize: 196, fontWeight: 800, letterSpacing: -9, lineHeight: 0.92 }}>Preflight</div>
    <div style={{ fontSize: 56, fontWeight: 700, marginTop: 30, maxWidth: 1300, lineHeight: 1.15 }}>Find it, fix it, prove it, keep it fixed.</div>
    <div style={{ fontSize: 38, fontWeight: 500, marginTop: 44 }}>{p.repoUrl}</div>
  </Placard>
);

export const XCut: React.FC<ExplainerProps> = (p) => {
  let at = OPEN;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence from={0} durationInFrames={OPEN} name="open"><Open p={p} next={SHOTS[0]} /></Sequence>
      {SHOTS.map((s, i) => {
        const from = at, d = shotFrames(s); at += d;
        // The first shot is already on screen at the end of the reveal, so it starts its clip REVEAL frames early.
        return (
          <Sequence key={s.file} from={i === 0 ? from - REVEAL : from} durationInFrames={i === 0 ? d + REVEAL : d} name={s.vo}>
            <Footage s={s} frames={i === 0 ? d + REVEAL : d} zoom={i === 0} />
            <Sequence from={i === 0 ? REVEAL : 0}><Tape {...s} /><Audio src={staticFile(`vo/${s.vo}.mp3`)} /></Sequence>
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO} name="outro"><Outro p={p} /><Sequence from={8}><Audio src={staticFile("vo/pd-outro.mp3")} /></Sequence></Sequence>
    </AbsoluteFill>
  );
};
