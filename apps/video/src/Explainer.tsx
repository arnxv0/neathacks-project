import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { VO } from "./data/vo";
import { Hook } from "./scenes/Hook";
import { Attack } from "./scenes/Attack";
import { Trace } from "./scenes/Trace";
import { Fix } from "./scenes/Fix";
import { Proof } from "./scenes/Proof";
import { Regression } from "./scenes/Regression";
import { Business } from "./scenes/Business";
import { CTA } from "./scenes/CTA";
import type { ExplainerProps } from "./data/props";

export const FPS = 30;
export const SCENES: { name: string; frames: number }[] = [{ name: "hook", frames: Math.max(150, Math.ceil((VO["ex-hook"] + 0.8) * 30)) }, { name: "attack", frames: Math.max(300, Math.ceil((VO["ex-attack"] + 0.8) * 30)) }, { name: "trace", frames: Math.max(300, Math.ceil((VO["ex-trace"] + 0.8) * 30)) }, { name: "fix", frames: Math.max(300, Math.ceil((VO["ex-fix"] + 0.8) * 30)) }, { name: "proof", frames: Math.max(330, Math.ceil((VO["ex-proof"] + 0.8) * 30)) }, { name: "regression", frames: Math.max(240, Math.ceil((VO["ex-regression"] + 0.8) * 30)) }, { name: "business", frames: Math.max(210, Math.ceil((VO["ex-business"] + 0.8) * 30)) }, { name: "cta", frames: Math.max(180, Math.ceil((VO["ex-cta"] + 0.8) * 30)) }];
export const TOTAL = SCENES.reduce((n, s) => n + s.frames, 0);
const MUSIC_VOL = 0.03;
const Music: React.FC<{ total: number }> = ({ total }) => (
  <Audio src={staticFile("music-ambient.mp3")} loop volume={(f) => MUSIC_VOL * Math.min(1, f / 45) * Math.min(1, Math.max(0, (total - f) / 60))} />
);


const Cross: React.FC<{ frames: number; children: React.ReactNode }> = ({ frames, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 10, frames - 10, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Explainer: React.FC<ExplainerProps> = (p) => {
  let at = 0;
  const parts = [<Hook key="hook" />, <Attack key="attack" />, <Trace key="trace" />, <Fix key="fix" {...p} />, <Proof key="proof" {...p} />, <Regression key="reg" {...p} />, <Business key="biz" {...p} />, <CTA key="cta" {...p} />];
  return (
    <AbsoluteFill>
      <Music total={TOTAL} />
      {SCENES.map((s, i) => { const from = at; at += s.frames; return <Sequence key={s.name} from={from} durationInFrames={s.frames} name={s.name}><Cross frames={s.frames}>{parts[i]}</Cross><Audio src={staticFile(`vo/ex-${s.name}.mp3`)} /></Sequence>; })}
    </AbsoluteFill>
  );
};
