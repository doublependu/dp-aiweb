// A Field of Corn — a wander.
//
// Wiring only: the scene, the maze, the corn, the player and the sound each
// live in their own module. What is left here is the small ambient stuff
// (kernels, fireflies, pollen, the way out), the overlay/HUD, and the loop.

import './style.css';
import * as THREE from 'three';
import { FIELD, toWorld, createMaze, openRooms } from './maze.js';
import { createScene, LEGACY_LIGHT_SCALE } from './scene.js';
import { createCorn } from './corn.js';
import { createPlayer } from './player.js';
import { initAudio, resumeAudio, toggleSound, chime, rustle } from './audio.js';

const reduceMotion = window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const maze = createMaze();
const isOpen = maze.isOpen;
const exitPos = maze.exitPos;

const { scene, camera, renderer, sky, maxAniso, daylight } = createScene(isOpen);

const corn = createCorn(isOpen, maxAniso);
scene.add(corn.mesh);

const player = createPlayer({
  camera: camera,
  domElement: renderer.domElement,
  isOpen: isOpen,
  startPos: maze.startPos,
  exitPos: exitPos,
  reduceMotion: reduceMotion,
  onStep: rustle
});

// Shuffled once and shared: kernels take the front of the list, fireflies
// sample it at random.
const rooms = openRooms(isOpen);
rooms.sort(function () { return Math.random() - 0.5; });

// =============================================================
// KERNELS
// =============================================================
const kernelGeo = new THREE.SphereGeometry(0.13, 10, 8);
const kernelMat = new THREE.MeshStandardMaterial({
  color: 0xffd863, emissive: 0xd39c1c, emissiveIntensity: 0.85, roughness: 0.35
});
const kernels = [];
const WANT = Math.min(34, rooms.length);
for (let ki = 0; ki < WANT; ki++) {
  const rc = rooms[ki];
  if (rc[0] === 1 && rc[1] === maze.entranceRow * 2 + 1) continue;
  const wpos = toWorld(rc[0], rc[1]);
  const m = new THREE.Mesh(kernelGeo, kernelMat);
  m.position.set(wpos.x + (Math.random() - 0.5) * 1.3, 0.34, wpos.z + (Math.random() - 0.5) * 1.3);
  scene.add(m);
  kernels.push({ mesh: m, phase: Math.random() * 6.28, done: false });
}
let found = 0;

// =============================================================
// THE WAY OUT
// =============================================================
// The one thing that cannot be ported exactly. r128's non-physical point
// lights faded as (1 - d/distance)^2; r185 only has inverse-square, so at the
// original decay of 2 the exit would be three times too dim halfway down the
// corridor. Decay 1 plus this gain tracks the old curve to within about half a
// stop everywhere you can actually stand — turn the gain if it reads wrong.
const EXIT_FALLOFF_GAIN = 1.78;
const exitLight = new THREE.PointLight(0xffe9ab, 1.8 * LEGACY_LIGHT_SCALE * EXIT_FALLOFF_GAIN, 16, 1);
exitLight.position.set(exitPos.x, 1.5, exitPos.z);
scene.add(exitLight);

const exitPillar = new THREE.Mesh(
  new THREE.CylinderGeometry(0.10, 0.10, 3.4, 8),
  new THREE.MeshBasicMaterial({
    color: 0xfff3cc, transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  })
);
exitPillar.position.set(exitPos.x, 1.7, exitPos.z);
scene.add(exitPillar);
let exitSeen = false;

// =============================================================
// FIREFLIES
// =============================================================
// They are out there all along, but only start showing once the light drops
// — invisible through the afternoon, fully lit by dusk.
const fireflies = [];
const ffGeo = new THREE.SphereGeometry(0.05, 6, 6);
for (let fi = 0; fi < 20; fi++) {
  const fr = rooms[(Math.random() * rooms.length) | 0];
  const fw = toWorld(fr[0], fr[1]);
  const fm = new THREE.Mesh(ffGeo, new THREE.MeshBasicMaterial({
    color: 0xfff3b8, fog: false, transparent: true, opacity: 0
  }));
  fm.position.set(fw.x, 1.0, fw.z);
  scene.add(fm);
  fireflies.push({
    mesh: fm, cx: fw.x, cz: fw.z, cy: 0.85 + Math.random() * 0.7,
    r1: 0.7 + Math.random() * 1.0, r2: 0.6 + Math.random() * 0.9,
    speed: 0.22 + Math.random() * 0.26, phase: Math.random() * 6.28,
    bob: 0.28 + Math.random() * 0.3
  });
}

// =============================================================
// POLLEN
// =============================================================
const DUST = 550;
const dustGeo = new THREE.BufferGeometry();
const dPos = new Float32Array(DUST * 3);
const dRise = new Float32Array(DUST);
for (let di = 0; di < DUST; di++) {
  dPos[di * 3] = (Math.random() - 0.5) * FIELD;
  dPos[di * 3 + 1] = Math.random() * 4.2;
  dPos[di * 3 + 2] = (Math.random() - 0.5) * FIELD;
  dRise[di] = 0.04 + Math.random() * 0.10;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));

const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  size: 0.085, map: makeDustTexture(), transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, opacity: 0.6
}));
scene.add(dust);

function makeDustTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,244,206,0.95)');
  rg.addColorStop(1, 'rgba(255,244,206,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

// =============================================================
// UI
// =============================================================
let toastTimer = 0;
function toast(msg, ms) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.style.opacity = '0'; }, ms || 2800);
}

document.getElementById('soundToggle').addEventListener('click', function () {
  const on = toggleSound();
  this.innerHTML = on ? '&#128266; sound on' : '&#128264; sound off';
});

let started = false;
document.getElementById('enterBtn').addEventListener('click', function () {
  initAudio();
  resumeAudio();
  const ov = document.getElementById('overlay');
  ov.classList.add('fadeOut');
  setTimeout(function () { ov.style.display = 'none'; }, 1700);
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('soundToggle').style.display = 'block';
  started = true;
  toast('the corn closes in behind you…', 3600);
});

// =============================================================
// LOOP
// =============================================================
const clock = new THREE.Clock();

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  corn.uTime.value = reduceMotion ? 0 : t;

  // The afternoon only starts running down once you are actually in the corn.
  if (started) daylight.update(dt);

  // Held back to the second half of the cycle so the fireflies arrive with the
  // dark rather than alongside it.
  const ffGlow = smoothstep(0.45, 1.0, daylight.darkness);

  for (let f = 0; f < fireflies.length; f++) {
    const ff = fireflies[f];
    const a = t * ff.speed + ff.phase;
    ff.mesh.position.set(
      ff.cx + Math.sin(a) * ff.r1,
      ff.cy + Math.sin(a * 1.7) * ff.bob,
      ff.cz + Math.cos(a * 0.83) * ff.r2
    );
    const flick = 0.5 + 0.5 * Math.sin(t * 2.6 + ff.phase * 5);
    ff.mesh.material.color.setRGB(1, 0.93, 0.55 + flick * 0.25);
    ff.mesh.scale.setScalar(0.6 + flick * 0.7);
    ff.mesh.material.opacity = ffGlow;
    ff.mesh.visible = ffGlow > 0.01;
  }

  const dp = dust.geometry.attributes.position.array;
  for (let u = 0; u < DUST; u++) {
    dp[u * 3 + 1] += dRise[u] * dt;
    dp[u * 3] += Math.sin(t * 0.28 + u) * 0.0035;
    if (dp[u * 3 + 1] > 4.4) dp[u * 3 + 1] = 0;
  }
  dust.geometry.attributes.position.needsUpdate = true;

  for (let k = 0; k < kernels.length; k++) {
    const kn = kernels[k];
    if (kn.done) continue;
    kn.mesh.position.y = 0.30 + Math.sin(t * 1.4 + kn.phase) * 0.055;
    kn.mesh.rotation.y = t * 0.7;
    const ddx = camera.position.x - kn.mesh.position.x;
    const ddz = camera.position.z - kn.mesh.position.z;
    if (started && ddx * ddx + ddz * ddz < 0.28) {
      kn.done = true;
      scene.remove(kn.mesh);
      found++;
      document.getElementById('kernelCount').textContent = 'kernels found: ' + found;
      chime();
    }
  }

  exitPillar.material.opacity = 0.30 + Math.sin(t * 1.8) * 0.14;
  exitLight.intensity = (1.55 + Math.sin(t * 1.8) * 0.35) * LEGACY_LIGHT_SCALE * EXIT_FALLOFF_GAIN;
  if (started && !exitSeen) {
    const ex = camera.position.x - exitPos.x, ez = camera.position.z - exitPos.z;
    if (ex * ex + ez * ez < 5.5) {
      exitSeen = true;
      toast('you found the edge of the field — stay a while, or wander back in', 6000);
    }
  }

  if (started) player.update(dt);

  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

animate();
