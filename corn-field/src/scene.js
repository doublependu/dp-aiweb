// Renderer, light, fog, ground and the turning of the day.
//
// Three of the choices here exist only to keep the look identical to the
// original r128 build — see LEGACY_LIGHT_SCALE and createRenderer below.

import * as THREE from 'three';
import { FINE, FIELD } from './maze.js';
import { createSky, bodyPosition } from './sky.js';

const HAZE = 0xE9CB8A;

// r128 ran the non-physical lighting path, which multiplied every light's
// intensity by PI inside WebGLLights. That path was deleted in r155, so the
// intensities from the original source have to carry the factor themselves.
export const LEGACY_LIGHT_SCALE = Math.PI;

// One whole turn — afternoon, dusk, night, dawn, day and round again — in
// seconds. This is the one dial for how fast the world moves.
export const CYCLE_LENGTH = 1200;

// In-world days per lunar month. Short on purpose: at seven, the moon is
// visibly a different shape by the second night, which is the whole point of
// giving it a phase at all.
const LUNAR_DAYS = 7;

// Full moon, straight overhead, at its brightest. Enough to walk by and not a
// lumen more — the lanterns are meant to be worth having.
const MOON_INTENSITY = 0.30;

// The sun's shadow. The map covers a box this many metres either side of the
// player rather than the whole farm: at 2048 pixels that is about three
// centimetres to a texel, which is what it takes for a corn leaf to cast a
// leaf-shaped shadow instead of a grey smudge. Anything further off than this
// is in haze by then anyway.
const SHADOW_REACH = 34;
const SHADOW_MAP = 2048;
// How far up the light sits. Only the direction matters to a directional
// light, but the shadow camera's near and far planes are measured from here.
const SUN_DISTANCE = 75;

// =============================================================
// PALETTES
// =============================================================
// Each block is one moment of the day, complete. They are sampled by the
// sun's elevation rather than by the clock, so dusk and dawn fall out of the
// same machinery and the colour can never drift out of step with where the
// sun actually is. A new time of day means editing one block, not hunting for
// scattered constants.

// The palette the piece was authored around — sun elevation 0.347, which is
// exactly where the cycle starts. The opening frame is the original frame.
const AFTERNOON = {
  sun: 0xffd79a, sunI: 1.25,
  glow: 0xffffff, glowO: 1.00, glowS: 90,
  skyTop: 0x7ea9d6, skyMid: 0xf2cb8b, skyBottom: 0xf7e4b6,
  hemiSky: 0xb8d2ef, hemiGround: 0x6d5327, hemiI: 0.62,
  amb: 0xffeac4, ambI: 0.30,
  fog: HAZE, fogD: 0.020
};

// The original dusk keyframe, now pinned to the elevation it was drawn at.
// Fog is held darker than skyMid so the far corn reads as a silhouette
// against a still-glowing sky; when the two match, the field just dissolves.
const SUNSET = {
  sun: 0xff8c3c, sunI: 0.45,
  glow: 0xff9a52, glowO: 1.00, glowS: 132,
  skyTop: 0x2f3c66, skyMid: 0xdd8446, skyBottom: 0x8f5a38,
  hemiSky: 0x54658f, hemiGround: 0x33260f, hemiI: 0.28,
  amb: 0xbf9a80, ambI: 0.14,
  fog: 0xB9743C, fogD: 0.026
};

// Sun just under the horizon, the sky still burning.
const AFTERGLOW = {
  sun: 0xff6a3a, sunI: 0.10,
  glow: 0xff7a42, glowO: 0.52, glowS: 152,
  skyTop: 0x1e2547, skyMid: 0x8c4f52, skyBottom: 0x4d2f38,
  hemiSky: 0x414c7a, hemiGround: 0x241b11, hemiI: 0.22,
  amb: 0x93798e, ambI: 0.13,
  fog: 0x6d4147, fogD: 0.026
};

// The blue hour. One palette serves both ends of the night; the difference
// between evening and morning is carried by AFTERGLOW and FIRSTLIGHT either
// side of it.
const BLUE_HOUR = {
  sun: 0x3a4a80, sunI: 0.00,
  glow: 0x2c3a66, glowO: 0.14, glowS: 124,
  skyTop: 0x0c1330, skyMid: 0x22305c, skyBottom: 0x2a3358,
  hemiSky: 0x30427a, hemiGround: 0x171a24, hemiI: 0.21,
  amb: 0x54659e, ambI: 0.14,
  fog: 0x2a3358, fogD: 0.023
};

// Night is deliberately not black. A wander with no fail state should never
// end with the player unable to see the corridor they are standing in, so the
// floor here is set by what is walkable rather than by what is realistic.
// Between these two intensities, the moon and the lanterns you can always
// find a wall. If night ever reads too dark or too bright, hemiI and ambI are
// the two numbers to turn.
const NIGHT = {
  sun: 0x28345a, sunI: 0.00,
  glow: 0x101a33, glowO: 0.00, glowS: 100,
  skyTop: 0x040711, skyMid: 0x080e20, skyBottom: 0x0e1529,
  hemiSky: 0x24345e, hemiGround: 0x0a0e18, hemiI: 0.20,
  amb: 0x44548a, ambI: 0.14,
  fog: 0x0c1224, fogD: 0.019
};

// Before the sun is up: cooler and rosier than the evening's afterglow.
const FIRSTLIGHT = {
  sun: 0xa2708f, sunI: 0.06,
  glow: 0xcf8896, glowO: 0.38, glowS: 140,
  skyTop: 0x1a2350, skyMid: 0x7a5580, skyBottom: 0x4c3a5e,
  hemiSky: 0x47528e, hemiGround: 0x1d1a24, hemiI: 0.24,
  amb: 0x8b87ab, ambI: 0.15,
  fog: 0x5b4562, fogD: 0.029
};

// Sunrise: paler and pinker than sunset, and the mist is thicker. That
// difference is most of what tells the two ends of the night apart.
const SUNRISE = {
  sun: 0xffb478, sunI: 0.50,
  glow: 0xffb98a, glowO: 0.95, glowS: 136,
  skyTop: 0x3d4d80, skyMid: 0xf0a87e, skyBottom: 0xdaa48c,
  hemiSky: 0x8496bd, hemiGround: 0x3a3021, hemiI: 0.36,
  amb: 0xdcb4a6, ambI: 0.19,
  fog: 0xCB8E74, fogD: 0.030
};

// Morning: the same low sun as the afternoon, but crisp instead of amber and
// still hazy from the night.
const MORNING = {
  sun: 0xffe8c6, sunI: 1.02,
  glow: 0xffffff, glowO: 0.95, glowS: 82,
  skyTop: 0x6f9dd2, skyMid: 0xd6dee6, skyBottom: 0xe9e3d6,
  hemiSky: 0xc4dcf4, hemiGround: 0x6b5a34, hemiI: 0.56,
  amb: 0xf1efe0, ambI: 0.26,
  fog: 0xD9DDD4, fogD: 0.025
};

// The top of the day, and the hardest light in the piece to get right. The
// sun is nearly overhead, so the ground takes almost the full beam instead of
// the glancing sliver it gets at every other hour this scene was balanced
// for; left at afternoon intensities it burns out to white, and the corn goes
// flat and cartoon-green. So noon is held down and hazed instead — hot,
// bleached, and slightly wearying, which is what a real one is. The numbers
// look too low written down and are right on screen. The extra haze is also
// what keeps the treeline from resolving into a hard edge.
const NOON = {
  sun: 0xfff2d8, sunI: 0.90,
  glow: 0xffffff, glowO: 0.88, glowS: 68,
  skyTop: 0x5f92cc, skyMid: 0xb6cfe4, skyBottom: 0xdfe4e0,
  hemiSky: 0xcadff2, hemiGround: 0x7c6234, hemiI: 0.50,
  amb: 0xfff8ea, ambI: 0.22,
  fog: 0xCFD6CC, fogD: 0.024
};

// Sampled by sun elevation (the sine of its angle above the horizon). Two
// tables, because the sky on the way down is not the sky on the way up. They
// agree at both ends — NIGHT at the bottom, NOON at the top — so switching
// between them at the turning points is seamless.
const SETTING = [
  [-1.000, NIGHT], [-0.230, NIGHT], [-0.115, BLUE_HOUR], [-0.035, AFTERGLOW],
  [0.050, SUNSET], [0.347, AFTERNOON], [0.780, NOON], [1.000, NOON]
];

const RISING = [
  [-1.000, NIGHT], [-0.230, NIGHT], [-0.115, BLUE_HOUR], [-0.035, FIRSTLIGHT],
  [0.050, SUNRISE], [0.347, MORNING], [0.780, NOON], [1.000, NOON]
];

const COLOR_KEYS = ['sun', 'glow', 'skyTop', 'skyMid', 'skyBottom', 'hemiSky', 'hemiGround', 'amb', 'fog'];
const NUMBER_KEYS = ['sunI', 'glowO', 'glowS', 'hemiI', 'ambI', 'fogD'];

// =============================================================
// THE ARC
// =============================================================
// Where the sun is, as a fraction of the cycle. The angle is measured from
// sunrise: 0 rising, 90 overhead, 180 setting, past 180 below the horizon.
//
// The rate is deliberately uneven. Twilight is the part worth having, so the
// sun crawls through it and hurries across the middle of the day and the
// middle of the night. 159 degrees is the late-summer afternoon the piece
// opens on; 519 is the same angle one turn later.
const ARC = [
  [0.000, 159],
  [0.090, 176],   // the sun touches the horizon
  [0.213, 200],   // last light gone
  [0.433, 330],   // the long middle of the night
  [0.653, 380],   // up again, early morning
  [0.953, 510],
  [1.000, 519]
];

export function createScene(isOpen) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, 0.020);

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 700);
  const renderer = createRenderer();
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const sky = createSky(scene);
  const lights = addLights(scene);
  addGround(scene, isOpen, maxAniso);

  const daylight = createDaylight(renderer, scene, sky, lights, camera);

  return { scene, camera, renderer, maxAniso, daylight };
}

function createDaylight(renderer, scene, sky, lights, camera) {
  // Scratch: the sampled palette, rebuilt in place every frame.
  const P = {};
  for (let i = 0; i < COLOR_KEYS.length; i++) P[COLOR_KEYS[i]] = new THREE.Color();
  const _a = new THREE.Color();
  const _b = new THREE.Color();
  const _v = new THREE.Vector3();

  function samplePalette(table, e) {
    let hi = 1;
    while (hi < table.length - 1 && table[hi][0] < e) hi++;
    const lo = hi - 1;
    const span = table[hi][0] - table[lo][0];
    const t = smootherstep(span > 0 ? (e - table[lo][0]) / span : 0);
    const A = table[lo][1], B = table[hi][1];
    for (let i = 0; i < COLOR_KEYS.length; i++) {
      const k = COLOR_KEYS[i];
      _a.setHex(A[k]); _b.setHex(B[k]);
      P[k].copy(_a).lerp(_b, t);
    }
    for (let i = 0; i < NUMBER_KEYS.length; i++) {
      const k = NUMBER_KEYS[i];
      P[k] = A[k] + (B[k] - A[k]) * t;
    }
  }

  function sunAngle(p) {
    let hi = 1;
    while (hi < ARC.length - 1 && ARC[hi][0] < p) hi++;
    const lo = hi - 1;
    const span = ARC[hi][0] - ARC[lo][0];
    const t = span > 0 ? (p - ARC[lo][0]) / span : 0;
    return (ARC[lo][1] + (ARC[hi][1] - ARC[lo][1]) * t) * Math.PI / 180;
  }

  // Written from outside by weather.js: how much extra haze there is and how
  // much of the light the cloud is holding back. Folded into the palette here
  // rather than replacing it, so a rainy dusk is still a dusk.
  const weather = { fogBoost: 0, lightDamp: 0 };

  let elapsed = 0;
  // Somewhere between waxing gibbous and just past full, so the first night
  // always has a moon well up in it. It drifts from here.
  const moonPhi0 = 2.0 + Math.random() * 1.4;

  const state = {
    cameraPosition: camera.position,
    skyTop: P.skyTop, skyMid: P.skyMid, skyBottom: P.skyBottom,
    glowColor: P.glow, glowOpacity: 1, glowScale: 90,
    sunTheta: 0, moonTheta: 0, moonPhi: Math.PI,
    starOpacity: 0, night: 0, elevation: 0, moonlight: 0, time: 0
  };

  function apply(dt) {
    const cycles = elapsed / CYCLE_LENGTH;
    const theta = sunAngle(cycles % 1);

    bodyPosition(theta, _v);
    const elev = _v.y / _v.length();
    const rising = Math.cos(theta) > 0;
    samplePalette(rising ? RISING : SETTING, elev);

    // Under cloud the sun goes off first and hardest, and the flat light left
    // behind is mostly sky — so the ambient terms lose much less than the
    // beam does. Getting that ratio wrong is what makes overcast scenes read
    // as "somebody turned the brightness down" instead of as weather.
    const damp = weather.lightDamp;

    // The sun keeps its direction but is pulled in close and carried along
    // with the player: a directional light has no position that matters
    // beyond its bearing, and this keeps the shadow map spent on the part of
    // the field somebody is actually standing in.
    lights.sun.position.copy(_v).normalize().multiplyScalar(SUN_DISTANCE).add(camera.position);
    lights.sun.target.position.copy(camera.position);
    lights.sun.target.updateMatrixWorld();
    lights.sun.color.copy(P.sun);
    lights.sun.intensity = Math.max(0, P.sunI) * (1 - damp) * LEGACY_LIGHT_SCALE;
    // Nothing to cast with, and a shadow pass costs the same whether the
    // light is on or not.
    lights.sun.castShadow = lights.sun.intensity > 0.02;

    lights.hemi.color.copy(P.hemiSky);
    lights.hemi.groundColor.copy(P.hemiGround);
    lights.hemi.intensity = P.hemiI * (1 - damp * 0.30) * LEGACY_LIGHT_SCALE;

    lights.ambient.color.copy(P.amb);
    lights.ambient.intensity = P.ambI * (1 - damp * 0.15) * LEGACY_LIGHT_SCALE;

    scene.fog.color.copy(P.fog);
    scene.fog.density = P.fogD + weather.fogBoost;
    renderer.setClearColor(scene.fog.color);

    // 1 once the sun is under the horizon, 0 while it is up.
    const night = smoothstep(0.06, -0.06, elev);

    // Phase is elongation from the sun, so the moon's shape and its place in
    // the sky can never disagree. Minus, not plus: the moon lags further east
    // as it waxes, so it sets later each night. Full (phi = PI) then puts it
    // opposite the sun — rising as the sun sets, overhead at midnight — and a
    // waxing crescent follows the sun down shortly after sunset, which is the
    // only time you ever actually see one.
    const phi = mod2pi(moonPhi0 + cycles * Math.PI * 2 / LUNAR_DAYS);
    const moonTheta = theta - phi;
    bodyPosition(moonTheta, _v);
    const moonElev = _v.y / _v.length();
    const lit = 0.5 - 0.5 * Math.cos(phi);
    const moonUp = smoothstep(-0.02, 0.20, moonElev);
    const moonlight = lit * moonUp * night;

    lights.moon.position.copy(_v).multiplyScalar(0.25);
    lights.moon.intensity = moonlight * MOON_INTENSITY * LEGACY_LIGHT_SCALE;
    lights.moon.visible = moonlight > 0.005;

    // A bright moon washes the faintest stars out, the same as it does in the
    // real sky.
    state.starOpacity = smoothstep(0.03, -0.13, elev) * (1 - 0.38 * moonlight);
    state.sunTheta = theta;
    state.moonTheta = moonTheta;
    state.moonPhi = phi;
    state.glowOpacity = P.glowO;
    state.glowScale = P.glowS;
    state.night = night;
    state.elevation = elev;
    state.moonlight = moonlight;

    sky.update(state, dt);
  }

  apply(0);

  return {
    // weather.js writes here; see the note where it is declared.
    weather: weather,
    // 0 while the sun is up, 1 once it is under the horizon. The right curve
    // to hang anything nocturnal off.
    get night() { return state.night; },
    // Sine of the sun's angle above the horizon: negative once it has set.
    get elevation() { return state.elevation; },
    update: function (dt, time) {
      elapsed += dt;
      state.time = time;
      apply(dt);
    }
  };
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Zero first *and* second derivative at both ends, so a palette arrives and
// leaves without a kink. Over a twenty minute day the kink is otherwise
// visible as a moment where the sky seems to lurch.
function smootherstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function mod2pi(a) {
  const TAU = Math.PI * 2;
  return ((a % TAU) + TAU) % TAU;
}

function createRenderer() {
  // r128 had no colour management and wrote linear values straight to the
  // canvas. r185 defaults to sRGB output plus sRGB->linear on every Color,
  // which lifts the whole scene into a paler, flatter afternoon. Opting out
  // of both keeps the original hand-picked hues exactly as they were.
  THREE.ColorManagement.enabled = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  // One shadow-casting light in the whole scene, so this is one extra pass
  // over the corn per frame and nothing else. PCF rather than the soft
  // variant: r185 deprecated PCFSoftShadowMap and silently falls back to this
  // anyway, and asking for it only earns a warning on the first frame.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(HAZE);
  return renderer;
}

// Low and warm to begin with; createDaylight drives these from here on.
function addLights(scene) {
  const sun = new THREE.DirectionalLight(AFTERNOON.sun, AFTERNOON.sunI * LEGACY_LIGHT_SCALE);
  scene.add(sun);
  // The target is moved to the player every frame, so it has to be in the
  // scene graph to have its matrix updated.
  scene.add(sun.target);

  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.camera.left = -SHADOW_REACH;
  sun.shadow.camera.right = SHADOW_REACH;
  sun.shadow.camera.top = SHADOW_REACH;
  sun.shadow.camera.bottom = -SHADOW_REACH;
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = SUN_DISTANCE + SHADOW_REACH * 2.4;
  // Corn is vertical alpha-tested quads, which is the worst case there is for
  // shadow acne: for most of the day some of them lie nearly along the light.
  // normalBias does the heavy lifting; the constant bias is what stops a
  // stalk from shadowing its own base at a low sun.
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.09;

  // A second directional light for the moon: cold, weak, and the only thing
  // with a direction to it once the sun has gone.
  const moon = new THREE.DirectionalLight(0xa9c2f0, 0);
  scene.add(moon);

  const hemi = new THREE.HemisphereLight(AFTERNOON.hemiSky, AFTERNOON.hemiGround, AFTERNOON.hemiI * LEGACY_LIGHT_SCALE);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(AFTERNOON.amb, AFTERNOON.ambI * LEGACY_LIGHT_SCALE);
  scene.add(ambient);

  return { sun, moon, hemi, ambient };
}

// The maze corridors are baked into the ground texture, so the trodden earth
// lines up with the corn without a second set of geometry. The land outside
// the field is farm.js's business.
const PX = 34;

function addGround(scene, isOpen, maxAniso) {
  const c = document.createElement('canvas');
  c.width = c.height = FINE * PX;
  const g = c.getContext('2d');

  g.fillStyle = '#7a5c2c';
  g.fillRect(0, 0, c.width, c.height);

  // trodden, lighter earth wherever the maze is walkable
  for (let fx = 0; fx < FINE; fx++) {
    for (let fy = 0; fy < FINE; fy++) {
      if (!isOpen[fx][fy]) continue;
      const px = fx * PX, py = fy * PX;
      const rg = g.createRadialGradient(px + PX / 2, py + PX / 2, 2, px + PX / 2, py + PX / 2, PX * 0.85);
      rg.addColorStop(0, 'rgba(176,143,86,0.95)');
      rg.addColorStop(1, 'rgba(176,143,86,0)');
      g.fillStyle = rg;
      g.fillRect(px - PX * 0.4, py - PX * 0.4, PX * 1.8, PX * 1.8);
    }
  }

  // grain + scattered dry leaf litter
  for (let n = 0; n < 26000; n++) {
    const x = Math.random() * c.width, y = Math.random() * c.height;
    g.fillStyle = 'rgba(' + (95 + Math.random() * 75 | 0) + ',' +
                            (70 + Math.random() * 60 | 0) + ',' +
                            (26 + Math.random() * 34 | 0) + ',' +
                            (0.10 + Math.random() * 0.22).toFixed(2) + ')';
    g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  for (let l = 0; l < 700; l++) {
    g.save();
    g.translate(Math.random() * c.width, Math.random() * c.height);
    g.rotate(Math.random() * Math.PI);
    g.fillStyle = 'rgba(150,124,58,0.35)';
    g.fillRect(-4, -1, 8, 2);
    g.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD, FIELD),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  scene.add(floor);
}
