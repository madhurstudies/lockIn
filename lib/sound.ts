// Minimal bleeps via Web Audio. Call unlock() inside a click so the browser allows sound later.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, delay: number, len: number) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + len + 0.02);
}

export const unlock = () => void ac();
export const beep = () => tone(880, 0, 0.09);
export const doubleBeep = () => { tone(1320, 0, 0.08); tone(1320, 0.2, 0.08); };
