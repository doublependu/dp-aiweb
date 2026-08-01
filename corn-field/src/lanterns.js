// Lanterns on stakes, hung along the corridors.
//
// They exist so the night is walkable. The light cycle now runs all the way
// round to dark, and a wander with no fail state must never leave the player
// unable to see the corridor they are standing in — the moon alone does not
// reach the floor of a passage with three-metre corn either side of it.
//
// Every lantern has a glow sprite, which costs nothing. Only the three
// nearest have an actual PointLight: the corn is a single instanced mesh of
// ~15k quads, so each extra light in the scene is paid for by every one of
// them, and three is where it stops being free.

import * as THREE from 'three';
import { FINE, CELL, toWorld } from './maze.js';
import { LEGACY_LIGHT_SCALE } from './scene.js';

const WANT = 11;
const MIN_APART = 9.5;     // world metres between lanterns
const LIT_POOL = 3;
const REACH = 11;          // how far one lantern throws
const HEIGHT = 2.05;

// Matching the exit light: r128's non-physical point lights fell off as
// (1 - d/distance)^2 and r185 only has inverse-square, so decay 1 plus a gain
// tracks the old curve closely enough for anywhere you can stand.
const FALLOFF_GAIN = 1.78;

// `extra` is for flames that belong to something else — the garden's stone
// lantern builds its own body and its own glow, and hands the flame here so
// that it competes for one of the three real lights like everything else
// rather than quietly becoming a fourth.
export function createLanterns(isOpen, rooms, entrance, exit, extra) {
  const group = new THREE.Group();
  const lanterns = [];

  const spots = chooseSpots(isOpen, rooms, entrance, exit);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x5a4629, roughness: 1 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2e2b26, roughness: 0.75, metalness: 0.35 });
  const postGeo = new THREE.CylinderGeometry(0.055, 0.075, HEIGHT, 7);
  const armGeo = new THREE.BoxGeometry(0.42, 0.05, 0.05);
  const capGeo = new THREE.ConeGeometry(0.17, 0.14, 6);
  const glassGeo = new THREE.BoxGeometry(0.19, 0.24, 0.19);
  const glowTex = makeGlowTexture();

  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];

    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(s.x, HEIGHT / 2, s.z);
    post.rotation.y = Math.random() * 1.5;
    post.rotation.z = (Math.random() - 0.5) * 0.05;
    group.add(post);

    // the lantern hangs off a short arm, out over the path
    const arm = new THREE.Mesh(armGeo, ironMat);
    arm.position.set(s.x - s.dx * 0.19, HEIGHT - 0.06, s.z - s.dz * 0.19);
    arm.rotation.y = Math.atan2(s.dx, s.dz);
    group.add(arm);

    const hx = s.x - s.dx * 0.38, hz = s.z - s.dz * 0.38;

    const glass = new THREE.Mesh(glassGeo, new THREE.MeshBasicMaterial({ color: 0x2b2721 }));
    glass.position.set(hx, HEIGHT - 0.22, hz);
    group.add(glass);

    const cap = new THREE.Mesh(capGeo, ironMat);
    cap.position.set(hx, HEIGHT - 0.03, hz);
    group.add(cap);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffbe72, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.copy(glass.position);
    group.add(glow);

    lanterns.push({
      x: hx, z: hz, y: HEIGHT - 0.22,
      glass: glass, glow: glow,
      phase: Math.random() * 6.28,
      // Each flame has its own idea of what a flicker is; shared rates read
      // as a single flashing light rather than as several candles.
      rate: 0.7 + Math.random() * 0.9,
      d2: 0
    });
  }

  // The pool. Parked far away and dark until something needs them.
  const pool = [];
  for (let i = 0; i < LIT_POOL; i++) {
    const light = new THREE.PointLight(0xffb765, 0, REACH, 1);
    light.visible = false;
    group.add(light);
    pool.push(light);
  }

  // Only the posts this module put there; anything handed in through `extra`
  // is somebody else's to be solid or not.
  const obstacles = lanterns.map(function (l) {
    return { x: l.x, z: l.z, r: 0.3 };
  });

  if (extra) {
    for (let i = 0; i < extra.length; i++) lanterns.push(extra[i]);
  }

  return {
    group: group,
    obstacles: obstacles,

    update: function (t, night, cameraPosition) {
      const lit = smoothstep(0.12, 0.75, night);

      for (let i = 0; i < lanterns.length; i++) {
        const l = lanterns[i];
        const flick = 0.82 + 0.18 * Math.sin(t * l.rate * 3.1 + l.phase)
                           + 0.08 * Math.sin(t * l.rate * 7.7 + l.phase * 2.3);
        l.level = lit * flick;
        l.glass.material.color.setRGB(
          0.17 + l.level * 0.83,
          0.15 + l.level * 0.58,
          0.13 + l.level * 0.22
        );
        l.glow.material.opacity = l.level * 0.8;
        l.glow.visible = l.level > 0.01;

        const dx = cameraPosition.x - l.x, dz = cameraPosition.z - l.z;
        l.d2 = dx * dx + dz * dz;
      }

      if (lit < 0.01) {
        for (let i = 0; i < pool.length; i++) pool[i].visible = false;
        return;
      }

      // Partial selection sort: only the first LIT_POOL entries need to end
      // up in the right place.
      for (let i = 0; i < LIT_POOL && i < lanterns.length; i++) {
        let best = i;
        for (let j = i + 1; j < lanterns.length; j++) {
          if (lanterns[j].d2 < lanterns[best].d2) best = j;
        }
        const tmp = lanterns[i]; lanterns[i] = lanterns[best]; lanterns[best] = tmp;

        const l = lanterns[i];
        const light = pool[i];
        light.position.set(l.x, l.y, l.z);
        light.intensity = l.level * 1.15 * LEGACY_LIGHT_SCALE * FALLOFF_GAIN;
        light.visible = l.d2 < REACH * REACH * 1.6;
      }
    }
  };
}

// Spread out, always tucked against a wall so the middle of the path stays
// clear, and one at each end of the maze so the way in and the way out are
// both marked after dark.
function chooseSpots(isOpen, rooms, entrance, exit) {
  const chosen = [];

  function tryCell(fx, fy) {
    if (fx < 0 || fy < 0 || fx >= FINE || fy >= FINE || !isOpen[fx][fy]) return false;

    // Which way is there corn to hang the lantern against?
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) {
      const nx = fx + d[0], ny = fy + d[1];
      return nx < 0 || ny < 0 || nx >= FINE || ny >= FINE || !isOpen[nx][ny];
    });
    if (!dirs.length) return false;

    const w = toWorld(fx, fy);
    const d = dirs[(Math.random() * dirs.length) | 0];
    const x = w.x + d[0] * CELL * 0.33;
    const z = w.z + d[1] * CELL * 0.33;

    for (let i = 0; i < chosen.length; i++) {
      const ddx = chosen[i].x - x, ddz = chosen[i].z - z;
      if (ddx * ddx + ddz * ddz < MIN_APART * MIN_APART) return false;
    }
    chosen.push({ x: x, z: z, dx: d[0], dz: d[1] });
    return true;
  }

  function seedNear(p) {
    for (let fx = 0; fx < FINE; fx++) {
      for (let fy = 0; fy < FINE; fy++) {
        if (!isOpen[fx][fy]) continue;
        const w = toWorld(fx, fy);
        const dx = w.x - p.x, dz = w.z - p.z;
        if (dx * dx + dz * dz < CELL * CELL * 2.2 && tryCell(fx, fy)) return;
      }
    }
  }

  // The two ends first, so the way in and the way out are both marked after
  // dark whatever the rest of the spacing works out to.
  seedNear(entrance);
  seedNear(exit);

  for (let i = 0; i < rooms.length && chosen.length < WANT; i++) {
    tryCell(rooms[i][0], rooms[i][1]);
  }

  return chosen;
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

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
