"""Original ambient pad for background music: slow chord progression, detuned sines, soft noise air. No samples, no licenses."""
import numpy as np, soundfile as sf, sys
sr, total = 44100, 190.0   # seconds
t = np.arange(int(sr * total)) / sr
def note(f): return 440.0 * 2 ** ((f - 69) / 12)
# progression in D minor-ish, 16 s per chord: Dm9, Bbmaj7, F add9, C add9 (MIDI numbers)
chords = [[50, 57, 60, 64, 69], [46, 53, 57, 60, 65], [41, 48, 53, 57, 60], [48, 55, 59, 64, 67]]
bar = 16.0
out = np.zeros_like(t)
rng = np.random.default_rng(7)
for i, ch in enumerate(chords * int(np.ceil(total / bar / len(chords)))):
    start = i * bar
    if start >= total: break
    seg = (t >= start) & (t < start + bar + 4)       # 4 s overlap for crossfade
    tt = t[seg] - start
    env = np.clip(tt / 4, 0, 1) * np.clip((bar + 4 - tt) / 4, 0, 1)   # 4 s in/out
    layer = np.zeros_like(tt)
    for m in ch:
        f = note(m)
        for det, amp in ((0.0, 1.0), (0.6, 0.6), (-0.6, 0.6)):          # gentle detune = chorus
            ph = rng.uniform(0, 2 * np.pi)
            layer += amp * np.sin(2 * np.pi * (f * 2 ** (det / 1200)) * tt + ph) / (f / 110) ** 0.6
        layer += 0.35 * np.sin(2 * np.pi * f * 2 * tt) / (f / 110) ** 0.6   # soft octave
    out[seg] += layer * env
# slow filtered noise "air"
noise = rng.normal(0, 1, len(t))
k = int(sr * 0.012); kern = np.hanning(k); kern /= kern.sum()
air = np.convolve(noise, kern, mode="same")
out += 0.08 * air * (0.6 + 0.4 * np.sin(2 * np.pi * t / 23))
# slow tremolo + master fade
out *= 0.85 + 0.15 * np.sin(2 * np.pi * t / 11)
out *= np.clip(t / 6, 0, 1) * np.clip((total - t) / 8, 0, 1)
out = out / np.max(np.abs(out)) * 0.7
sf.write(sys.argv[1], out.astype(np.float32), sr)
print("wrote", sys.argv[1], total, "s")
