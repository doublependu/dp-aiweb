// Everything you hear is synthesised at runtime — no audio files, so the
// project stays one clone away from running.

let actx = null;
let master = null;
let soundOn = true;

// 0 in daylight, 1 after dark. The field does not sound the same at night, and
// getting that wrong is more noticeable than getting the light wrong.
let night = 0;
let windGain = null;

export function setNight(n) {
  night = n;
  if (windGain && actx) {
    // The air goes still after sunset. Ramped rather than set, or the change
    // lands as an audible step every frame.
    windGain.gain.setTargetAtTime(0.34 - 0.12 * night, actx.currentTime, 1.5);
  }
}

// Three sounds that are levels rather than events: the rain, the low note
// that comes up when something with a temper has noticed you, and bees. Each
// is one voice running the whole time at a gain of nought, ramped rather than
// switched so it can never click.
let rainGain = null;
let dangerGain = null, dangerOsc = null;
let buzzGain = null, buzzOsc = null;

// Must be called from a user gesture; browsers will not start a context otherwise.
export function initAudio() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { soundOn = false; return; }
  actx = new AC();

  master = actx.createGain();
  master.gain.value = 0.5;
  master.connect(actx.destination);

  // wind bed: brown-ish noise through a drifting lowpass
  const len = actx.sampleRate * 4;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let n = 0; n < len; n++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[n] = last * 4;
  }
  const noise = actx.createBufferSource();
  noise.buffer = buf; noise.loop = true;

  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 460;

  windGain = actx.createGain(); windGain.gain.value = 0.34;
  noise.connect(lp); lp.connect(windGain); windGain.connect(master);
  noise.start();

  const lfo = actx.createOscillator(); lfo.frequency.value = 0.055;
  const lfoAmt = actx.createGain(); lfoAmt.gain.value = 240;
  lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency);
  lfo.start();

  buildRain();
  buildDanger();
  buildBuzz();

  bird(); insect(); cricket(); owl();
}

// Rain is two bands of the same hiss: the near drops, bright and close, and
// the far body of it, dull. One alone sounds like radio static.
function buildRain() {
  const len = actx.sampleRate * 3;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let n = 0; n < len; n++) d[n] = Math.random() * 2 - 1;

  const src = actx.createBufferSource();
  src.buffer = buf; src.loop = true;

  const hp = actx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 900;
  const lp = actx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 5200;
  const body = actx.createBiquadFilter();
  body.type = 'bandpass'; body.frequency.value = 480; body.Q.value = 0.6;

  rainGain = actx.createGain();
  rainGain.gain.value = 0;
  src.connect(hp); hp.connect(lp); lp.connect(rainGain);
  src.connect(body); body.connect(rainGain);
  rainGain.connect(master);
  src.start();
}

// Two low notes a couple of hertz apart. The beating between them is the
// unease; neither on its own does anything at all.
function buildDanger() {
  dangerGain = actx.createGain();
  dangerGain.gain.value = 0;
  dangerGain.connect(master);

  dangerOsc = [];
  const freqs = [58, 60.7, 87];
  for (let i = 0; i < freqs.length; i++) {
    const o = actx.createOscillator();
    o.type = i === 2 ? 'triangle' : 'sine';
    o.frequency.value = freqs[i];
    const g = actx.createGain();
    g.gain.value = i === 2 ? 0.35 : 1;
    o.connect(g); g.connect(dangerGain);
    o.start();
    dangerOsc.push(o);
  }
}

function buildBuzz() {
  buzzGain = actx.createGain();
  buzzGain.gain.value = 0;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 620; bp.Q.value = 2.2;
  buzzGain.connect(bp); bp.connect(master);

  buzzOsc = actx.createOscillator();
  buzzOsc.type = 'sawtooth';
  buzzOsc.frequency.value = 196;
  buzzOsc.connect(buzzGain);
  buzzOsc.start();

  // Bees are never quite on a pitch. The wobble is most of what says insect
  // rather than engine.
  const vib = actx.createOscillator();
  vib.type = 'sine';
  vib.frequency.value = 5.4;
  const amt = actx.createGain();
  amt.gain.value = 22;
  vib.connect(amt); amt.connect(buzzOsc.frequency);
  vib.start();
}

// These three are called every frame. Scheduling a ramp sixty times a second
// piles up events for no audible gain, so each only speaks when it has
// something new to say.
let lastRain = -1, lastDanger = -1, lastBuzz = -1;

export function setRain(level) {
  if (!rainGain || !actx || Math.abs(level - lastRain) < 0.01) return;
  lastRain = level;
  rainGain.gain.setTargetAtTime(0.16 * level, actx.currentTime, 1.2);
}

export function setDanger(level) {
  if (!dangerGain || !actx || Math.abs(level - lastDanger) < 0.01) return;
  lastDanger = level;
  dangerGain.gain.setTargetAtTime(0.055 * level * level, actx.currentTime, 0.35);
  // It sags as it comes up, which reads as something getting closer rather
  // than as a note being played.
  dangerOsc[0].frequency.setTargetAtTime(58 - 6 * level, actx.currentTime, 0.5);
}

export function setBuzz(level) {
  if (!buzzGain || !actx || Math.abs(level - lastBuzz) < 0.01) return;
  lastBuzz = level;
  buzzGain.gain.setTargetAtTime(0.05 * level, actx.currentTime, 0.25);
  buzzOsc.frequency.setTargetAtTime(196 + 60 * level, actx.currentTime, 0.4);
}

// =============================================================
// THINGS ALIVE
// =============================================================
// One-shots, thrown by critters.js. Everything is quieter with distance and
// nothing carries past about twenty-five metres, so an animal you cannot see
// is an animal you can only just hear.
function reach(dist, over) {
  return Math.max(0, 1 - dist / (over || 25));
}

function noise(dur, freq, q, vol, pan) {
  if (!actx || !soundOn || vol <= 0.0008) return;
  const n = (actx.sampleRate * dur) | 0;
  const b = actx.createBuffer(1, n, actx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const env = 1 - i / n;
    d[i] = (Math.random() * 2 - 1) * env * env;
  }
  const src = actx.createBufferSource(); src.buffer = b;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
  const g = actx.createGain(); g.gain.value = vol;
  src.connect(bp); bp.connect(g);
  if (actx.createStereoPanner) {
    const sp = actx.createStereoPanner();
    sp.pan.value = pan || 0;
    g.connect(sp); sp.connect(master);
  } else {
    g.connect(master);
  }
  src.start();
}

// A tone that slides, which is what most animal calls actually are.
function slide(f0, f1, dur, type, vol, pan) {
  if (!actx || !soundOn || vol <= 0.0008) return;
  const osc = actx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(f0, actx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), actx.currentTime + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, actx.currentTime);
  g.gain.linearRampToValueAtTime(vol, actx.currentTime + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  osc.connect(g);
  if (actx.createStereoPanner) {
    const sp = actx.createStereoPanner();
    sp.pan.value = pan || 0;
    g.connect(sp); sp.connect(master);
  } else {
    g.connect(master);
  }
  osc.start();
  osc.stop(actx.currentTime + dur + 0.05);
}

export function critterVoice(kind, dist) {
  if (!actx || !soundOn) return;
  const v = reach(dist);
  if (v <= 0.01) return;
  const pan = Math.random() * 1.2 - 0.6;

  if (kind === 'deer') {
    // A snort: air, not voice.
    noise(0.16, 320, 1.1, 0.075 * v, pan);
    setTimeout(function () { noise(0.10, 260, 1.4, 0.045 * v, pan); }, 150);
  } else if (kind === 'turkey') {
    const n = 5 + ((Math.random() * 4) | 0);
    for (let i = 0; i < n; i++) {
      setTimeout(function () {
        slide(520 + Math.random() * 280, 300 + Math.random() * 120, 0.075,
              'sawtooth', 0.030 * v, pan);
      }, i * 72);
    }
  } else if (kind === 'chitter') {
    for (let i = 0; i < 4; i++) {
      setTimeout(function () {
        tone(1500 + Math.random() * 700, 0.035, 'triangle', 0.026 * v, pan);
      }, i * 55);
    }
  } else if (kind === 'crow') {
    const caws = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < caws; i++) {
      setTimeout(function () {
        slide(760, 430, 0.24, 'sawtooth', 0.042 * v, pan);
        noise(0.22, 1400, 0.9, 0.030 * v, pan);
      }, i * 340);
    }
  } else if (kind === 'bolt') {
    // Something heavy leaving through standing corn. Louder than a footstep
    // and gone before you can turn round.
    for (let i = 0; i < 5; i++) {
      setTimeout(function () {
        noise(0.14, 1800 + Math.random() * 1800, 0.6, 0.075 * v, pan);
      }, i * 85 + Math.random() * 40);
    }
  } else if (kind === 'rattle') {
    for (let i = 0; i < 14; i++) {
      setTimeout(function () {
        noise(0.035, 5200 + Math.random() * 2600, 1.6, 0.055 * reach(dist, 14), pan);
      }, i * 42);
    }
  } else if (kind === 'buzzUp') {
    slide(220, 340, 0.5, 'sawtooth', 0.020 * reach(dist, 12), pan);
  } else if (kind === 'drip') {
    // Rising, not falling. A falling pitch is a bloop; a rising one is water.
    slide(760, 1580, 0.11, 'sine', 0.055 * reach(dist, 14), pan);
    setTimeout(function () {
      slide(1100, 1900, 0.07, 'sine', 0.022 * reach(dist, 14), pan);
    }, 90);
  }
}

export function resumeAudio() {
  if (actx && actx.state === 'suspended') actx.resume();
}

export function toggleSound() {
  soundOn = !soundOn;
  if (master) master.gain.value = soundOn ? 0.5 : 0;
  return soundOn;
}

function tone(freq, dur, type, vol, pan) {
  if (!actx || !soundOn) return;
  const osc = actx.createOscillator();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, actx.currentTime);
  g.gain.linearRampToValueAtTime(vol, actx.currentTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
  osc.connect(g);
  if (actx.createStereoPanner) {
    const sp = actx.createStereoPanner();
    sp.pan.value = pan || 0;
    g.connect(sp); sp.connect(master);
  } else {
    g.connect(master);
  }
  osc.start();
  osc.stop(actx.currentTime + dur + 0.05);
}

// These four reschedule themselves for as long as the page lives; the
// irregular gaps are what stop the field sounding like a loop. Each is gated
// on the time of day rather than switched, so dusk is a handover and not a
// cut: the last birds are still going while the first crickets start.
function bird() {
  const vol = 0.05 * (1 - night);
  if (soundOn && vol > 0.004) {
    const notes = 2 + ((Math.random() * 3) | 0);
    const base = 1750 + Math.random() * 1300;
    const pan = Math.random() * 2 - 1;
    for (let b = 0; b < notes; b++) {
      setTimeout(function () {
        tone(base + Math.random() * 340 - 120, 0.13, 'sine', vol, pan);
      }, b * 135);
    }
  }
  setTimeout(bird, 2400 + Math.random() * 5200);
}

function insect() {
  const vol = 0.016 * (1 - night * 0.85);
  if (soundOn && vol > 0.002) {
    tone(4100 + Math.random() * 900, 0.055, 'triangle', vol, Math.random() * 2 - 1);
  }
  setTimeout(insect, 110 + Math.random() * 300);
}

// A cricket is a short run of pulses, not one tone. Three or four of them,
// close together, is the difference between a cricket and a beep.
function cricket() {
  const vol = 0.019 * night;
  if (soundOn && vol > 0.002) {
    const pulses = 3 + ((Math.random() * 2) | 0);
    const base = 2350 + Math.random() * 700;
    const pan = Math.random() * 2 - 1;
    for (let p = 0; p < pulses; p++) {
      setTimeout(function () {
        tone(base, 0.028, 'triangle', vol, pan);
      }, p * 42);
    }
  }
  setTimeout(cricket, 260 + Math.random() * 700);
}

// Twice, low, a long way off, and rarely.
function owl() {
  const vol = 0.035 * night;
  if (soundOn && vol > 0.004) {
    const base = 360 + Math.random() * 60;
    const pan = Math.random() * 1.4 - 0.7;
    tone(base, 0.42, 'sine', vol, pan);
    setTimeout(function () { tone(base * 0.92, 0.55, 'sine', vol * 0.85, pan); }, 620);
  }
  setTimeout(owl, 17000 + Math.random() * 34000);
}

export function chime() {
  tone(1350 + Math.random() * 520, 0.65, 'sine', 0.085, 0);
}

export function rustle() {
  if (!actx || !soundOn) return;
  const dur = 0.2;
  const b = actx.createBuffer(1, (actx.sampleRate * dur) | 0, actx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const env = 1 - i / d.length;
    d[i] = (Math.random() * 2 - 1) * env * env;
  }
  const src = actx.createBufferSource(); src.buffer = b;
  const bp = actx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000 + Math.random() * 1700;
  bp.Q.value = 0.7;
  const g = actx.createGain(); g.gain.value = 0.055;
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start();
}
