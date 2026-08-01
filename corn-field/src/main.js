// A Field of Corn — a wander.
//
// Wiring only: the scene, the maze, the corn, the farm outside it, the
// lanterns, the player and the sound each live in their own module. What is
// left here is the small ambient stuff (kernels, fireflies, pollen, the way
// out), the overlay/HUD, and the loop.

import './style.css';
import * as THREE from 'three';
import { FIELD, toWorld, createMaze, openRooms } from './maze.js';
import { createScene, LEGACY_LIGHT_SCALE } from './scene.js';
import { createCorn } from './corn.js';
import { createFarm } from './farm.js';
import { createLanterns } from './lanterns.js';
import { createGarden } from './zen.js';
import { createCritters } from './critters.js';
import { createWeather } from './weather.js';
import { createPlayer } from './player.js';
import {
  initAudio, resumeAudio, toggleSound, setNight, chime, rustle,
  setRain, setDanger, setBuzz, critterVoice
} from './audio.js';

const reduceMotion = window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const maze = createMaze();
const isOpen = maze.isOpen;
const exitPos = maze.exitPos;

const { scene, camera, renderer, maxAniso, daylight } = createScene(isOpen);

const corn = createCorn(isOpen, maxAniso);
scene.add(corn.mesh);

// Shuffled once and shared: kernels take the front of the list, lanterns walk
// it looking for spots far enough apart, fireflies sample it at random.
const rooms = openRooms(isOpen);
rooms.sort(function () { return Math.random() - 0.5; });

const farm = createFarm(maze.startPos, exitPos, maxAniso);
scene.add(farm.group);

const garden = createGarden(maxAniso);
scene.add(garden.group);

const lanterns = createLanterns(isOpen, rooms, maze.startPos, exitPos, [garden.flame]);
scene.add(lanterns.group);

const critters = createCritters(isOpen, maxAniso);
scene.add(critters.group);

// Everything lit by the sun is also shaded by whatever gets in the sun's way,
// so the cloud patch goes on after the world is built and before anything has
// had a chance to compile. The sky's own group is skipped: it is not lit, and
// a cloud cannot shadow the cloud layer it belongs to.
const weather = createWeather(scene);
scene.traverse(function (o) {
  if (o.isMesh && o.material && o.material.isMeshStandardMaterial) weather.patch(o.material);
});

const player = createPlayer({
  camera: camera,
  domElement: renderer.domElement,
  isOpen: isOpen,
  startPos: maze.startPos,
  exitPos: exitPos,
  reduceMotion: reduceMotion,
  obstacles: farm.obstacles.concat(lanterns.obstacles, garden.obstacles),
  onStep: rustle
});

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
// — invisible through the afternoon, fully lit by dark.
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

// The shower schedule is measured in minutes, which is right for wandering
// and wrong for checking that the rain still looks like rain.
window.addEventListener('keydown', function (e) {
  if (e.key === 'r' || e.key === 'R') weather.shower();
});

let started = false;
document.getElementById('enterBtn').addEventListener('click', function () {
  initAudio();
  resumeAudio();
  player.lock();
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

// Said once each, the first time it happens. Observations, not instructions —
// nothing here asks you to do anything about it.
let saidDark = false, saidDawn = false, saidRain = false, saidGarden = false;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  corn.uTime.value = reduceMotion ? 0 : t;
  farm.uTime.value = reduceMotion ? 0 : t;

  // The day only starts turning once you are actually in the corn, but the
  // sky still has to be re-parked on the camera every frame, so this is a
  // zero-length step rather than a skipped one.
  daylight.weather.fogBoost = weather.fogBoost;
  daylight.weather.lightDamp = weather.lightDamp;
  daylight.update(started ? dt : 0, t);

  const night = daylight.night;
  setNight(night);
  farm.update(night);
  lanterns.update(t, night, camera.position);

  // A frame behind the daylight it reads, which nothing can see.
  weather.update(started ? dt : 0, camera.position, daylight.elevation, night, scene.fog.color);
  setRain(weather.state.rain);

  if (started) {
    critters.update(dt, t, camera.position, night, critterVoice);
    setDanger(critters.danger);
    setBuzz(critters.buzz);
    garden.update(dt, t, camera.position, function (dist) { critterVoice('drip', dist); });
  }

  if (started && !saidDark && night > 0.97) {
    saidDark = true;
    toast('the field has gone blue. the lanterns are lit', 5200);
  }
  if (started && saidDark && !saidDawn && night < 0.03 && daylight.elevation > 0) {
    saidDawn = true;
    toast('morning, and the mist is still in the rows', 5200);
  }
  if (started && !saidRain && weather.state.rain > 0.25) {
    saidRain = true;
    toast('rain, a little of it, going through the corn', 5200);
  }
  if (started && !saidGarden && garden.inside(camera.position)) {
    saidGarden = true;
    toast('somebody rakes this. the lines will close over your prints', 6000);
  }

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
    ff.mesh.material.opacity = night;
    ff.mesh.visible = night > 0.01;
  }

  // Pollen belongs to the warm part of the day; after dark what is left is
  // only what catches the moon.
  dust.material.opacity = 0.6 - 0.42 * night;

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
      toast('you found the edge of the field — there is a bench out there, if you want it', 6000);
    }
  }

  if (started) player.update(dt);

  renderer.render(scene, camera);
}

animate();
