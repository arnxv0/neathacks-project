import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { useLayout } from "./layout";

// Burned-in captions for muted autoplay: the narration is split into sentences and each one is shown for a share of the
// voice-over duration proportional to its length. Sits in the bottom band `useLayout().captionBand` (or a fixed band on 16:9).
export const Captions: React.FC<{ text: string; seconds: number; band?: number; size?: number }> = ({ text, seconds, band, size }) => {
  const f = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const L = useLayout();
  const h = band ?? (L.captionBand || Math.round(L.height * 0.2));
  const fontSize = size ?? (L.portrait ? 46 : L.square ? 34 : Math.round(40 * Math.min(1, width / 1920)));
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const total = sentences.reduce((n, s) => n + s.length, 0);
  // the mp3 has 0.35 s of lead-in silence; the words start after it
  const start = 0.35 * fps;
  let at = start;
  const spans = sentences.map((s) => { const d = ((seconds - 0.7) * fps * s.length) / total; const r = { s, from: at, to: at + d }; at += d; return r; });
  const cur = spans.find((x) => f >= x.from && f < x.to) ?? (f < start ? spans[0] : spans[spans.length - 1]);
  const o = interpolate(f, [cur.from - 2, cur.from + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: h, display: "flex", alignItems: "center", justifyContent: "center", padding: `0 ${L.pad}px`, background: "linear-gradient(to top, rgba(15,17,23,.96) 70%, rgba(15,17,23,0))" }}>
      <div style={{ opacity: f < start ? 1 : o, fontSize, lineHeight: 1.3, fontWeight: 600, textAlign: "center", color: "var(--fg)", textShadow: "0 2px 12px rgba(0,0,0,.8)", maxWidth: L.square ? "100%" : 1500 }}>
        {cur.s}
      </div>
    </div>
  );
};
