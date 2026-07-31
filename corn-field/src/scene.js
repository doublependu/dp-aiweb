// Renderer, sky, light, fog and ground.
//
// Three of the choices here exist only to keep the look identical to the
// original r128 build — see LEGACY_LIGHT_SCALE and createRenderer below.

import * as THREE from 'three';
import { FINE, FIELD } from './maze.js';

const HAZE = 0xE9CB8A;

// r128 ran the non-physical lighting path, which multiplied every light's
// intensity by PI inside WebGLLights. That path was deleted in r155, so the
// intensities from the original source have to carry the factor themselves.
export const LEGACY_LIGHT_SCALE = Math.PI;

// How long the afternoon takes to become dusk, in seconds. Tune freely.
export const DAY_LENGTH = 360;

// The two ends of the cycle. Everything in between is interpolated, so a new
// time of day means editing one column, not hunting for scattered constants.
const DAY = {
  sunPos: new THREE.Vector3(-60, 26, 34),
  sunColor: 0xffd79a, sunIntensity: 1.25,
  glowTint: 0xffffff,
  skyTop: 0x7ea9d6, skyMid: 0xf2cb8b, skyBottom: 0xf7e4b6,
  hemiSky: 0xb8d2ef, hemiGround: 0x6d5327, hemiIntensity: 0.62,
  ambColor: 0xffeac4, ambIntensity: 0.30,
  fogColor: HAZE, fogDensity: 0.020
};

const DUSK = {
  // Same bearing, dropped to about four degrees above the horizon.
  sunPos: new THREE.Vector3(-60, 4.5, 34),
  sunColor: 0xff8c3c, sunIntensity: 0.45,
  glowTint: 0xff9a52,
  skyTop: 0x2f3c66, skyMid: 0xdd8446, skyBottom: 0x8f5a38,
  hemiSky: 0x54658f, hemiGround: 0x33260f, hemiIntensity: 0.28,
  ambColor: 0xbf9a80, ambIntensity: 0.14,
  // Held darker than skyMid so the far corn reads as a silhouette against a
  // still-glowing sky. At midday the two match and the field just dissolves.
  fogColor: 0xB9743C, fogDensity: 0.026
};

export function createScene(isOpen) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(HAZE, 0.020);

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 500);
  const renderer = createRenderer();
  document.body.appendChild(renderer.domElement);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const sky = addSky(scene);
  const lights = addLights(scene);
  addGround(scene, isOpen, maxAniso);

  const daylight = createDaylight(renderer, scene, sky, lights);

  return { scene, camera, renderer, sky, maxAniso, daylight };
}

// The light cycle runs once and settles at dusk. It does not loop back to
// afternoon and it never reaches night — a wander with no fail state should
// not end with the player unable to see the corridor they are standing in.
function createDaylight(renderer, scene, sky, lights) {
  const _a = new THREE.Color();
  const _b = new THREE.Color();
  function mix(target, hexA, hexB, t) {
    _a.setHex(hexA); _b.setHex(hexB);
    target.copy(_a).lerp(_b, t);
  }

  let elapsed = 0;
  let darkness = 0;

  function apply(e) {
    lights.sun.position.lerpVectors(DAY.sunPos, DUSK.sunPos, e);
    lights.glow.position.copy(lights.sun.position).multiplyScalar(3.2);
    mix(lights.sun.color, DAY.sunColor, DUSK.sunColor, e);
    mix(lights.glow.material.color, DAY.glowTint, DUSK.glowTint, e);
    lights.sun.intensity = lerp(DAY.sunIntensity, DUSK.sunIntensity, e) * LEGACY_LIGHT_SCALE;

    mix(lights.hemi.color, DAY.hemiSky, DUSK.hemiSky, e);
    mix(lights.hemi.groundColor, DAY.hemiGround, DUSK.hemiGround, e);
    lights.hemi.intensity = lerp(DAY.hemiIntensity, DUSK.hemiIntensity, e) * LEGACY_LIGHT_SCALE;

    mix(lights.ambient.color, DAY.ambColor, DUSK.ambColor, e);
    lights.ambient.intensity = lerp(DAY.ambIntensity, DUSK.ambIntensity, e) * LEGACY_LIGHT_SCALE;

    mix(sky.material.uniforms.cTop.value, DAY.skyTop, DUSK.skyTop, e);
    mix(sky.material.uniforms.cMid.value, DAY.skyMid, DUSK.skyMid, e);
    mix(sky.material.uniforms.cBottom.value, DAY.skyBottom, DUSK.skyBottom, e);

    mix(scene.fog.color, DAY.fogColor, DUSK.fogColor, e);
    scene.fog.density = lerp(DAY.fogDensity, DUSK.fogDensity, e);
    renderer.setClearColor(scene.fog.color);

    darkness = e;
  }

  apply(0);

  return {
    // 0 at full afternoon, 1 at dusk. Eased, so it is also the right curve to
    // hang other dusk-driven things off.
    get darkness() { return darkness; },
    update: function (dt) {
      if (elapsed >= DAY_LENGTH) return;
      elapsed = Math.min(elapsed + dt, DAY_LENGTH);
      const p = elapsed / DAY_LENGTH;
      // Smoothstep: the afternoon lingers, dusk arrives and then settles,
      // instead of the light sliding at a constant mechanical rate.
      apply(p * p * (3 - 2 * p));
    }
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function createRenderer() {
  // r128 had no colour management and wrote linear values straight to the
  // canvas. r185 defaults to sRGB output plus sRGB->linear on every Color,
  // which lifts the whole scene into a paler, flatter afternoon. Opting out
  // of both keeps the original hand-picked hues exactly as they were.
  THREE.ColorManagement.enabled = false;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(HAZE);
  return renderer;
}

function addSky(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(320, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        cTop: { value: new THREE.Color(0x7ea9d6) },
        cMid: { value: new THREE.Color(0xf2cb8b) },
        cBottom: { value: new THREE.Color(0xf7e4b6) }
      },
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vPos;
        uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cBottom;
        void main() {
          float h = normalize(vPos).y;
          vec3 col = h > 0.0
            ? mix(cMid, cTop, smoothstep(0.0, 0.55, h))
            : mix(cMid, cBottom, smoothstep(0.0, -0.25, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);
  return sky;
}

// Low and warm to begin with; createDaylight drives these from here on.
function addLights(scene) {
  const sun = new THREE.DirectionalLight(DAY.sunColor, DAY.sunIntensity * LEGACY_LIGHT_SCALE);
  sun.position.copy(DAY.sunPos);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(DAY.hemiSky, DAY.hemiGround, DAY.hemiIntensity * LEGACY_LIGHT_SCALE);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(DAY.ambColor, DAY.ambIntensity * LEGACY_LIGHT_SCALE);
  scene.add(ambient);

  const glow = addSunGlow(scene, sun.position);

  return { sun, hemi, ambient, glow };
}

function addSunGlow(scene, sunPosition) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(255,244,214,0.95)');
  grad.addColorStop(0.35, 'rgba(255,226,168,0.40)');
  grad.addColorStop(1.0, 'rgba(255,226,168,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);

  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }));
  spr.scale.set(90, 90, 1);
  spr.position.copy(sunPosition).multiplyScalar(3.2);
  scene.add(spr);
  return spr;
}

// The maze corridors are baked into the ground texture, so the trodden earth
// lines up with the corn without a second set of geometry.
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
  scene.add(floor);

  // plain earth continuing past the field edge
  const outerTex = tex.clone();
  outerTex.needsUpdate = true;
  outerTex.wrapS = outerTex.wrapT = THREE.RepeatWrapping;
  outerTex.repeat.set(8, 8);
  const outer = new THREE.Mesh(
    new THREE.PlaneGeometry(FIELD + 160, FIELD + 160),
    new THREE.MeshStandardMaterial({ map: outerTex, roughness: 1 })
  );
  outer.rotation.x = -Math.PI / 2;
  scene.add(outer);
}
