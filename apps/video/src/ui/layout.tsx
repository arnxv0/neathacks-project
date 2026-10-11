import { useVideoConfig } from "remotion";

// Width-aware sizing so the 1920-wide scenes also fit the 1080x1080 square (and 9:16) compositions.
// `square` is true for anything narrower than 16:9; `captionBand` reserves the bottom third for burned-in captions.
export type Layout = {
  width: number; height: number; square: boolean; fs: number;
  pad: number; h1: number; hero: number; body: number; small: number; gap: number; captionBand: number;
};

export const useLayout = (): Layout => {
  const { width, height } = useVideoConfig();
  const square = width / height < 1.6;
  const s = Math.min(1, width / 1920);
  const fs = square ? 0.72 : s;
  return {
    width, height, square, fs,
    pad: Math.round((square ? 56 : 90) * (square ? 1 : s)),
    h1: Math.round(64 * fs), hero: Math.round(92 * fs), body: Math.round(30 * fs), small: Math.round(22 * fs),
    gap: Math.round((square ? 28 : 50)), captionBand: square ? Math.round(height * 0.26) : 0,
  };
};
