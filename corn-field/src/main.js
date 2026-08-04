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
import { createPortals } from './portals.js';
import { createPlayer } from './player.js';
import { mulberry32, randomSeed } from './rng.js';
import { load as loadField, save as saveField, clear as clearField } from './save.js';
import {
  initAudio, resumeAudio, toggleSound, setNight, chime,
  setRain, setDanger, setBuzz, setPortal, portalEnter, critterVoice
} from './audio.js';

const reduceMotion = window.matchMedia &&
                     window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// =============================================================
// THE SAME FIELD TWICE
// =============================================================
// A portal takes you off the page, and the way back is the browser's own back
// button. What you should find when you press it is the field you left —
// standing where you were standing, with the same corn in the same places.
// Anything else and walking through a door is not a door, it is an ending.
//
// The whole world is built synchronously below, from `createMaze` down to the
// last speck of pollen, and every module builds itself out of `Math.random`.
// So rather than thread a generator through eight files and two hundred call
// sites, the build borrows `Math.random` itself: seeded here, put back before
// the loop starts. Everything raised during that window comes out identical
// for a given seed — the lean of each stalk, where the lanterns went, which
// walls got doors — and everything after it is properly random again, which is
// what the living parts of the field want to be.
//
// The one thing this must not do is reach the animation loop. Critters
// choosing where to wander and weather choosing when to rain are not part of
// the field's identity, and replaying them would make the place feel wound up
// rather than alive.
const saved = loadField();
const fieldSeed = saved ? saved.seed : randomSeed();

const trueRandom = Math.random;
// Not the maze's own seed: maze.js runs its own generator off the same number,
// and two identical streams side by side is a correlation waiting to show up
// as a pattern somewhere. The odd constant is the usual golden-ratio scramble.
Math.random = mulberry32((fieldSeed ^ 0x9E3779B9) >>> 0);

const maze = createMaze(fieldSeed);
const isOpen = maze.isOpen;
const exitPos = maze.exitPos;

const { scene, camera, renderer, maxAniso, daylight } =
  createScene(isOpen, saved ? saved.elapsed : 0);

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

// After the lanterns, so a door is never put where a lantern post already
// stands in the way of walking into it.
const portals = createPortals(isOpen, rooms, maze.startPos, exitPos,
                              lanterns.obstacles, leaveTheField);
scene.add(portals.group);

// You were last seen standing in a doorway, because that is how you left. Hold
// every door until it has seen you step clear of it — see `lockAll`.
if (saved) portals.lockAll();

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
  spawnPos: (saved && saved.hasSpawn) ? { x: saved.x, z: saved.z } : null,
  spawnYaw: saved ? saved.yaw : null,
  spawnPitch: saved ? saved.pitch : null,
  reduceMotion: reduceMotion,
  obstacles: farm.obstacles.concat(lanterns.obstacles, garden.obstacles, portals.obstacles)
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

// The ones you had already picked up. Indices into `kernels` are only a
// meaningful thing to write down because the build above is deterministic —
// same seed, same room order, same kernels in the same order.
if (saved && saved.found) {
  for (let fi = 0; fi < saved.found.length; fi++) {
    const kn = kernels[saved.found[fi]];
    if (!kn || kn.done) continue;
    kn.done = true;
    scene.remove(kn.mesh);
    found++;
  }
  document.getElementById('kernelCount').textContent = 'kernels found: ' + found;
}

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
// THE WAY OUT THAT IS NOT THE WAY OUT
// =============================================================
// Called by portals.js once a door has committed, which takes about six tenths
// of a second of standing in one. From here it is a fade and a navigation.
//
// Same tab, deliberately. window.open would need to be inside the call stack
// of a gesture and this happens in a frame, so it would be swallowed by the
// popup blocker about as often as not; and going back is one key away, which
// is the gentlest exit available.
//
// And going back returns you to *this* field, standing where you were standing
// — see the note at the top of the file. The field is written down on the way
// out so that the browser can throw the page away and it still comes back.
let leavingFor = null;

function leaveTheField(dest) {
  if (leavingFor) return;
  leavingFor = dest;
  // Written before the navigation rather than left to `pagehide`, so the field
  // is safely down even if a browser decides to skip that event on unload.
  rememberTheField();
  portalEnter();

  // Let go of the mouse before the next page has to deal with it.
  if (document.pointerLockElement) document.exitPointerLock();

  const el = document.getElementById('portalFade');
  const b = new THREE.Color(dest.b);
  const mid = 'rgb(' + Math.round(b.r * 255) + ',' + Math.round(b.g * 255) + ',' +
              Math.round(b.b * 255) + ')';
  el.style.background = 'radial-gradient(ellipse at 50% 52%, ' + mid +
                        ' 0%, #170b28 62%, #05030a 100%)';
  // Named if it had a sign, and left unnamed if it did not — a door with
  // nothing written on it should not announce itself on the way through.
  el.querySelector('.dest').textContent = dest.name || '';
  el.classList.add('on');

  setTimeout(function () { window.location.href = dest.url; }, 1450);
}

// =============================================================
// WRITING THE FIELD DOWN
// =============================================================
let forgetting = false;   // set only by the button that means it

function rememberTheField() {
  if (forgetting) return;
  const foundIdx = [];
  for (let i = 0; i < kernels.length; i++) if (kernels[i].done) foundIdx.push(i);
  saveField({
    seed: fieldSeed,
    x: camera.position.x,
    z: camera.position.z,
    yaw: camera.rotation.y,
    pitch: camera.rotation.x,
    elapsed: daylight.elapsed,
    found: foundIdx,
    // Whether anybody has actually been in there yet. Somebody who opened the
    // page, looked at the title and closed it again should be met by the title
    // next time, not by "the same row, right where you left it" about a row
    // they never stood in.
    walked: started || (saved ? saved.walked : false)
  });
}

// `pagehide`, not `beforeunload`. beforeunload would tell the browser this
// page is not safe to keep, which disqualifies it from the back/forward cache
// — and the back/forward cache is exactly what makes coming back through a
// portal instant. Asking to be remembered in a way that guarantees being
// forgotten. This also covers every ordinary way of leaving, not just doors:
// closing the tab, a refresh, typing somewhere else.
window.addEventListener('pagehide', rememberTheField);

// =============================================================
// COMING BACK
// =============================================================
// Two ways home, and both have to land somewhere sensible.
//
// The plain one is a reload: everything above has already rebuilt the field
// from the seed and put you back where you stood.
//
// The other is the back/forward cache. The browser kept the page whole —
// heap, WebGL context, this very closure — and simply starts running it
// again. Which means it also kept the moment of leaving: `leavingFor` still
// set, the fade still over everything, movement still stopped. Nothing here
// expires on its own, so without this the field would come back frozen behind
// a purple screen, and the only way out would be a refresh.
window.addEventListener('pageshow', function (e) {
  if (!e.persisted || !leavingFor) return;

  leavingFor = null;
  document.getElementById('portalFade').classList.remove('on');
  // Still standing in the door you left through.
  portals.lockAll();

  // Back to the state before you stepped in: the day holds, and so do you,
  // until you say go. Pointer lock was given up on the way out and can only be
  // asked for again from a gesture, so there has to be something to click
  // anyway.
  started = false;
  resumed = true;
  document.getElementById('hud').style.display = 'none';
  document.getElementById('soundToggle').style.display = 'none';
  document.getElementById('newMazeBtn').style.display = 'none';
  presentEntry();
});

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
// True when this page is picking a field back up rather than raising one: a
// save with somebody's footsteps in it, or the back button just handing us the
// old page. A saved seed on its own is not enough — see `walked`.
let resumed = !!(saved && saved.walked);

// The door you come in by, worded for whichever of those it is. Arriving and
// coming back are not the same thing and should not read the same.
function presentEntry() {
  const ov = document.getElementById('overlay');
  ov.querySelector('h1').textContent = resumed ? 'Still Standing' : 'A Field of Corn';
  ov.querySelector('p').innerHTML = resumed
    ? 'The same corn, the same row, right where you left it.<br />Only the weather moved on.'
    : 'No score, no clock, no wrong way to go.<br />Walk. Listen. Follow a firefly if one drifts past.';
  document.getElementById('enterBtn').textContent =
    resumed ? 'Keep walking' : 'Step into the corn';
  ov.style.display = 'flex';
  ov.classList.remove('fadeOut');
}
presentEntry();

document.getElementById('enterBtn').addEventListener('click', function () {
  initAudio();
  resumeAudio();
  player.lock();
  const ov = document.getElementById('overlay');
  ov.classList.add('fadeOut');
  setTimeout(function () { ov.style.display = 'none'; }, 1700);
  document.getElementById('hud').style.display = 'flex';
  document.getElementById('soundToggle').style.display = 'block';
  document.getElementById('newMazeBtn').style.display = 'block';
  started = true;
  toast(resumed ? 'the rows are where you left them'
                : 'the corn closes in behind you…', 3600);
});

// The way to a different field, and the only one — leaving through a door no
// longer costs you this one, so starting over has to be something you ask for.
// `forgetting` stops the save on the way out of the reload putting the field
// straight back where it was.
document.getElementById('newMazeBtn').addEventListener('click', function () {
  forgetting = true;
  clearField();
  window.location.reload();
});

// =============================================================
// LOOP
// =============================================================
const clock = new THREE.Clock();

// Said once each, the first time it happens. Observations, not instructions —
// nothing here asks you to do anything about it.
let saidDark = false, saidDawn = false, saidRain = false, saidGarden = false;
let saidPortal = false;

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

  // The doors keep turning over before you have started and after you have
  // gone: they are the only thing in the field that has to look alive in the
  // frame the page is taken away in.
  portals.update(dt, t, camera.position, night);
  setPortal(portals.level);

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
  // Said the first time one is close enough to matter, so that walking into
  // one is a thing you chose rather than a thing that happened to you.
  if (started && !saidPortal && portals.level > 0.55) {
    saidPortal = true;
    toast('a door in the corn, and not made of corn. step into it and the field lets you go', 7000);
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

  // Once a door has you, you stop walking. The field keeps going without you,
  // which is the point of it.
  if (started && !leavingFor) player.update(dt);

  renderer.render(scene, camera);
}

// The field is raised. Hand randomness back before the first frame — from here
// on it belongs to the weather and the animals, and none of that should repeat
// just because you have been here before.
Math.random = trueRandom;

animate();
