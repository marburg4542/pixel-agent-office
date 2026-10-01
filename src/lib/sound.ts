// Chiptune sound effects synthesized with WebAudio — no audio files to download.
// Volume and on/off come from the user's settings (store calls configure()).

export type Sfx = 'click' | 'type' | 'done' | 'review' | 'paper' | 'note' | 'error' | 'hire' | 'approve';

let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.6;

export function configureSound(opts: { enabled: boolean; volume: number }) {
  enabled = opts.enabled;
  volume = opts.volume;
}

function audio(): AudioContext | null {
  if (!enabled || volume <= 0) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain * volume, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(a.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise(a: AudioContext, start: number, dur: number, gain: number) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const filter = a.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  const g = a.createGain();
  g.gain.value = gain * volume;
  src.buffer = buf;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(start);
}

let lastType = 0;

export function play(s: Sfx) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  switch (s) {
    case 'click':
      tone(a, 880, t, 0.05, 'square', 0.05);
      break;
    case 'type':
      // Throttled — several agents typing at once shouldn't become a buzz.
      if (t - lastType < 0.09) return;
      lastType = t;
      noise(a, t, 0.018, 0.03);
      break;
    case 'done':
      [523, 659, 784].forEach((f, i) => tone(a, f, t + i * 0.07, 0.12, 'square', 0.07));
      break;
    case 'approve':
      [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.08, 0.16, 'square', 0.07));
      break;
    case 'review':
      tone(a, 988, t, 0.1, 'triangle', 0.12);
      tone(a, 1319, t + 0.11, 0.22, 'triangle', 0.12);
      break;
    case 'paper':
      tone(a, 300, t, 0.18, 'sawtooth', 0.03, 900);
      break;
    case 'note':
      tone(a, 660, t, 0.06, 'square', 0.05);
      tone(a, 990, t + 0.06, 0.08, 'square', 0.05);
      break;
    case 'hire':
      [392, 523, 659].forEach((f, i) => tone(a, f, t + i * 0.09, 0.14, 'triangle', 0.1));
      break;
    case 'error':
      tone(a, 220, t, 0.14, 'square', 0.06, 160);
      break;
  }
}
