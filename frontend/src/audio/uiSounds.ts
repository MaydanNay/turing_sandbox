export type UiSoundKind =
  | 'table'
  | 'character'
  | 'card'
  | 'cardHover'
  | 'cardReveal'
  | 'chatSend'
  | 'chatReceive';

const VOLUME = 0.28;
const CARD_HOVER_COOLDOWN_MS = 75;

let audioCtx: AudioContext | null = null;
let lastCardHoverAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  const Ctx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;

  if (!audioCtx) {
    audioCtx = new Ctx();
  }

  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }

  return audioCtx;
}

function gainEnvelope(
  ctx: AudioContext,
  destination: AudioNode,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  gain.connect(destination);
  return gain;
}

function playTableSound(ctx: AudioContext, out: AudioNode) {
  const gain = gainEnvelope(ctx, out, VOLUME * 0.9, 0.004, 0.22);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(92, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(58, ctx.currentTime + 0.12);
  osc.connect(gain);
  osc.start();
  osc.stop(ctx.currentTime + 0.24);

  const thump = gainEnvelope(ctx, out, VOLUME * 0.35, 0.002, 0.08);
  const thumpOsc = ctx.createOscillator();
  thumpOsc.type = 'triangle';
  thumpOsc.frequency.setValueAtTime(180, ctx.currentTime);
  thumpOsc.connect(thump);
  thumpOsc.start();
  thumpOsc.stop(ctx.currentTime + 0.1);
}

function playCharacterSound(ctx: AudioContext, out: AudioNode) {
  const gain = gainEnvelope(ctx, out, VOLUME * 0.55, 0.003, 0.14);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.045);
  osc.connect(gain);
  osc.start();
  osc.stop(ctx.currentTime + 0.16);

  const echo = gainEnvelope(ctx, out, VOLUME * 0.22, 0.004, 0.1);
  const echoOsc = ctx.createOscillator();
  echoOsc.type = 'triangle';
  echoOsc.frequency.setValueAtTime(1040, ctx.currentTime + 0.03);
  echoOsc.connect(echo);
  echoOsc.start(ctx.currentTime + 0.03);
  echoOsc.stop(ctx.currentTime + 0.16);
}

function playCardSound(ctx: AudioContext, out: AudioNode) {
  const bufferSize = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2400, ctx.currentTime);
  filter.Q.setValueAtTime(0.8, ctx.currentTime);

  const gain = gainEnvelope(ctx, out, VOLUME * 0.65, 0.001, 0.05);
  source.connect(filter);
  filter.connect(gain);
  source.start();
  source.stop(ctx.currentTime + 0.07);

  const click = gainEnvelope(ctx, out, VOLUME * 0.25, 0.001, 0.025);
  const clickOsc = ctx.createOscillator();
  clickOsc.type = 'square';
  clickOsc.frequency.setValueAtTime(320, ctx.currentTime);
  clickOsc.connect(click);
  clickOsc.start();
  clickOsc.stop(ctx.currentTime + 0.03);
}

function playCardHoverSound(ctx: AudioContext, out: AudioNode) {
  const now = ctx.currentTime;

  const rustle = (start: number, duration: number, peak: number, fromHz: number, toHz: number) => {
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t * 0.35);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(fromHz, now + start);
    filter.frequency.exponentialRampToValueAtTime(toHz, now + start + duration * 0.85);
    filter.Q.setValueAtTime(1.1, now + start);

    const gain = gainEnvelope(ctx, out, peak, 0.002, duration);
    source.connect(filter);
    filter.connect(gain);
    source.start(now + start);
    source.stop(now + start + duration + 0.02);
  };

  rustle(0, 0.055, VOLUME * 0.42, 1200, 3400);
  rustle(0.028, 0.04, VOLUME * 0.22, 900, 2200);

  const crease = gainEnvelope(ctx, out, VOLUME * 0.12, 0.001, 0.018);
  const creaseOsc = ctx.createOscillator();
  creaseOsc.type = 'triangle';
  creaseOsc.frequency.setValueAtTime(420, now);
  creaseOsc.frequency.exponentialRampToValueAtTime(260, now + 0.02);
  creaseOsc.connect(crease);
  creaseOsc.start(now);
  creaseOsc.stop(now + 0.025);
}

function playCardRevealSound(ctx: AudioContext, out: AudioNode) {
  const gain = gainEnvelope(ctx, out, VOLUME * 0.75, 0.002, 0.18);
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
  osc.connect(gain);
  osc.start();
  osc.stop(ctx.currentTime + 0.2);

  const bufferSize = Math.floor(ctx.sampleRate * 0.1);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const t = i / bufferSize;
    data[i] = (Math.random() * 2 - 1) * (1 - t) * (1 - t);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(900, ctx.currentTime);
  const rustle = gainEnvelope(ctx, out, VOLUME * 0.4, 0.004, 0.12);
  source.connect(filter);
  filter.connect(rustle);
  source.start(ctx.currentTime + 0.02);
  source.stop(ctx.currentTime + 0.16);
}

function playChatSendSound(ctx: AudioContext, out: AudioNode) {
  const now = ctx.currentTime;
  const gain = gainEnvelope(ctx, out, VOLUME * 0.38, 0.002, 0.09);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(640, now);
  osc.frequency.exponentialRampToValueAtTime(920, now + 0.04);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.1);
}

function playChatReceiveSound(ctx: AudioContext, out: AudioNode) {
  const now = ctx.currentTime;

  const ping = gainEnvelope(ctx, out, VOLUME * 0.42, 0.003, 0.11);
  const pingOsc = ctx.createOscillator();
  pingOsc.type = 'sine';
  pingOsc.frequency.setValueAtTime(880, now);
  pingOsc.frequency.exponentialRampToValueAtTime(1180, now + 0.05);
  pingOsc.connect(ping);
  pingOsc.start(now);
  pingOsc.stop(now + 0.14);

  const echo = gainEnvelope(ctx, out, VOLUME * 0.2, 0.004, 0.12);
  const echoOsc = ctx.createOscillator();
  echoOsc.type = 'triangle';
  echoOsc.frequency.setValueAtTime(1320, now + 0.06);
  echoOsc.connect(echo);
  echoOsc.start(now + 0.06);
  echoOsc.stop(now + 0.2);
}

const PLAYERS: Record<UiSoundKind, (ctx: AudioContext, out: AudioNode) => void> = {
  table: playTableSound,
  character: playCharacterSound,
  card: playCardSound,
  cardHover: playCardHoverSound,
  cardReveal: playCardRevealSound,
  chatSend: playChatSendSound,
  chatReceive: playChatReceiveSound,
};

/** Звук наведения на карту — с коротким cooldown, чтобы не «дребезжало». */
export function playCardHoverSoundEffect(): void {
  const now = Date.now();
  if (now - lastCardHoverAt < CARD_HOVER_COOLDOWN_MS) return;
  lastCardHoverAt = now;
  playUiSound('cardHover');
}

/** Короткий UI-звук по типу клика (Web Audio, без файлов). */
export function playUiSound(kind: UiSoundKind): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    PLAYERS[kind](ctx, ctx.destination);
  } catch {
    /* звук необязателен */
  }
}
