// Minimal mechanical ticks via Web Audio. Off by default; respects the sound toggle.
let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return ctx;
}

function blip(freq: number, dur: number, type: OscillatorType = "square", gain = 0.04) {
  try {
    const a = ac();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(a.destination);
    const t = a.currentTime;
    o.start(t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.stop(t + dur);
  } catch {
    /* ignore */
  }
}

export const sfx = {
  tick: () => blip(880, 0.03, "square", 0.025),
  key: () => blip(1320, 0.015, "square", 0.012),
  submit: () => blip(440, 0.06, "sawtooth", 0.03),
  pass: () => {
    blip(660, 0.06, "square", 0.03);
    setTimeout(() => blip(990, 0.09, "square", 0.03), 60);
  },
  fail: () => blip(180, 0.12, "sawtooth", 0.04),
  boot: () => {
    blip(220, 0.05, "square", 0.03);
    setTimeout(() => blip(440, 0.05, "square", 0.03), 90);
    setTimeout(() => blip(880, 0.07, "square", 0.03), 180);
  },
};
