import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
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
export const SCENES: { name: string; frames: number }[] = [
  { name: "hook", frames: 150 }, { name: "attack", frames: 300 }, { name: "trace", frames: 300 }, { name: "fix", frames: 300 },
  { name: "proof", frames: 330 }, { name: "regression", frames: 240 }, { name: "business", frames: 210 }, { name: "cta", frames: 180 },
];
export const TOTAL = SCENES.reduce((n, s) => n + s.frames, 0);

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
      {SCENES.map((s, i) => { const from = at; at += s.frames; return <Sequence key={s.name} from={from} durationInFrames={s.frames} name={s.name}><Cross frames={s.frames}>{parts[i]}</Cross></Sequence>; })}
    </AbsoluteFill>
  );
};
