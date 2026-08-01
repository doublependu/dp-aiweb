// The garden at the middle of the maze.
//
// A raked gravel circle with three stones, a water basin and a stone lantern,
// in the clearing that maze.js opens at the centre. It is the one place in the
// field that somebody has obviously tended, which is why the corn walls
// around it read as tended too.
//
// Two things here answer back. The gravel keeps your tracks and slowly loses
// them again — the rake lines close over about half a minute, so you can walk
// a circle, look at it, and watch the garden forget you. And the basin drips
// more often while you are standing at it, each drop a note and a ring on the
// water. Neither is a mechanic. Nothing is counted.

import * as THREE from 'three';
import { CLEARING_R } from './maze.js';

const R = CLEARING_R - 0.6;      // the gravel stops short of the corn
const SAND = 512;                // gravel canvas, pixels across

// How fast the rake lines come back. A track you leave should still be there
// when you have walked the far side of the circle and turned round.
const HEAL_EVERY = 0.5;          // seconds between passes
const HEAL_ALPHA = 0.035;        // how much of the pristine pattern each pass restores

// Where things stand, in metres from the centre of the clearing.
const STONES = [
  { x: -1.15, z: 0.55, r: 0.62, h: 1.05, tilt: 0.16 },
  { x: -0.05, z: 1.70, r: 0.38, h: 0.52, tilt: 0.35 },
  { x: 1.70, z: -0.95, r: 0.30, h: 0.40, tilt: 0.22 }
];
const BASIN = { x: 2.10, z: 1.75 };
const LANTERN = { x: -2.35, z: -2.05 };

export function createGarden(maxAniso) {
  const group = new THREE.Group();
  const obstacles = [];

  const sand = makeSand(maxAniso);
  group.add(sand.mesh);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6b6860, roughness: 0.98, flatShading: true });
  for (let i = 0; i < STONES.length; i++) {
    const s = STONES[i];
    // A bare icosahedron is a golf ball. Knocking every vertex about by a
    // fifth of the radius is the whole difference between a rock and a bead,
    // and flat shading turns each dent into its own face.
    const rock = new THREE.Mesh(roughen(new THREE.IcosahedronGeometry(s.r, 1), s.r * 0.20), stoneMat);
    rock.position.set(s.x, s.h * 0.40, s.z);
    rock.scale.set(1, s.h / (s.r * 2), 0.85 + Math.random() * 0.3);
    rock.rotation.set(s.tilt, Math.random() * 3.14, s.tilt * 0.6);
    rock.castShadow = true;
    rock.receiveShadow = true;
    group.add(rock);
    obstacles.push({ x: s.x, z: s.z, r: s.r * 0.9 });
  }

  const basin = makeBasin(group);
  obstacles.push({ x: BASIN.x, z: BASIN.z, r: 0.45 });

  const lantern = makeStoneLantern(group);
  obstacles.push({ x: LANTERN.x, z: LANTERN.z, r: 0.34 });

  let dripIn = 4;

  return {
    group: group,
    obstacles: obstacles,

    // Handed to lanterns.js so the garden's light joins the pool of three
    // rather than adding a fourth light to a scene that cannot afford one.
    flame: lantern.flame,

    // True while the player is standing on the gravel.
    inside: function (p) {
      const dx = p.x, dz = p.z;
      return dx * dx + dz * dz < R * R;
    },

    update: function (dt, t, playerPos, onDrip) {
      const bx = playerPos.x - BASIN.x, bz = playerPos.z - BASIN.z;
      const toBasin = Math.sqrt(bx * bx + bz * bz);

      sand.update(dt, playerPos);
      basin.update(dt, t);

      // Every eight seconds or so on its own; every three when somebody is
      // standing at it. It is not responding to you, exactly. It just seems to.
      dripIn -= dt;
      if (dripIn <= 0) {
        dripIn = (toBasin < 4 ? 2.4 : 7.0) + Math.random() * 3.0;
        basin.drip();
        if (onDrip) onDrip(toBasin);
      }
    }
  };
}

// =============================================================
// GRAVEL
// =============================================================
// Two canvases: the raked pattern as it should be, and the one actually on
// screen. Footfalls are scuffed into the second; the first is washed back over
// it a little at a time, which is both the healing and the reason the pattern
// never has to be regenerated.
function makeSand(maxAniso) {
  const pristine = document.createElement('canvas');
  pristine.width = pristine.height = SAND;
  drawRake(pristine.getContext('2d'));

  const live = document.createElement('canvas');
  live.width = live.height = SAND;
  const g = live.getContext('2d');
  g.drawImage(pristine, 0, 0);

  const tex = new THREE.CanvasTexture(live);
  tex.anisotropy = maxAniso;

  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(R, 64),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;      // clear of the maze floor at 0.01
  mesh.receiveShadow = true;

  let healIn = HEAL_EVERY;
  let dirty = false;
  let lastX = 1e9, lastZ = 1e9;

  return {
    mesh: mesh,
    update: function (dt, p) {
      const on = p.x * p.x + p.z * p.z < R * R;
      if (on) {
        const dx = p.x - lastX, dz = p.z - lastZ;
        // One scuff every third of a metre: any finer and the track is a
        // smear rather than a line of steps.
        if (dx * dx + dz * dz > 0.11) {
          lastX = p.x; lastZ = p.z;
          scuff(g, p.x, p.z);
          dirty = true;
        }
      }

      healIn -= dt;
      if (healIn <= 0) {
        healIn = HEAL_EVERY;
        if (dirty) {
          g.globalAlpha = HEAL_ALPHA;
          g.drawImage(pristine, 0, 0);
          g.globalAlpha = 1;
          tex.needsUpdate = true;
        }
      } else if (dirty) {
        tex.needsUpdate = true;
      }
    }
  };
}

function roughen(geo, amount) {
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

// World metres to canvas pixels. The disc is rotated flat and its uvs run
// across its bounding square, so +x is right and +z is down — a plain map.
function toCanvas(wx, wz) {
  return [(0.5 + wx / (2 * R)) * SAND, (0.5 + wz / (2 * R)) * SAND];
}

function scuff(g, wx, wz) {
  const p = toCanvas(wx, wz);
  const rad = SAND * 0.026;
  const rg = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
  rg.addColorStop(0, 'rgba(120,104,74,0.34)');
  rg.addColorStop(0.6, 'rgba(133,116,84,0.16)');
  rg.addColorStop(1, 'rgba(133,116,84,0)');
  g.fillStyle = rg;
  g.beginPath(); g.arc(p[0], p[1], rad, 0, Math.PI * 2); g.fill();
}

// Parallel lines everywhere, rings around each stone, and moss where the
// gravel meets them. Grooves are drawn as a pale line with a dark one under
// it — at this angle that reads as relief and a single line does not.
function drawRake(g) {
  // Darker than gravel looks in the hand. The afternoon here is strong enough
  // that anything paler than this comes out of the renderer as a white disc
  // with the corn standing in snow.
  g.fillStyle = '#9b8f70';
  g.fillRect(0, 0, SAND, SAND);

  for (let n = 0; n < 30000; n++) {
    const v = 118 + Math.random() * 80;
    g.fillStyle = 'rgba(' + (v | 0) + ',' + ((v - 10) | 0) + ',' + ((v - 40) | 0) + ',0.34)';
    g.fillRect(Math.random() * SAND, Math.random() * SAND, 1.8, 1.8);
  }

  const islands = STONES.map(function (s) {
    const p = toCanvas(s.x, s.z);
    return { x: p[0], y: p[1], r: (s.r / (2 * R)) * SAND * 2.1 };
  });
  const basinP = toCanvas(BASIN.x, BASIN.z);
  islands.push({ x: basinP[0], y: basinP[1], r: (0.5 / (2 * R)) * SAND * 2.0 });

  // moss, under the rake lines so the lines look raked up to it
  for (let i = 0; i < islands.length; i++) {
    const s = islands[i];
    const mg = g.createRadialGradient(s.x, s.y, s.r * 0.3, s.x, s.y, s.r * 1.05);
    mg.addColorStop(0, 'rgba(74,92,44,0.62)');
    mg.addColorStop(1, 'rgba(74,92,44,0)');
    g.fillStyle = mg;
    g.beginPath(); g.arc(s.x, s.y, s.r * 1.05, 0, Math.PI * 2); g.fill();
  }

  function groove(path) {
    g.lineWidth = 3.2;
    g.strokeStyle = 'rgba(84,72,48,0.32)';
    path(0, 1.6);
    g.lineWidth = 2.2;
    g.strokeStyle = 'rgba(206,196,166,0.42)';
    path(0, -1.0);
  }

  // straight lines, everywhere the stones are not
  g.save();
  const clip = new Path2D();
  clip.rect(0, 0, SAND, SAND);
  for (let i = 0; i < islands.length; i++) {
    clip.moveTo(islands[i].x + islands[i].r, islands[i].y);
    clip.arc(islands[i].x, islands[i].y, islands[i].r, 0, Math.PI * 2);
  }
  g.clip(clip, 'evenodd');
  const STEP = SAND / 46;
  for (let y = STEP * 0.5; y < SAND; y += STEP) {
    groove(function (dx, dy) {
      g.beginPath();
      for (let x = 0; x <= SAND; x += 16) {
        // A raked line is never quite straight, and a perfectly straight one
        // looks printed.
        const wob = Math.sin(x * 0.021 + y * 0.05) * 2.2;
        if (x === 0) g.moveTo(x + dx, y + wob + dy); else g.lineTo(x + dx, y + wob + dy);
      }
      g.stroke();
    });
  }
  g.restore();

  // rings, drawn out from each stone
  for (let i = 0; i < islands.length; i++) {
    const s = islands[i];
    for (let ring = 0; ring < 4; ring++) {
      const rr = s.r * (1.16 + ring * 0.30);
      groove(function (dx, dy) {
        g.beginPath();
        g.arc(s.x + dx, s.y + dy, rr, 0, Math.PI * 2);
        g.stroke();
      });
    }
  }
}

// =============================================================
// THE BASIN
// =============================================================
// A stone bowl kept full by a bamboo spout, with rings that spread when a
// drop lands. The rings are three plain quads reused over and over.
function makeBasin(group) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x63615a, roughness: 0.98, flatShading: true });

  // Wider at the lip than at the foot, and low: a tsukubai is meant to make
  // you stoop to it.
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.34, 0.42, 10), stone);
  bowl.position.set(BASIN.x, 0.21, BASIN.z);
  bowl.castShadow = true;
  bowl.receiveShadow = true;
  group.add(bowl);

  // Sunk below the lip, so the rim shadows it and it reads as depth rather
  // than as a grey lid.
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.37, 24),
    new THREE.MeshStandardMaterial({ color: 0x1b2a2c, roughness: 0.04, metalness: 0.75 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(BASIN.x, 0.375, BASIN.z);
  group.add(water);

  // bamboo: an upright, and a spout leaning in over the water
  const bamboo = new THREE.MeshStandardMaterial({ color: 0x8e8b46, roughness: 0.85 });
  const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.86, 7), bamboo);
  upright.position.set(BASIN.x + 0.52, 0.43, BASIN.z + 0.34);
  upright.castShadow = true;
  group.add(upright);

  // Laid between two points rather than rotated into place: the spout has to
  // start at the top of the upright and finish over the middle of the water,
  // and three eulers guessed at is a stick pointing at nothing.
  const from = new THREE.Vector3(BASIN.x + 0.52, 0.80, BASIN.z + 0.34);
  const to = new THREE.Vector3(BASIN.x + 0.04, 0.64, BASIN.z + 0.02);
  const along = new THREE.Vector3().subVectors(to, from);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, along.length(), 7), bamboo);
  spout.position.copy(from).addScaledVector(along, 0.5);
  spout.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.clone().normalize());
  spout.castShadow = true;
  group.add(spout);

  const ringTex = makeRingTexture();
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(BASIN.x, 0.379, BASIN.z);
    m.visible = false;
    group.add(m);
    rings.push({ mesh: m, life: 0 });
  }

  // the falling drop itself, one small bead reused
  const bead = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 6, 5),
    new THREE.MeshStandardMaterial({ color: 0xbcd2d8, roughness: 0.1, metalness: 0.4 })
  );
  bead.visible = false;
  group.add(bead);
  let beadY = 0;

  return {
    drip: function () {
      bead.visible = true;
      beadY = 0.70;
    },
    update: function (dt, t) {
      if (bead.visible) {
        beadY -= dt * 2.4;
        bead.position.set(BASIN.x + 0.04, beadY, BASIN.z + 0.02);
        if (beadY <= 0.39) {
          bead.visible = false;
          for (let i = 0; i < rings.length; i++) {
            if (rings[i].life <= 0) { rings[i].life = 1; break; }
          }
        }
      }
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i];
        if (r.life <= 0) { r.mesh.visible = false; continue; }
        r.life -= dt * 0.55;
        const grow = 1 - r.life;
        r.mesh.visible = true;
        r.mesh.scale.setScalar(0.12 + grow * 0.9);
        r.mesh.material.opacity = Math.max(0, r.life) * 0.5;
      }
    }
  };
}

function makeRingTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(210,230,235,0.9)';
  g.lineWidth = 3;
  g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = 'rgba(210,230,235,0.35)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(32, 32, 19, 0, Math.PI * 2); g.stroke();
  return new THREE.CanvasTexture(c);
}

// =============================================================
// THE STONE LANTERN
// =============================================================
// Shaped like an ishidoro, and lit the same way every other lantern in the
// field is: a glow sprite of its own, and a place in lanterns.js's pool of
// three real lights. It gets no light to itself — see the note in lanterns.js
// about what a fourth light costs when the corn is one instanced mesh.
function makeStoneLantern(group) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x85837a, roughness: 0.95, flatShading: true });
  const parts = [
    [new THREE.CylinderGeometry(0.34, 0.40, 0.16, 8), 0.08],
    [new THREE.CylinderGeometry(0.11, 0.13, 0.72, 8), 0.52],
    [new THREE.CylinderGeometry(0.28, 0.20, 0.10, 8), 0.93]
  ];
  for (let i = 0; i < parts.length; i++) {
    const m = new THREE.Mesh(parts[i][0], stone);
    m.position.set(LANTERN.x, parts[i][1], LANTERN.z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // the light chamber, and the roof over it
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), stone);
  box.position.set(LANTERN.x, 1.15, LANTERN.z);
  box.rotation.y = 0.4;
  box.castShadow = true;
  group.add(box);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.40, 0.26, 6), stone);
  roof.position.set(LANTERN.x, 1.44, LANTERN.z);
  roof.rotation.y = 0.4;
  roof.castShadow = true;
  group.add(roof);

  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), stone);
  finial.position.set(LANTERN.x, 1.60, LANTERN.z);
  group.add(finial);

  // The opening in the front, which is the part that actually looks lit.
  const mouth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.20, 0.22),
    new THREE.MeshBasicMaterial({ color: 0x2b2721, side: THREE.DoubleSide })
  );
  mouth.position.set(LANTERN.x + Math.sin(0.4) * 0.175, 1.15, LANTERN.z + Math.cos(0.4) * 0.175);
  mouth.rotation.y = 0.4;
  group.add(mouth);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), color: 0xffc98a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glow.scale.set(2.4, 2.4, 1);
  glow.position.set(LANTERN.x, 1.15, LANTERN.z);
  group.add(glow);

  return {
    flame: {
      x: LANTERN.x, z: LANTERN.z, y: 1.15,
      glass: mouth, glow: glow,
      phase: Math.random() * 6.28,
      rate: 0.7 + Math.random() * 0.9,
      d2: 0
    }
  };
}

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0.0, 'rgba(255,246,224,0.95)');
  rg.addColorStop(0.25, 'rgba(255,206,140,0.42)');
  rg.addColorStop(1.0, 'rgba(255,190,110,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
