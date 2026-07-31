// The dome, the sun, the moon and the stars.
//
// Everything in here rides in one group that is parked on the camera each
// frame, so the sky is always the same distance away however far you walk.
// Nothing here writes depth or tests it: the group is drawn first, and the
// rest of the world is drawn over the top of it.

import * as THREE from 'three';

const SKY_R = 320;   // dome
const BODY_R = 300;  // sun and moon ride inside it
const STAR_R = 308;

// The sun rises here and sets on the opposite bearing. The original build put
// the afternoon sun on (-60, 26, 34); this is that bearing, flipped, so the
// arc still ends where the light was authored to come from.
const EAST = new THREE.Vector3(0.87, 0, -0.49).normalize();
// Horizontal, perpendicular to EAST — used only to tilt the arc.
const NORTH = new THREE.Vector3(0, 1, 0).cross(EAST).normalize();
// Tilting the arc off vertical keeps the sun from passing dead overhead,
// which is what makes a day read as late summer rather than the equator.
const TILT = 0.26;
const ARC_UP = new THREE.Vector3(0, 1, 0)
  .multiplyScalar(Math.cos(TILT))
  .addScaledVector(NORTH, Math.sin(TILT))
  .normalize();

// theta: 0 at sunrise, PI/2 overhead, PI at sunset, below the horizon beyond.
export function bodyPosition(theta, out) {
  return out
    .copy(EAST).multiplyScalar(Math.cos(theta))
    .addScaledVector(ARC_UP, Math.sin(theta))
    .multiplyScalar(BODY_R);
}

export function createSky(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const dome = addDome(group);
  const stars = addStars(group);
  const sunGlow = addGlow(group, 'rgba(255,244,214,0.95)', 'rgba(255,226,168,0.40)', 'rgba(255,226,168,0)');
  const moonGlow = addGlow(group, 'rgba(226,238,255,0.55)', 'rgba(176,200,246,0.16)', 'rgba(176,200,246,0)');
  const moon = addMoon(group);
  const shooting = addShootingStar(group);

  moonGlow.scale.set(72, 72, 1);

  const _v = new THREE.Vector3();

  return {
    // Called once a frame with everything the daylight cycle worked out.
    update: function (s, dt) {
      group.position.copy(s.cameraPosition);

      dome.material.uniforms.cTop.value.copy(s.skyTop);
      dome.material.uniforms.cMid.value.copy(s.skyMid);
      dome.material.uniforms.cBottom.value.copy(s.skyBottom);

      sunGlow.position.copy(bodyPosition(s.sunTheta, _v));
      sunGlow.material.color.copy(s.glowColor);
      sunGlow.material.opacity = s.glowOpacity;
      sunGlow.scale.set(s.glowScale, s.glowScale, 1);
      sunGlow.visible = s.glowOpacity > 0.01;

      bodyPosition(s.moonTheta, _v);
      moon.position.copy(_v);
      moon.lookAt(group.position);
      moonGlow.position.copy(_v).multiplyScalar(0.97);
      moon.material.uniforms.uTilt.value = sunAngleOnDisc(_v, s.sunTheta);

      // The moon fades out in daylight rather than vanishing at the horizon —
      // a pale daytime moon is one of the nicer things to catch sight of.
      const above = smoothstep(-0.06, 0.05, _v.y / BODY_R);
      const litFraction = 0.5 - 0.5 * Math.cos(s.moonPhi);
      moon.material.uniforms.uPhi.value = s.moonPhi;
      moon.material.uniforms.uOpacity.value = above * (0.30 + 0.70 * s.night);
      moon.visible = above > 0.01;
      moonGlow.material.opacity = above * s.night * (0.12 + 0.88 * litFraction);
      moonGlow.visible = moonGlow.material.opacity > 0.01;

      stars.material.uniforms.uOpacity.value = s.starOpacity;
      stars.material.uniforms.uTime.value = s.time;
      stars.visible = s.starOpacity > 0.01;

      shooting.update(dt, s.starOpacity);
    }
  };
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Which way the sun lies, measured on the face of the moon's billboard.
//
// The lit side of the moon always points at the sun, so the terminator has to
// be drawn on that axis and not on a fixed screen axis — otherwise a crescent
// hangs the wrong way up, which is exactly the sort of thing anybody who
// looks at the sky will notice immediately.
//
// This reproduces the basis Object3D.lookAt built, so the angle is in the
// same frame as the quad's own uvs.
const _up = new THREE.Vector3(0, 1, 0);
const _zAxis = new THREE.Vector3();
const _xAxis = new THREE.Vector3();
const _yAxis = new THREE.Vector3();
const _sunDir = new THREE.Vector3();

function sunAngleOnDisc(moonPos, sunTheta) {
  _zAxis.copy(moonPos).negate().normalize();
  _xAxis.crossVectors(_up, _zAxis);
  // Degenerate when the moon is at the zenith; any roll will do there.
  if (_xAxis.lengthSq() < 1e-8) return 0;
  _xAxis.normalize();
  _yAxis.crossVectors(_zAxis, _xAxis);

  bodyPosition(sunTheta, _sunDir).normalize();
  return Math.atan2(_sunDir.dot(_yAxis), _sunDir.dot(_xAxis));
}

function addDome(group) {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_R, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
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
  dome.frustumCulled = false;
  dome.renderOrder = -10;
  group.add(dome);
  return dome;
}

// A soft disc, used for both the sun's haze and the moon's halo.
function addGlow(group, inner, mid, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, inner);
  grad.addColorStop(0.35, mid);
  grad.addColorStop(1.0, outer);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);

  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c), transparent: true,
    depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false
  }));
  spr.scale.set(90, 90, 1);
  spr.renderOrder = -8;
  group.add(spr);
  return spr;
}

// The moon is a billboarded disc with the terminator drawn in the fragment
// shader, so the phase costs nothing and stays crisp at any size.
function addMoon(group) {
  const moon = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 32),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uPhi: { value: Math.PI },
        uTilt: { value: 0 },
        uOpacity: { value: 1 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      // uPhi is the phase angle: 0 new, PI full. uTilt rolls the disc so that
      // +x points at the sun, which is what lets one expression cover the
      // whole month: the lit hemisphere always faces the sun, so the
      // terminator is always the ellipse x = cos(phi) * sqrt(1 - y*y) and
      // everything to its sunward side is lit. Crescent, quarter, gibbous and
      // the waning half all fall out of that without a branch.
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        uniform float uPhi;
        uniform float uTilt;
        uniform float uOpacity;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float disc = smoothstep(1.0, 0.955, r);
          if (disc <= 0.001) discard;

          float ct = cos(uTilt), st = sin(uTilt);
          vec2 q = vec2(p.x * ct + p.y * st, -p.x * st + p.y * ct);

          float s = sqrt(max(0.0, 1.0 - q.y * q.y));
          float soft = 0.05;
          float lit = smoothstep(cos(uPhi) * s - soft, cos(uPhi) * s + soft, q.x);

          // The dark patches belong to the moon's own face, so they stay in
          // p and do not swing round with the sun.
          float maria = 0.55 * smoothstep(0.36, 0.02, length(p - vec2(-0.24, 0.22)))
                      + 0.42 * smoothstep(0.27, 0.02, length(p - vec2( 0.18, 0.34)))
                      + 0.34 * smoothstep(0.31, 0.02, length(p - vec2( 0.04, -0.30)))
                      + 0.22 * smoothstep(0.18, 0.02, length(p - vec2(-0.34, -0.18)));

          vec3 base = vec3(0.98, 0.965, 0.915) * (1.0 - maria * 0.20);
          base *= 1.0 - 0.28 * smoothstep(0.45, 1.0, r);

          // Earthshine: the unlit disc stays faintly there, strongest when the
          // moon is a thin crescent. It is what stops a crescent reading as a
          // cut-out shape rather than a sphere.
          float earth = 0.075 * (0.5 + 0.5 * cos(uPhi));
          vec3 col = base * (lit + earth * (1.0 - lit));

          gl_FragColor = vec4(col, disc * uOpacity);
        }
      `
    })
  );
  moon.renderOrder = -6;
  group.add(moon);
  return moon;
}

const STAR_COUNT = 1500;

function addStars(group) {
  const pos = new Float32Array(STAR_COUNT * 3);
  const size = new Float32Array(STAR_COUNT);
  const phase = new Float32Array(STAR_COUNT);
  const col = new Float32Array(STAR_COUNT * 3);

  // A great circle for the milky way: two vectors in its plane, one normal.
  const bn = new THREE.Vector3(0.42, 0.72, -0.55).normalize();
  const bu = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), bn).normalize();
  const bv = new THREE.Vector3().crossVectors(bn, bu).normalize();

  const v = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    // Two in five stars are pulled into the band. It is not accurate, it just
    // stops the sky reading as evenly scattered salt.
    if (i % 5 < 2) {
      const a = Math.random() * Math.PI * 2;
      const off = (Math.random() + Math.random() + Math.random() - 1.5) * 0.17;
      v.copy(bu).multiplyScalar(Math.cos(a))
       .addScaledVector(bv, Math.sin(a))
       .addScaledVector(bn, off);
    } else {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() < 0.02) v.set(0, 1, 0);
    }
    v.normalize();
    // Nothing below the horizon: they would otherwise show through the gaps
    // in the far corn, which reads as holes in the world.
    v.y = Math.abs(v.y) * 0.98 + 0.02;
    v.normalize().multiplyScalar(STAR_R);

    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;

    const bright = Math.random();
    size[i] = 1.0 + bright * bright * 3.4;
    phase[i] = Math.random();

    // Mostly white, a few tipped warm or blue.
    const tint = Math.random();
    const warm = tint > 0.86, cool = tint < 0.18;
    col[i * 3] = warm ? 1.0 : (cool ? 0.78 : 0.96);
    col[i * 3 + 1] = warm ? 0.88 : (cool ? 0.86 : 0.96);
    col[i * 3 + 2] = warm ? 0.72 : 1.0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));

  const stars = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    vertexShader: /* glsl */`
      attribute float aSize;
      attribute float aPhase;
      attribute vec3 aColor;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // Two incommensurate rates, so no star settles into a visible beat.
        float tw = 0.72 + 0.18 * sin(uTime * 1.9 + aPhase * 41.0)
                        + 0.10 * sin(uTime * 0.7 + aPhase * 17.0);
        vTwinkle = tw;
        vColor = aColor;
        gl_PointSize = aSize * uPixelRatio * (0.7 + 0.3 * tw);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.06, d);
        gl_FragColor = vec4(vColor, a * uOpacity * vTwinkle);
      }
    `
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  group.add(stars);
  return stars;
}

// Rare, brief, and never announced. Something to be glad you looked up for.
function addShootingStar(group) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));

  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
    color: 0xdfe9ff, transparent: true, opacity: 0,
    depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false
  }));
  line.frustumCulled = false;
  line.renderOrder = -5;
  line.visible = false;
  group.add(line);

  const from = new THREE.Vector3();
  const dir = new THREE.Vector3();
  let wait = 14 + Math.random() * 40;
  let life = 0;

  function launch() {
    from.set(Math.random() * 2 - 1, 0.25 + Math.random() * 0.7, Math.random() * 2 - 1)
        .normalize().multiplyScalar(STAR_R);
    dir.set(Math.random() * 2 - 1, -0.35 - Math.random() * 0.4, Math.random() * 2 - 1)
       .normalize();
    life = 1;
  }

  return {
    update: function (dt, starOpacity) {
      if (starOpacity < 0.35) { line.visible = false; return; }

      if (life <= 0) {
        wait -= dt;
        if (wait > 0) { line.visible = false; return; }
        wait = 16 + Math.random() * 55;
        launch();
      }

      life -= dt * 1.6;
      const p = line.geometry.attributes.position.array;
      const travel = (1 - life) * 130;
      const tail = 34;
      p[0] = from.x + dir.x * travel;
      p[1] = from.y + dir.y * travel;
      p[2] = from.z + dir.z * travel;
      p[3] = p[0] - dir.x * tail;
      p[4] = p[1] - dir.y * tail;
      p[5] = p[2] - dir.z * tail;
      line.geometry.attributes.position.needsUpdate = true;
      line.material.opacity = Math.max(0, Math.sin(Math.max(0, life) * Math.PI)) * starOpacity;
      line.visible = life > 0;
    }
  };
}
