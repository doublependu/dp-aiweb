// Doors in the corn.
//
// Eight of them, set flush into the corn walls and facing down the corridors,
// each one a way out of this field and into somebody else's. The reference is
// the nether portal — a standing sheet of violet you can walk into — but that
// one is a flat rectangle of scrolling noise, and this is a scene with weather
// in it, so the sheet here is domain-warped, brightest where you would step
// through, feathered at the edges and framed in hewn stone rather than ending
// on a hard rectangle.
//
// Three things about the way they are built matter:
//
// A portal adds no light to the scene. The corn is one instanced mesh of ~11k
// quads and lanterns.js explains what a fourth PointLight costs; a portal
// would be a fifth. What it has instead is an emissive surface, a glow sprite
// and an additive pool painted on the ground in front of it, which from inside
// a corridor is indistinguishable from a light and is free.
//
// A portal sits *against* a wall, not across a corridor, so there is no way to
// stumble through one you were only walking past, and no way to overshoot —
// the corn is behind it. Player collision already stops you 0.24m short of the
// corn, which puts you pressed up against the sheet at the moment it takes you.
//
// And going through is not instant. Leaving the field by accident would be the
// harshest thing in the piece, so the threshold charges over about six tenths
// of a second of standing in it and lets go again, faster, if you step back.
// Walking in still feels immediate. Brushing past does nothing at all.

import * as THREE from 'three';
import { FINE, CELL, CLEARING_C, CLEARING_HALF, toWorld } from './maze.js';

// The far side of each door. A destination with no `name` gets no sign: a box
// of toys nobody labelled, and a field of maize reached from a field of maize.
// Each carries its own three colours, so eight doors in one maze are eight
// different violets rather than eight copies of one.
export const DESTINATIONS = [
  {
    url: 'https://wave-racer.vercel.app/',
    name: 'Wave Racer', line: 'salt water, at speed', art: 'wave',
    a: 0x0d1a5c, b: 0x4a4bd6, c: 0xd8e6ff
  },
  {
    url: 'https://apex-formula-2026.vercel.app/',
    name: 'Apex Formula 2026', line: 'the racing line', art: 'race',
    a: 0x3d0733, b: 0xc02a8e, c: 0xffd8f2
  },
  {
    url: 'https://genex.games/world/skate',
    name: 'Skate', line: 'concrete and gravity', art: 'skate',
    a: 0x2a0b52, b: 0x9b3bd8, c: 0xf0d0ff
  },
  {
    url: 'https://play.mint.gg/complete-shelf',
    name: 'Complete Shelf', line: 'put it all in order', art: 'shelf',
    a: 0x1e1240, b: 0x6a5ad8, c: 0xdcd6ff
  },
  {
    url: 'https://starknightt.github.io/operation-ironhold/',
    name: 'Operation Ironhold', line: 'hold the line', art: 'ironhold',
    a: 0x2b0a2e, b: 0x7b2fb0, c: 0xe6c8ff
  },
  {
    url: 'https://nuketown.luckeysystems.com/',
    name: 'Nuketown', line: 'a town, briefly', art: 'nuketown',
    a: 0x3a0d3a, b: 0xa733c0, c: 0xffd6f6
  },
  { url: 'https://mrdoob.github.io/toys/', a: 0x230f4a, b: 0x8f3fd0, c: 0xf2dcff },
  { url: 'https://maize.live', a: 0x2e0e4e, b: 0x8a34c8, c: 0xf6dcc8 }
];

const OPEN_W = 1.50;         // the gap you walk through
const OPEN_H = 2.55;         // shorter than the corn, so the wall keeps its top edge
const JAMB = 0.26;           // thickness of the stone either side
const DEEP = 0.20;           // how far the frame stands out of the corn

const TRIGGER = 0.42;        // metres from the sheet before it starts taking you
const CHARGE_UP = 1.7;       // 1/seconds to commit
const CHARGE_DOWN = 2.6;     // and rather faster to change your mind

const MOTES = 34;            // drifting specks per portal

// `avoid` is everything already standing in the corridors — lantern posts,
// mostly. A lantern hangs out over the path at about a metre from the wall,
// which is exactly where somebody walking into a door has to be, and its
// collision circle would quietly make that door unreachable.
export function createPortals(isOpen, rooms, entrance, exit, avoid, onEnter) {
  const group = new THREE.Group();
  const obstacles = [];
  const portals = [];

  const spots = chooseSpots(isOpen, rooms, entrance, exit, avoid || [], DESTINATIONS.length);

  // Obsidian, but weathered enough to belong in a field. Violet in the black,
  // so the frame reads as the same substance as the sheet it holds.
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x241a30, roughness: 0.52, metalness: 0.30, flatShading: true
  });
  const glowTex = makeGlowTexture();
  const poolTex = makePoolTexture();
  const moteTex = makeMoteTexture();

  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const dest = DESTINATIONS[i];

    const p = new THREE.Group();
    p.position.set(s.x, 0, s.z);
    // Local +z points out of the corn and down the corridor, so everything
    // below can be laid out as though the wall were behind the reader.
    p.rotation.y = Math.atan2(s.outX, s.outZ);
    group.add(p);

    buildFrame(p, stoneMat);

    // What the sheet is drawn on. The sheet is additive, so without this you
    // see the corn standing behind the doorway straight through it, and a
    // portal you can see the corn through is a purple curtain rather than a
    // hole. Unfogged and nearly black: a hole does not haze with distance, and
    // black is the only backdrop the sheet's own colours stay true against.
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(OPEN_W + 0.04, OPEN_H + 0.04),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(dest.a).multiplyScalar(0.30), fog: false
      })
    );
    back.position.set(0, OPEN_H / 2, -0.04);
    p.add(back);

    const mat = makeSheetMaterial(dest);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(OPEN_W, OPEN_H), mat);
    sheet.position.set(0, OPEN_H / 2, 0);
    p.add(sheet);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: dest.b, transparent: true, opacity: 0.4,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    halo.scale.set(4.4, 4.4, 1);
    halo.position.set(0, OPEN_H * 0.52, 0.05);
    p.add(halo);

    // The light it does not have. An additive smear on the floor in front of
    // the door, which after dark is the whole reason a portal reads as lit.
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({
        map: poolTex, color: dest.b, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.025, 1.25);
    p.add(pool);

    const motes = makeMotes(p, dest, moteTex);

    if (dest.name) {
      const side = s.signSide;
      const sign = makeSign(dest);
      sign.position.set(side * 1.15, 0, 0.85);
      sign.rotation.y = -side * 0.45;
      p.add(sign);
      obstacles.push({
        x: s.x + s.rightX * side * 1.15 + s.outX * 0.85,
        z: s.z + s.rightZ * side * 1.15 + s.outZ * 0.85,
        r: 0.34
      });
    }

    portals.push({
      dest: dest,
      x: s.x, z: s.z,
      nx: s.outX, nz: s.outZ,       // out of the wall
      rx: s.rightX, rz: s.rightZ,   // along it
      mat: mat, halo: halo, pool: pool, motes: motes,
      charge: 0, near: 0, locked: false
    });
  }

  let taken = null;   // set once, when a door has decided it has you

  return {
    group: group,
    obstacles: obstacles,

    // How much portal is in earshot, 0..1. Read by the sound.
    level: 0,

    // Come back through the browser's back button and you are restored exactly
    // where you were standing — which is *inside* the door you just left
    // through. It would start charging on the first frame and throw you
    // straight back out, over and over, and there would be no way home.
    //
    // So a restored field locks every door, and each one lets itself go again
    // the first frame it can see you are not in it. Every portal you are not
    // standing in unlocks immediately; the one you are standing in unlocks as
    // you step clear of it, and works normally when you walk back in. Nothing
    // has to remember to switch this off, which is the only reason it is safe
    // — `update` runs before you have started and after you have gone.
    lockAll: function () {
      taken = null;
      for (let i = 0; i < portals.length; i++) {
        portals[i].locked = true;
        portals[i].charge = 0;
      }
    },

    update: function (dt, t, playerPos, night) {
      let loudest = 0;

      for (let i = 0; i < portals.length; i++) {
        const p = portals[i];

        const dx = playerPos.x - p.x, dz = playerPos.z - p.z;
        // How far out from the wall you are, and how far along it.
        const along = dx * p.nx + dz * p.nz;
        const side = dx * p.rx + dz * p.rz;
        const range = Math.sqrt(dx * dx + dz * dz);

        // Only the sheet itself counts: standing beside a portal is standing
        // beside a portal.
        //
        // `along` is how far out from the sheet you are. Walked all the way in,
        // it settles at about +0.21 — collision holds you a body's width off
        // the corn, and the corn is 0.06m behind the sheet — so the reachable
        // band is roughly 0.21 to 0.42 and standing in the door keeps charging.
        // The negative slack guards nothing real, since the corn is behind the
        // sheet and there is no way round to the other side of it.
        const inDoor = along > -0.2 && along < TRIGGER && Math.abs(side) < OPEN_W * 0.5;

        if (p.locked) {
          // Held until you have been seen out of it once. It still lets go of
          // whatever charge it was carrying, so a door restored mid-commit
          // settles back down instead of sitting pinned at its brightest.
          if (!inDoor) p.locked = false;
          p.charge = Math.max(0, p.charge - CHARGE_DOWN * dt);
        } else if (!taken) {
          p.charge = Math.max(0, Math.min(1,
            p.charge + (inDoor ? CHARGE_UP : -CHARGE_DOWN) * dt));
          if (p.charge >= 1) {
            taken = p.dest;
            if (onEnter) onEnter(p.dest);
          }
        }

        // Awareness runs on plain distance, so a door round the corner still
        // pulls at the sound and still stirs before you have seen it.
        p.near = Math.max(0, 1 - range / 7);
        loudest = Math.max(loudest, Math.max(p.near, p.charge));

        p.mat.uniforms.uTime.value = t;
        p.mat.uniforms.uCharge.value = p.charge;
        p.mat.uniforms.uNear.value = p.near;

        // Everything else comes up with the door: the halo, the pool on the
        // floor, and how fast the specks come off it.
        const lift = 0.5 + p.near * 0.35 + p.charge * 1.6;
        p.halo.material.opacity = 0.30 * lift;
        p.halo.scale.setScalar(4.4 + p.charge * 1.6);
        p.pool.material.opacity = (0.16 + 0.30 * night) * lift;

        stepMotes(p.motes, dt, 1 + p.charge * 2.2);
      }

      this.level = loudest;
    }
  };
}

// =============================================================
// THE SHEET
// =============================================================
// Value-noise fbm warped by two more samples of itself, so the flow curls
// instead of scrolling, under an elliptical mask that feathers into the frame.
// The hard rectangle is what gives the nether portal away as a texture; a
// feathered edge with a bright rim reads as a hole with something behind it.
function makeSheetMaterial(dest) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uCharge: { value: 0 },
      uNear: { value: 0 },
      uA: { value: new THREE.Color(dest.a) },
      uB: { value: new THREE.Color(dest.b) },
      uC: { value: new THREE.Color(dest.c) }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() {',
      '  vUv = uv;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime;',
      'uniform float uCharge;',
      'uniform float uNear;',
      'uniform vec3 uA;',
      'uniform vec3 uB;',
      'uniform vec3 uC;',
      'varying vec2 vUv;',

      'float hash(vec2 p) {',
      '  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);',
      '}',

      'float vnoise(vec2 p) {',
      '  vec2 i = floor(p), f = fract(p);',
      '  vec2 u = f * f * (3.0 - 2.0 * f);',
      '  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
      '             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
      '}',

      'float fbm(vec2 p) {',
      '  float s = 0.0, a = 0.5;',
      '  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }',
      '  return s;',
      '}',

      'void main() {',
      '  vec2 uv = vUv - 0.5;',
      // Feathered per axis rather than on a radius. A radial mask on a door
      // twice as tall as it is wide gives an oval hanging inside the frame
      // with daylight down both sides of it; this fills the opening and only
      // softens in the last few centimetres, so the stone has something to
      // hold and the corners round off on their own.
      '  float fx = 1.0 - smoothstep(0.33, 0.495, abs(uv.x));',
      '  float fy = 1.0 - smoothstep(0.37, 0.497, abs(uv.y));',
      '  float mask = fx * fy;',
      // Still a circle for the shading, so the middle of the sheet is the
      // bright part whatever shape the opening is.
      '  float r = length(uv * vec2(1.0, 0.62));',

      '  float t = uTime * (0.30 + uCharge * 0.55);',
      '  vec2 p = uv * vec2(3.4, 2.1);',
      '  vec2 w = vec2(fbm(p + vec2(0.0, -t)),',
      '                fbm(p + vec2(5.2, 1.3) + vec2(t * 0.4, -t * 0.7)));',
      '  float n = fbm(p + w * 1.7 + vec2(0.0, -t * 1.4));',

      '  vec3 col = mix(uA, uB, smoothstep(0.16, 0.68, n));',
      '  col = mix(col, uC, smoothstep(0.70, 0.98, n));',

      // Vertical draw, stretched hard across x. This is the one thing the
      // nether portal gets exactly right: the sheet has to be falling.
      '  float streak = fbm(vec2(uv.x * 11.0, uv.y * 1.5 - uTime * 0.85));',
      '  col += uC * pow(streak, 3.0) * 0.8;',

      // Darker toward the frame, brightest where you would step through.
      '  float depth = 1.0 - smoothstep(0.0, 0.34, r);',
      '  col *= 0.72 + depth * 1.35;',

      // Peaks where the sheet is half faded, which is a band just inside the
      // stone — the sheet lighting the frame it is held in.
      '  float rim = mask * (1.0 - mask) * 4.0;',
      '  col += uC * rim * 0.32;',

      '  float a = mask * (0.46 + 0.60 * smoothstep(0.22, 0.92, n)) + rim * 0.18;',

      // The door notices you before you are in it.
      '  col *= 1.0 + uNear * 0.25 + uCharge * 1.8;',
      '  a = clamp(a * (1.0 + uCharge * 0.7), 0.0, 1.0);',

      '  gl_FragColor = vec4(col, a);',
      '}'
    ].join('\n')
  });
}

// =============================================================
// THE FRAME
// =============================================================
// Two jambs, a lintel, a threshold stone and four turned corner blocks, each
// knocked about at the vertices so the door looks quarried rather than
// extruded. Flat shading turns every dent into its own face — the same trick
// the garden's rocks use.
function buildFrame(parent, mat) {
  const W = OPEN_W + JAMB * 2;

  const blocks = [
    [OPEN_W * 0.5 + JAMB * 0.5, (OPEN_H + JAMB) * 0.5, JAMB, OPEN_H + JAMB, DEEP],
    [-(OPEN_W * 0.5 + JAMB * 0.5), (OPEN_H + JAMB) * 0.5, JAMB, OPEN_H + JAMB, DEEP],
    [0, OPEN_H + JAMB * 0.5, W, JAMB, DEEP],
    [0, JAMB * 0.28, W, JAMB * 0.56, DEEP * 1.5]
  ];

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const geo = hew(new THREE.BoxGeometry(b[2], b[3], b[4], 2, 3, 1), 0.022);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(b[0], b[1], -DEEP * 0.4);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
  }

  for (let i = 0; i < 4; i++) {
    const geo = hew(new THREE.BoxGeometry(JAMB * 1.15, JAMB * 1.15, DEEP * 1.15), 0.03);
    const m = new THREE.Mesh(geo, mat);
    m.position.set((i % 2 ? 1 : -1) * (OPEN_W * 0.5 + JAMB * 0.5),
                   i < 2 ? OPEN_H + JAMB * 0.5 : JAMB * 0.3,
                   -DEEP * 0.4);
    m.rotation.z = (Math.random() - 0.5) * 0.16;
    m.castShadow = true;
    parent.add(m);
  }
}

function hew(geo, amount) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i,
      p.getX(i) + (Math.random() - 0.5) * amount,
      p.getY(i) + (Math.random() - 0.5) * amount,
      p.getZ(i) + (Math.random() - 0.5) * amount);
  }
  geo.computeVertexNormals();
  return geo;
}

// =============================================================
// MOTES
// =============================================================
// Specks that come off the sheet and go out and up. One Points cloud per
// portal in the portal's own frame, so the whole thing turns with the group
// and the update never has to think about world space.
function makeMotes(parent, dest, tex) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(MOTES * 3);
  const vel = new Float32Array(MOTES * 3);
  const life = new Float32Array(MOTES);

  for (let i = 0; i < MOTES; i++) {
    seedMote(pos, vel, life, i);
    life[i] = Math.random();     // staggered, or they all leave together
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const points = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.065, map: tex, color: dest.c, transparent: true, opacity: 0.6,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  parent.add(points);

  return { geo: geo, pos: pos, vel: vel, life: life };
}

function seedMote(pos, vel, life, i) {
  pos[i * 3] = (Math.random() - 0.5) * OPEN_W * 0.85;
  pos[i * 3 + 1] = Math.random() * OPEN_H;
  pos[i * 3 + 2] = 0.02;
  vel[i * 3] = (Math.random() - 0.5) * 0.16;
  vel[i * 3 + 1] = 0.12 + Math.random() * 0.30;
  vel[i * 3 + 2] = 0.10 + Math.random() * 0.34;
  life[i] = 0;
}

function stepMotes(m, dt, rate) {
  const pos = m.pos, vel = m.vel, life = m.life;
  for (let i = 0; i < MOTES; i++) {
    life[i] += dt * 0.34 * rate;
    if (life[i] >= 1) { seedMote(pos, vel, life, i); continue; }
    pos[i * 3] += vel[i * 3] * dt * rate;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt * rate;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt * rate;
  }
  m.geo.attributes.position.needsUpdate = true;
}

// =============================================================
// SIGNS
// =============================================================
// A painted board on two posts, standing off to one side where you walk past
// it on the way in. There is no way to put a screenshot of the far side of a
// door on it without a network round trip and a file on disk, and this project
// stays one clone away from running — so what goes on the board is a painting
// of the place rather than a picture of it. Closer to the hand-lettered sign
// outside a fairground ride than to a thumbnail, which is the right register
// for a board nailed up in a corn maze anyway.
function makeSign(dest) {
  const g = new THREE.Group();

  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4629, roughness: 0.95 });
  const postGeo = new THREE.CylinderGeometry(0.038, 0.046, 1.02, 6);
  for (let i = 0; i < 2; i++) {
    const post = new THREE.Mesh(postGeo, wood);
    post.position.set((i ? 1 : -1) * 0.33, 0.51, 0);
    post.rotation.z = (Math.random() - 0.5) * 0.04;
    post.castShadow = true;
    g.add(post);
  }

  const face = new THREE.MeshStandardMaterial({
    map: makeBoardTexture(dest), roughness: 0.88
  });
  // Only the front is painted; the other five faces are the back of a board.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.72, 0.045),
    [wood, wood, wood, wood, face, wood]
  );
  board.position.set(0, 1.36, 0.01);
  board.castShadow = true;
  board.receiveShadow = true;
  g.add(board);

  return g;
}

function makeBoardTexture(dest) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 384;
  const g = c.getContext('2d');

  // a planed board, with the grain running across it
  g.fillStyle = '#6d5735';
  g.fillRect(0, 0, 512, 384);
  for (let i = 0; i < 220; i++) {
    const y = Math.random() * 384;
    g.strokeStyle = 'rgba(' + ((60 + Math.random() * 50) | 0) + ',' +
                    ((44 + Math.random() * 40) | 0) + ',22,' +
                    (0.05 + Math.random() * 0.18) + ')';
    g.lineWidth = 0.6 + Math.random() * 2.4;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(170, y + (Math.random() - 0.5) * 9,
                    340, y + (Math.random() - 0.5) * 9, 512, y);
    g.stroke();
  }

  const panel = { x: 26, y: 24, w: 460, h: 208 };
  g.save();
  g.beginPath();
  g.rect(panel.x, panel.y, panel.w, panel.h);
  g.clip();
  paintPanel(g, dest.art, panel);
  g.restore();

  // a painted keyline round the picture, and one round the board
  g.strokeStyle = 'rgba(240,226,192,0.62)';
  g.lineWidth = 3;
  g.strokeRect(panel.x, panel.y, panel.w, panel.h);
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(240,226,192,0.34)';
  g.strokeRect(10, 10, 492, 364);

  g.textAlign = 'center';
  g.shadowColor = 'rgba(28,18,4,0.75)';
  g.shadowBlur = 6;
  g.fillStyle = '#f6e8c6';
  fitText(g, dest.name, 448, 38);
  g.fillText(dest.name, 256, 292);

  g.font = 'italic 22px Georgia, serif';
  g.fillStyle = 'rgba(232,210,166,0.82)';
  g.fillText(dest.line, 256, 330);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  return tex;
}

// Long names on a small board. Shrinks the type rather than clipping it, and
// leaves the chosen size set on the context.
function fitText(g, text, max, size) {
  let s = size;
  g.font = s + 'px Georgia, serif';
  while (s > 20 && g.measureText(text).width > max) {
    s -= 2;
    g.font = s + 'px Georgia, serif';
  }
}

function paintPanel(g, art, r) {
  const x = r.x, y = r.y, w = r.w, h = r.h;

  function sky(top, bottom) {
    const lg = g.createLinearGradient(0, y, 0, y + h);
    lg.addColorStop(0, top); lg.addColorStop(1, bottom);
    g.fillStyle = lg; g.fillRect(x, y, w, h);
  }

  if (art === 'wave') {
    sky('#123a63', '#2b7f9e');
    g.fillStyle = '#0d2c4d';
    g.beginPath();
    g.moveTo(x, y + h);
    g.bezierCurveTo(x + w * 0.20, y + h * 0.30, x + w * 0.52, y + h * 0.16,
                    x + w * 0.72, y + h * 0.52);
    g.bezierCurveTo(x + w * 0.82, y + h * 0.72, x + w * 0.90, y + h * 0.62,
                    x + w, y + h * 0.70);
    g.lineTo(x + w, y + h); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(226,244,255,0.85)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(x + w * 0.02, y + h * 0.92);
    g.bezierCurveTo(x + w * 0.22, y + h * 0.32, x + w * 0.52, y + h * 0.18,
                    x + w * 0.73, y + h * 0.54);
    g.stroke();
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(238,250,255,' + (0.2 + Math.random() * 0.6) + ')';
      g.beginPath();
      g.arc(x + w * (0.45 + Math.random() * 0.34), y + h * (0.14 + Math.random() * 0.34),
            1 + Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#f2c14a';
    g.beginPath();
    g.moveTo(x + w * 0.80, y + h * 0.60);
    g.lineTo(x + w * 0.92, y + h * 0.66);
    g.lineTo(x + w * 0.80, y + h * 0.70);
    g.closePath(); g.fill();

  } else if (art === 'race') {
    sky('#1b1b22', '#33323c');
    g.fillStyle = '#26262c';
    g.beginPath();
    g.moveTo(x - 20, y + h);
    g.lineTo(x + w * 0.40, y + h * 0.18);
    g.lineTo(x + w * 0.56, y + h * 0.18);
    g.lineTo(x + w + 20, y + h);
    g.closePath(); g.fill();
    // kerb, running away with the track
    for (let i = 0; i < 9; i++) {
      const f0 = i / 9, f1 = (i + 0.5) / 9;
      g.fillStyle = i % 2 ? '#e8e4dc' : '#c8302f';
      g.beginPath();
      g.moveTo(x + w * (0.40 - 0.42 * f0) - 14, y + h * (0.18 + 0.82 * f0));
      g.lineTo(x + w * (0.40 - 0.42 * f1) - 14, y + h * (0.18 + 0.82 * f1));
      g.lineTo(x + w * (0.40 - 0.42 * f1) - 34, y + h * (0.18 + 0.82 * f1));
      g.lineTo(x + w * (0.40 - 0.42 * f0) - 34, y + h * (0.18 + 0.82 * f0));
      g.closePath(); g.fill();
    }
    g.strokeStyle = 'rgba(240,238,230,0.8)';
    g.lineWidth = 4;
    g.setLineDash([16, 22]);
    g.beginPath();
    g.moveTo(x + w * 0.52, y + h * 0.20);
    g.lineTo(x + w * 0.60, y + h);
    g.stroke();
    g.setLineDash([]);
    // the car: a wedge and a wing, nothing more
    g.fillStyle = '#e0344f';
    g.beginPath();
    g.moveTo(x + w * 0.42, y + h * 0.92);
    g.lineTo(x + w * 0.66, y + h * 0.80);
    g.lineTo(x + w * 0.62, y + h * 0.62);
    g.lineTo(x + w * 0.44, y + h * 0.66);
    g.closePath(); g.fill();
    g.fillStyle = '#1c1c22';
    g.fillRect(x + w * 0.40, y + h * 0.86, w * 0.30, h * 0.06);

  } else if (art === 'skate') {
    sky('#c9924a', '#e8c98a');
    g.fillStyle = '#8f8b84';
    g.beginPath();
    g.moveTo(x, y + h * 0.42);
    g.bezierCurveTo(x + w * 0.26, y + h * 0.98, x + w * 0.74, y + h * 0.98,
                    x + w, y + h * 0.42);
    g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(60,56,50,0.4)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y + h * 0.52);
    g.bezierCurveTo(x + w * 0.26, y + h * 1.04, x + w * 0.74, y + h * 1.04,
                    x + w, y + h * 0.52);
    g.stroke();
    // a skater, airborne over the lip
    g.fillStyle = '#20201e';
    g.beginPath();
    g.arc(x + w * 0.68, y + h * 0.22, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#20201e';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(x + w * 0.68, y + h * 0.30);
    g.lineTo(x + w * 0.72, y + h * 0.48);
    g.lineTo(x + w * 0.63, y + h * 0.60);
    g.stroke();
    g.beginPath();
    g.moveTo(x + w * 0.69, y + h * 0.36);
    g.lineTo(x + w * 0.58, y + h * 0.44);
    g.stroke();
    g.save();
    g.translate(x + w * 0.63, y + h * 0.63);
    g.rotate(-0.5);
    g.fillStyle = '#d9483e';
    g.fillRect(-34, -5, 68, 10);
    g.restore();

  } else if (art === 'shelf') {
    sky('#3a2e46', '#54415c');
    const cols = ['#d8a45a', '#7fb0c4', '#c96f6a', '#8fae72', '#e0cf9a', '#9a7fc4'];
    for (let row = 0; row < 3; row++) {
      const sy = y + h * (0.26 + row * 0.25);
      g.fillStyle = '#8a6a3e';
      g.fillRect(x + w * 0.10, sy, w * 0.80, 9);
      let bx = x + w * 0.12;
      while (bx < x + w * 0.86) {
        const bw = 16 + Math.random() * 26;
        const bh = 26 + Math.random() * 22;
        // one gap on the middle shelf: the whole point is that it is not done
        if (!(row === 1 && bx > x + w * 0.46 && bx < x + w * 0.60)) {
          g.fillStyle = cols[(Math.random() * cols.length) | 0];
          g.fillRect(bx, sy - bh, bw, bh);
          g.fillStyle = 'rgba(0,0,0,0.22)';
          g.fillRect(bx, sy - bh, bw, 5);
        }
        bx += bw + 4;
      }
    }

  } else if (art === 'ironhold') {
    sky('#101822', '#25313d');
    // the searchlight first, so the fort stands in front of it
    const lg = g.createLinearGradient(x + w * 0.20, y + h, x + w * 0.62, y);
    lg.addColorStop(0, 'rgba(220,232,255,0.28)');
    lg.addColorStop(1, 'rgba(220,232,255,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(x + w * 0.24, y + h * 0.70);
    g.lineTo(x + w * 0.70, y); g.lineTo(x + w * 0.94, y);
    g.closePath(); g.fill();
    g.fillStyle = '#141a1f';
    g.fillRect(x, y + h * 0.62, w, h * 0.38);
    const towers = [[0.08, 0.34], [0.30, 0.46], [0.56, 0.30], [0.78, 0.42]];
    for (let i = 0; i < towers.length; i++) {
      const tx = x + w * towers[i][0], th = h * towers[i][1];
      g.fillRect(tx, y + h - th - h * 0.30, w * 0.13, th + h * 0.30);
      for (let k = 0; k < 3; k++) {
        g.fillRect(tx + k * w * 0.045, y + h - th - h * 0.34, w * 0.028, h * 0.05);
      }
    }
    g.fillStyle = 'rgba(240,180,90,0.85)';
    for (let i = 0; i < 7; i++) {
      g.fillRect(x + w * (0.10 + Math.random() * 0.78),
                 y + h * (0.70 + Math.random() * 0.18), 6, 9);
    }

  } else if (art === 'nuketown') {
    sky('#f0a15c', '#f6d79c');
    const bg = g.createRadialGradient(x + w * 0.5, y + h * 0.62, 4,
                                      x + w * 0.5, y + h * 0.62, w * 0.34);
    bg.addColorStop(0.0, 'rgba(255,250,232,0.95)');
    bg.addColorStop(0.4, 'rgba(255,214,150,0.55)');
    bg.addColorStop(1.0, 'rgba(255,190,120,0)');
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    g.fillStyle = '#6a4630';
    g.fillRect(x, y + h * 0.74, w, h * 0.26);
    // two neat suburban houses, facing each other across the road
    function house(hx, flip) {
      g.save();
      g.translate(hx, y + h * 0.74);
      g.scale(flip, 1);
      g.fillStyle = '#3d2a20';
      g.fillRect(-52, -60, 104, 60);
      g.beginPath();
      g.moveTo(-62, -60); g.lineTo(0, -96); g.lineTo(62, -60);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,232,180,0.8)';
      g.fillRect(-34, -46, 24, 22);
      g.fillRect(12, -46, 24, 22);
      g.restore();
    }
    house(x + w * 0.19, 1);
    house(x + w * 0.81, -1);
    g.strokeStyle = 'rgba(240,232,210,0.6)';
    g.lineWidth = 5;
    g.setLineDash([18, 16]);
    g.beginPath();
    g.moveTo(x + w * 0.5, y + h * 0.76);
    g.lineTo(x + w * 0.5, y + h);
    g.stroke();
    g.setLineDash([]);
  }

  // Everything is painted on a board that has been out in the weather.
  g.fillStyle = 'rgba(92,72,40,0.16)';
  g.fillRect(x, y, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(30,20,8,' + (0.04 + Math.random() * 0.10) + ')';
    g.beginPath();
    g.arc(x + Math.random() * w, y + Math.random() * h, 2 + Math.random() * 9, 0, Math.PI * 2);
    g.fill();
  }
}

// =============================================================
// WHERE THEY STAND
// =============================================================
// Against a wall, facing down a corridor, well apart from each other and from
// both ends of the maze. Every destination has to get a door, so the spacing
// is relaxed in passes rather than fixed: a maze that will not hold eight
// portals twelve metres apart will hold eight portals six metres apart, and
// eight doors close together is a better failure than seven doors.
function chooseSpots(isOpen, rooms, entrance, exit, avoid, want) {
  const chosen = [];
  const used = {};

  function tryCell(fx, fy, apart) {
    if (used[fx + ',' + fy]) return;

    // The clearing belongs to the garden, and the two ends of the maze belong
    // to the way in and the way out.
    if (Math.abs(fx - CLEARING_C) <= CLEARING_HALF + 1 &&
        Math.abs(fy - CLEARING_C) <= CLEARING_HALF + 1) return;

    const w = toWorld(fx, fy);
    if (near(w, entrance, 7) || near(w, exit, 7)) return;

    // Which way is there corn to set a door into?
    const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) {
      const nx = fx + d[0], ny = fy + d[1];
      return nx >= 0 && ny >= 0 && nx < FINE && ny < FINE && !isOpen[nx][ny];
    });
    if (!walls.length) return;

    const d = walls[(Math.random() * walls.length) | 0];
    // 0.06m proud of the face of the corn: enough that the frame is a thing
    // standing in the field rather than a decal on it, and close enough that
    // the corn behind still closes the doorway.
    const x = w.x + d[0] * (CELL * 0.5 - 0.06);
    const z = w.z + d[1] * (CELL * 0.5 - 0.06);

    for (let i = 0; i < chosen.length; i++) {
      const ddx = chosen[i].x - x, ddz = chosen[i].z - z;
      if (ddx * ddx + ddz * ddz < apart * apart) return;
    }
    // Nothing already standing in the doorway or in the two metres of path in
    // front of it, or the door is one you can see and cannot use.
    for (let i = 0; i < avoid.length; i++) {
      const ax = avoid[i].x - x, az = avoid[i].z - z;
      if (ax * ax + az * az < 4.0) return;
    }

    // Local axes: out of the wall, and along it to the right of somebody
    // standing in front of the door.
    const outX = -d[0], outZ = -d[1];
    const rightX = outZ, rightZ = -outX;

    // The sign goes on whichever side still has corridor in it.
    const sx = fx + rightX, sy = fy + rightZ;
    const rightOpen = sx >= 0 && sy >= 0 && sx < FINE && sy < FINE && isOpen[sx][sy];

    used[fx + ',' + fy] = true;
    chosen.push({
      x: x, z: z, outX: outX, outZ: outZ, rightX: rightX, rightZ: rightZ,
      signSide: rightOpen ? 1 : -1
    });
  }

  const spacings = [12, 9, 6.5, 4];
  for (let s = 0; s < spacings.length && chosen.length < want; s++) {
    for (let i = 0; i < rooms.length && chosen.length < want; i++) {
      tryCell(rooms[i][0], rooms[i][1], spacings[s]);
    }
  }
  return chosen;
}

function near(w, p, d) {
  const dx = w.x - p.x, dz = w.z - p.z;
  return dx * dx + dz * dz < d * d;
}

// =============================================================
// TEXTURES
// =============================================================
function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0.00, 'rgba(255,255,255,0.62)');
  rg.addColorStop(0.18, 'rgba(226,180,255,0.34)');
  rg.addColorStop(0.55, 'rgba(150,80,220,0.12)');
  rg.addColorStop(1.00, 'rgba(120,60,200,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// Not round: the light on the floor in front of a door is longer than it is
// wide, and a circle reads as a spotlight rigged over the corridor.
function makePoolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.scale(1, 1.35);
  const rg = g.createRadialGradient(0, -18, 2, 0, -18, 58);
  rg.addColorStop(0.00, 'rgba(238,214,255,0.85)');
  rg.addColorStop(0.35, 'rgba(180,110,235,0.34)');
  rg.addColorStop(1.00, 'rgba(140,70,210,0)');
  g.fillStyle = rg;
  g.fillRect(-64, -64, 128, 128);
  return new THREE.CanvasTexture(c);
}

function makeMoteTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  rg.addColorStop(0.4, 'rgba(232,200,255,0.5)');
  rg.addColorStop(1.0, 'rgba(200,150,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
