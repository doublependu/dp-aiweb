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
  addLights(scene);
  addGround(scene, isOpen, maxAniso);

  return { scene, camera, renderer, sky, maxAniso };
}

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

// Low, warm, late afternoon.
function addLights(scene) {
  const sun = new THREE.DirectionalLight(0xffd79a, 1.25 * LEGACY_LIGHT_SCALE);
  sun.position.set(-60, 26, 34);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xb8d2ef, 0x6d5327, 0.62 * LEGACY_LIGHT_SCALE));
  scene.add(new THREE.AmbientLight(0xffeac4, 0.30 * LEGACY_LIGHT_SCALE));

  addSunGlow(scene, sun.position);
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
