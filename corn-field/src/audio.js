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

  bird(); insect(); cricket(); owl();
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
