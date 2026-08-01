// Cloud and rain.
//
// Two halves that share one texture. The cloud noise is drawn once to a
// tiling canvas; the sky layer reads it as alpha overhead, and every lit
// material in the world reads the same texture again as a darkening term on
// the ground. That is the whole trick — because both sample the same map with
// the same scroll, the shadow crossing the field really is the shadow of the
// cloud you can see, and watching one arrive is the point of having them.
//
// Weather here is slow and mild on purpose. It is never bad weather: showers
// are light, they are announced by the light going flat several minutes
// beforehand, and nothing about them asks the player to do anything.

import * as THREE from 'three';

// Metres per texture tile on the ground. Big: a cloud shadow should take the
// better part of a minute to cross the field, not flicker past.
const CLOUD_TILE = 190;
const CLOUD_HEIGHT = 150;
const CLOUD_DRIFT = 3.4;      // metres per second, downwind
const SHADOW_MAX = 0.36;      // how much light the thickest cloud takes away

// The showers. Rare, and never the first thing that happens to you.
const FIRST_SHOWER = [240, 420];
const BETWEEN_SHOWERS = [260, 540];
const SHOWER_LENGTH = [90, 220];

const RAIN_COUNT = 1600;
const RAIN_BOX = 22;          // the column of rain that follows the camera
const RAIN_TOP = 13;
const RAIN_FALL = 11.5;       // light rain falls slowly; this is not a storm

export function createWeather(scene) {
  const cloudTex = makeCloudTexture();

  // Shared by the sky layer and by every material on the ground, so they can
  // never drift apart.
  const uCloudMap = { value: cloudTex };
  const uCloudScroll = { value: new THREE.Vector2(0, 0) };
  const uCloudScale = { value: 1 / CLOUD_TILE };
  const uCloudCut = { value: 0.55 };    // noise below this is clear sky
  const uCloudShade = { value: 0 };     // 0 in the dark; the sun casts the shadow, not the sky

  const sky = makeCloudLayer(uCloudMap, uCloudScroll, uCloudScale, uCloudCut);
  scene.add(sky);

  const rain = makeRain();
  scene.add(rain.mesh);

  // cover: how much of the sky is cloud. wet: how hard it is raining.
  // It starts nearly clear, because the afternoon this piece opens on was
  // authored under a clear sky and the first frame should still be that one.
  let cover = 0.16 + Math.random() * 0.14;
  let coverWant = cover;
  let wet = 0;
  let wetWant = 0;
  let timer = FIRST_SHOWER[0] + Math.random() * (FIRST_SHOWER[1] - FIRST_SHOWER[0]);
  let raining = false;
  const drift = new THREE.Vector2(0.78, 0.62).normalize();

  function beginShower() {
    raining = true;
    wetWant = 0.55 + Math.random() * 0.45;
    coverWant = 0.82 + Math.random() * 0.14;
    timer = SHOWER_LENGTH[0] + Math.random() * (SHOWER_LENGTH[1] - SHOWER_LENGTH[0]);
  }

  function endShower() {
    raining = false;
    wetWant = 0;
    coverWant = 0.12 + Math.random() * 0.30;
    timer = BETWEEN_SHOWERS[0] + Math.random() * (BETWEEN_SHOWERS[1] - BETWEEN_SHOWERS[0]);
  }

  const state = { rain: 0, cover: cover };

  return {
    state: state,

    // Anything lit by the sun should be shaded by what gets in the sun's way.
    // Call this on a material before it first compiles.
    patch: function (material) { patchCloudShadow(material, uCloudMap, uCloudScroll, uCloudScale, uCloudCut, uCloudShade); },

    // For a look at the rain without waiting for it.
    shower: beginShower,

    update: function (dt, cameraPosition, elevation, night, fogColor) {
      timer -= dt;
      if (timer <= 0) { if (raining) endShower(); else beginShower(); }

      // Cloud thickens and thins over a minute or so either way, so the light
      // going flat is the first sign of a shower — well before the first drop.
      cover += (coverWant - cover) * Math.min(1, dt / 55);
      // Rain itself arrives faster than the cloud does, but still fades in
      // rather than switching on.
      wet += (wetWant - wet) * Math.min(1, dt / 14);
      state.rain = wet;
      state.cover = cover;

      uCloudScroll.value.x -= drift.x * CLOUD_DRIFT * dt / CLOUD_TILE;
      uCloudScroll.value.y -= drift.y * CLOUD_DRIFT * dt / CLOUD_TILE;

      // Raising the cut thins the cloud out to scattered patches; lowering it
      // closes the sky over.
      uCloudCut.value = 0.74 - 0.46 * cover;

      // The ground can only be shadowed by cloud while there is a sun to
      // shadow it. After dark the cloud is still there — it eats the stars —
      // but it stops darkening the field.
      uCloudShade.value = SHADOW_MAX * smoothstep(-0.02, 0.16, elevation);

      // The underside of cloud is lit by the sky it hangs in, so tinting it
      // toward the fog colour keeps it in the same light as everything else,
      // and keeps it from being a white shape pasted on a red sunset.
      const lift = 0.55 + 0.45 * smoothstep(-0.1, 0.25, elevation);
      sky.material.uniforms.uTint.value.copy(fogColor).multiplyScalar(lift * (1 - 0.55 * night));
      sky.material.uniforms.uOpacity.value = 0.82;
      sky.position.set(cameraPosition.x, CLOUD_HEIGHT, cameraPosition.z);

      rain.update(dt, cameraPosition, wet, night);
    },

    // The shower takes the edge off the light and thickens the air; the
    // daylight cycle reads these and folds them into the palette it already
    // has, so a rainy dusk is still a dusk.
    get fogBoost() { return wet * 0.020; },
    // Scattered cloud does not dim the day — the sun is either behind a cloud
    // or it is not, and that is the per-pixel shadow above, not a dimmer on
    // the whole world. Only a sky that has closed over takes the beam away
    // everywhere at once, so nothing happens here until cover is most of it.
    get lightDamp() { return Math.min(0.60, Math.max(0, cover - 0.45) * 0.80 + wet * 0.34); }
  };
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// =============================================================
// THE CLOUD MAP
// =============================================================
// Blobs at four sizes, each drawn nine times so it wraps at the seams. Value
// noise from a shader would be tidier, but this is sampled by everything in
// the scene every frame and a texture read is the cheapest thing there is.
function makeCloudTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';

  const octaves = [[5, 170, 0.42], [12, 104, 0.34], [34, 58, 0.26], [90, 26, 0.18]];
  for (let o = 0; o < octaves.length; o++) {
    const n = octaves[o][0], r = octaves[o][1], a = octaves[o][2];
    for (let i = 0; i < n; i++) {
      const x = Math.random() * S, y = Math.random() * S;
      const rr = r * (0.6 + Math.random() * 0.8);
      for (let wx = -1; wx <= 1; wx++) {
        for (let wy = -1; wy <= 1; wy++) {
          const px = x + wx * S, py = y + wy * S;
          if (px < -rr || px > S + rr || py < -rr || py > S + rr) continue;
          const rg = g.createRadialGradient(px, py, 0, px, py, rr);
          rg.addColorStop(0, 'rgba(255,255,255,' + a + ')');
          rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg;
          g.beginPath(); g.arc(px, py, rr, 0, Math.PI * 2); g.fill();
        }
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// =============================================================
// CLOUD, SEEN FROM BELOW
// =============================================================
// A single flat plane a long way up, parked over the camera. At a hundred and
// fifty metres the parallax across a sixty metre field is not worth the
// trouble of a dome, but the uv is offset by where the camera actually is, so
// a cloud still sits over the same part of the world as you walk under it.
function makeCloudLayer(uCloudMap, uCloudScroll, uCloudScale, uCloudCut) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600, 1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      // Depth test on, unlike the rest of the sky. A transparent material is
      // drawn after every opaque one whatever its renderOrder, so without
      // this the cloud paints straight over the corn in front of it — and at
      // a hundred and fifty metres up there is real depth to test against.
      depthTest: true,
      fog: false,
      side: THREE.DoubleSide,
      uniforms: {
        uCloudMap: uCloudMap,
        uCloudScroll: uCloudScroll,
        uCloudScale: uCloudScale,
        uCloudCut: uCloudCut,
        uTint: { value: new THREE.Color(0xffffff) },
        uOpacity: { value: 0.85 }
      },
      vertexShader: /* glsl */`
        varying vec2 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uCloudMap;
        uniform vec2 uCloudScroll;
        uniform float uCloudScale;
        uniform float uCloudCut;
        uniform vec3 uTint;
        uniform float uOpacity;
        varying vec2 vWorld;
        void main() {
          vec2 uv = vWorld * uCloudScale + uCloudScroll;
          float n = texture2D(uCloudMap, uv).r;
          float a = smoothstep(uCloudCut, uCloudCut + 0.26, n);
          // Thicker cloud is darker underneath, and the thin edges catch more
          // light than the middle does.
          float thick = smoothstep(uCloudCut, uCloudCut + 0.55, n);
          vec3 col = uTint * (1.28 - 0.55 * thick);
          // Everything fades out toward the horizon, or the plane's own edge
          // becomes a straight line across the sky.
          float far = 1.0 - smoothstep(240.0, 700.0, length(vWorld - cameraPosition.xz));
          gl_FragColor = vec4(col, a * uOpacity * far);
        }
      `
    })
  );
  mesh.rotation.x = Math.PI / 2;
  mesh.renderOrder = -4;     // over the stars and the moon, under the world
  mesh.frustumCulled = false;
  return mesh;
}

// =============================================================
// CLOUD, SEEN FROM ABOVE
// =============================================================
// The same map again, this time as a multiplier on anything the sun lights.
// It wraps whatever onBeforeCompile the material already had, so the corn
// keeps its wind and the stubble keeps its flattened normal.
function patchCloudShadow(material, uCloudMap, uCloudScroll, uCloudScale, uCloudCut, uCloudShade) {
  if (material.userData.clouded) return;
  material.userData.clouded = true;

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    if (previous) previous.call(this, shader, renderer);

    shader.uniforms.uCloudMap = uCloudMap;
    shader.uniforms.uCloudScroll = uCloudScroll;
    shader.uniforms.uCloudScale = uCloudScale;
    shader.uniforms.uCloudCut = uCloudCut;
    shader.uniforms.uCloudShade = uCloudShade;

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCloudPos;')
      // After project_vertex, `transformed` is final — wind and all — so the
      // shadow lands on the leaf where the leaf actually ended up.
      .replace('#include <project_vertex>', [
        '#include <project_vertex>',
        '#ifdef USE_INSTANCING',
        '  vCloudPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;',
        '#else',
        '  vCloudPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        '#endif'
      ].join('\n'));

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vCloudPos;',
        'uniform sampler2D uCloudMap;',
        'uniform vec2 uCloudScroll;',
        'uniform float uCloudScale;',
        'uniform float uCloudCut;',
        'uniform float uCloudShade;'
      ].join('\n'))
      // Before the fog, not after it. Shading the haze as well would drag the
      // whole horizon down every time a cloud went over, and the horizon is
      // sky, not ground.
      .replace('#include <fog_fragment>', [
        'float cloudN = texture2D(uCloudMap, vCloudPos.xz * uCloudScale + uCloudScroll).r;',
        'gl_FragColor.rgb *= 1.0 - uCloudShade * smoothstep(uCloudCut, uCloudCut + 0.30, cloudN);',
        '#include <fog_fragment>'
      ].join('\n'));
  };
  material.needsUpdate = true;
}

// =============================================================
// RAIN
// =============================================================
// Short line segments rather than points, because a raindrop is a streak and
// a point sprite cannot lean. One draw call for the lot; the column follows
// the camera and wraps, so there is never any rain being simulated where the
// player cannot see it.
function makeRain() {
  const pos = new Float32Array(RAIN_COUNT * 6);
  const drops = new Float32Array(RAIN_COUNT * 4);   // x, y, z (camera-relative) and fall speed
  for (let i = 0; i < RAIN_COUNT; i++) {
    drops[i * 4] = (Math.random() - 0.5) * RAIN_BOX;
    drops[i * 4 + 1] = Math.random() * RAIN_TOP;
    drops[i * 4 + 2] = (Math.random() - 0.5) * RAIN_BOX;
    drops[i * 4 + 3] = 0.82 + Math.random() * 0.36;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
    color: 0xc8d6e0, transparent: true, opacity: 0, depthWrite: false, fog: true
  }));
  mesh.frustumCulled = false;
  mesh.visible = false;

  // A little off vertical, and the same direction the cloud is drifting.
  const LEAN_X = 0.16, LEAN_Z = 0.13;

  return {
    mesh: mesh,
    update: function (dt, cameraPosition, wet, night) {
      mesh.visible = wet > 0.01;
      if (!mesh.visible) return;

      // Rain reads as bright against a dark sky and dark against a bright
      // one; splitting the difference keeps it visible at both ends of the day.
      mesh.material.opacity = (0.30 + 0.16 * night) * Math.min(1, wet * 1.3);

      const len = 0.55 + 0.5 * wet;
      for (let i = 0; i < RAIN_COUNT; i++) {
        const b = i * 4;
        drops[b + 1] -= RAIN_FALL * drops[b + 3] * dt;
        drops[b] += LEAN_X * RAIN_FALL * drops[b + 3] * dt;
        drops[b + 2] += LEAN_Z * RAIN_FALL * drops[b + 3] * dt;

        if (drops[b + 1] < -3) {
          drops[b] = (Math.random() - 0.5) * RAIN_BOX;
          drops[b + 1] = RAIN_TOP;
          drops[b + 2] = (Math.random() - 0.5) * RAIN_BOX;
        }

        const x = cameraPosition.x + drops[b];
        const y = cameraPosition.y + drops[b + 1] - 1.4;
        const z = cameraPosition.z + drops[b + 2];
        const p = i * 6;
        pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
        pos[p + 3] = x - LEAN_X * len; pos[p + 4] = y + len; pos[p + 5] = z - LEAN_Z * len;
      }
      geo.attributes.position.needsUpdate = true;
    }
  };
}
