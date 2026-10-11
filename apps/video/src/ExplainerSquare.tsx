import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { LINES, VO } from "./data/vo";
import { SCENES, FPS } from "./Explainer";
import { Hook } from "./scenes/Hook";
import { Attack } from "./scenes/Attack";
import { Trace } from "./scenes/Trace";
import { Fix } from "./scenes/Fix";
import { Proof } from "./scenes/Proof";
import { Regression } from "./scenes/Regression";
import { Business } from "./scenes/Business";
import { CTA } from "./scenes/CTA";
import { Captions } from "./ui/Captions";
import { useLayout } from "./ui/layout";
import type { ExplainerProps } from "./data/props";

// 1:1 cut of the explainer for feeds: same eight scenes (width-aware via useLayout), the narration burned in as captions
// in the bottom band because feeds autoplay muted. Same VO and timing as PreflightExplainer.
export const SQUARE_TOTAL = SCENES.reduce((n, s) => n + s.frames, 0);
const MUSIC_VOL = 0.03;

const Cross: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 10, frames - 10, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

const SceneArea: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const L = useLayout();
  const { height } = useVideoConfig();
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: height - L.captionBand + 40, overflow: "hidden" }}>{children}</div>;
};

export const ExplainerSquare: React.FC<ExplainerProps> = (p) => {
  let at = 0;
  const parts = [<Hook key="hook" />, <Attack key="attack" />, <Trace key="trace" />, <Fix key="fix" {...p} />, <Proof key="proof" {...p} />, <Regression key="reg" {...p} />, <Business key="biz" {...p} />, <CTA key="cta" {...p} />];
  return (
    <AbsoluteFill style={{ background: "var(--bg)" }}>
      <Audio src={staticFile("music-ambient.mp3")} loop volume={(f) => MUSIC_VOL * Math.min(1, f / 45) * Math.min(1, Math.max(0, (SQUARE_TOTAL - f) / 60))} />
      {SCENES.map((s, i) => {
        const from = at; at += s.frames; const key = `ex-${s.name}`;
        return (
          <Sequence key={s.name} from={from} durationInFrames={s.frames} name={s.name}>
            <Cross frames={s.frames}>
              <SceneArea>{parts[i]}</SceneArea>
              <Captions text={LINES[key]} seconds={VO[key]} />
            </Cross>
            <Audio src={staticFile(`vo/${key}.mp3`)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
export { FPS };
