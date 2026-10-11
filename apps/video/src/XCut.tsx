import React from "react";
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { loadFont } from "@remotion/google-fonts/Geist";
import { VO } from "./data/vo";
import { FPS } from "./ProductDemo";
import type { ExplainerProps } from "./data/props";

// The dashboard's own typeface and background, so captions read as part of the product.
const { fontFamily } = loadFont("normal", { weights: ["400", "500", "600"], subsets: ["latin"] });
const BG = "#0c0f16", FG = "#eef0f4", MUTED = "#a3a9b8";

// zoom: [scale, origin] to push in on the part of the screen the caption talks about, readable on a phone.
type Shot = { file: string; seconds: number; vo: string; line: string; detail: string; zoom?: [number, string]; skip?: number };
const SHOTS: Shot[] = [
  { file: "08-before-after.mp4", seconds: 6.1, vo: "pd-08", line: "23 of 50 attacks got through. After the fixes, none did.", detail: "Five repeat runs agree: 22–23 before, 0–5 after, and a second fix pass closed the rest.",
    zoom: [1.8, "21% 11%"], skip: 1.6 },   // the recording opens on a loading skeleton and a count-up
  { file: "04-fix.mp4", seconds: 11.3, vo: "pd-04", line: "Each root cause gets its own Claude Code fixer.", detail: "This fix failed its first replay and passed on the second try. A person approves every merge.",
    zoom: [1.4, "75% 12%"] },
  { file: "05-replay-proof.mp4", seconds: 8.0, vo: "pd-05", line: "Every fix is replayed 5 times on the attacks that broke it.", detail: "0 of 4 passed before the fix, 20 of 20 after.",
    zoom: [1.5, "30% 18%"] },
  { file: "06-regressions.mp4", seconds: 8.4, vo: "pd-06", line: "A later refactor brought a bug back. Preflight caught it.", detail: "4 regression tests failed, each traced to the same commit." },
];
const shotFrames = (s: Shot) => Math.ceil((Math.max(s.seconds, VO[s.vo]) + 0.6) * FPS);
const OUTRO = Math.ceil((VO["pd-outro"] + 1.4) * FPS);
export const XCUT_TOTAL = SHOTS.reduce((n, s) => n + shotFrames(s), 0) + OUTRO;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const fade = (f: number, d: number) => interpolate(f, [0, 6, d - 6, d], [0, 1, 1, 0], clamp);

const ShotView: React.FC<{ s: Shot; d: number }> = ({ s, d }) => {
  const f = useCurrentFrame();
  const [scale, origin] = s.zoom ?? [1, "50% 50%"];
  // Hold the push-in while the caption is read, then pull back to show the whole screen.
  const z = interpolate(f, [0, d - 75, d - 35], [scale, scale, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: BG, opacity: fade(f, d) }}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <OffthreadVideo src={staticFile(`clips/${s.file}`)} muted startFrom={Math.round((s.skip ?? 0) * FPS)} playbackRate={Math.min(1, s.seconds / (d / FPS))}
          style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z})`, transformOrigin: origin }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(12,15,22,.96) 0%, rgba(12,15,22,.85) 18%, rgba(12,15,22,0) 38%)" }} />
      <div style={{ position: "absolute", left: 96, right: 96, bottom: 72, fontFamily }}>
        <div style={{ color: FG, fontSize: 52, fontWeight: 600, letterSpacing: -1, lineHeight: 1.15 }}>{s.line}</div>
        <div style={{ color: MUTED, fontSize: 32, fontWeight: 400, marginTop: 12, lineHeight: 1.35 }}>{s.detail}</div>
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{ p: ExplainerProps; d: number }> = ({ p, d }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: BG, fontFamily, justifyContent: "center", paddingLeft: 160, opacity: fade(f, d) }}>
      <div style={{ color: FG, fontSize: 112, fontWeight: 600, letterSpacing: -4 }}>Preflight</div>
      <div style={{ color: FG, fontSize: 44, fontWeight: 400, marginTop: 16 }}>Crash test your AI agent before launch, then fix what breaks.</div>
      <div style={{ color: MUTED, fontSize: 32, marginTop: 56 }}>{p.repoUrl}</div>
    </AbsoluteFill>
  );
};

export const XCut: React.FC<ExplainerProps> = (p) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: BG }}>
      {SHOTS.map((s) => {
        const from = at, d = shotFrames(s); at += d;
        return (
          <Sequence key={s.file} from={from} durationInFrames={d} name={s.vo}>
            <ShotView s={s} d={d} />
            <Audio src={staticFile(`vo/${s.vo}.mp3`)} />
          </Sequence>
        );
      })}
      <Sequence from={at} durationInFrames={OUTRO} name="outro"><Outro p={p} d={OUTRO} /><Sequence from={8}><Audio src={staticFile("vo/pd-outro.mp3")} /></Sequence></Sequence>
    </AbsoluteFill>
  );
};
