// The animals.
//
// Everything alive in the field is a billboard, for the same reason the corn
// is: a plane with a canvas-drawn animal on it, turned to face the camera.
// At the distance and in the light these are seen at, silhouette is nearly
// all of it, and a drawn deer that reads instantly beats a modelled one that
// costs a hundred times as much and reads as a grey lump in the haze.
//
// The shape of every friendly encounter is the same, and it is deliberately
// the shape of a real one: you never see the animal arrive. It is out in the
// corn, it comes to the edge of the path, it looks at you for a moment, and
// then it has had enough of you and goes. You cannot follow it, feed it,
// catch it or count it. It happens, and then it has happened.
//
// The dangerous ones are dangerous only to look at. A snake will move off if
// you keep walking past it; back away and it may come after you a little way
// before thinking better of it. Nothing here can touch you, and nothing here
// is a fail state — the fright is the whole of the content.

import * as THREE from 'three';
import { FINE, CELL, toWorld, CLEARING_C, CLEARING_HALF } from './maze.js';

// Small enough to slip between the stalks, or big enough to have to walk
// round like you do. That distinction is the reason a deer coming down the
// corridor toward you feels different from a mouse appearing at your feet.
const FRIENDLY = [
  { kind: 'deer',    count: 2, w: 2.00, h: 1.65, path: true,  speed: 2.9, notice: 22, spook: 7.0, watch: [2.4, 4.5], rest: [45, 110], voice: 'deer' },
  { kind: 'turkey',  count: 2, w: 1.05, h: 1.00, path: true,  speed: 2.2, notice: 17, spook: 5.5, watch: [2.0, 3.8], rest: [40, 95],  voice: 'turkey' },
  { kind: 'raccoon', count: 2, w: 0.90, h: 0.62, path: false, speed: 2.2, notice: 14, spook: 4.2, watch: [1.8, 3.4], rest: [35, 90],  voice: 'chitter' },
  { kind: 'rabbit',  count: 2, w: 0.58, h: 0.52, path: false, speed: 3.3, notice: 13, spook: 4.6, watch: [1.4, 2.8], rest: [30, 80],  voice: null },
  { kind: 'mouse',   count: 3, w: 0.30, h: 0.20, path: false, speed: 2.7, notice: 8,  spook: 2.2, watch: [0.9, 1.8], rest: [22, 60],  voice: null }
];

// Where an animal has to get to before it counts as gone. A corridor bends
// inside twenty metres almost everywhere, so by the time one is this far off
// it is behind a wall of corn and can be quietly put somewhere else.
const GONE = 21;

export function createCritters(isOpen, maxAniso) {
  const group = new THREE.Group();
  const grid = makeGrid(isOpen);
  const tex = makeTextures(maxAniso);
  const animals = [];

  for (let s = 0; s < FRIENDLY.length; s++) {
    const spec = FRIENDLY[s];
    for (let i = 0; i < spec.count; i++) {
      animals.push(makeFriendly(group, spec, tex[spec.kind], grid));
    }
  }

  const snakes = [makeSnake(group, tex, grid), makeSnake(group, tex, grid)];
  const swarms = [makeSwarm(group, tex, grid), makeSwarm(group, tex, grid)];
  const spider = makeSpider(group, tex, grid);
  const crows = [makeCrow(group, tex), makeCrow(group, tex), makeCrow(group, tex)];

  // The player's own motion, worked out here rather than asked for, so that
  // "walked past it" and "backed away from it" can be told apart. They are
  // the same two positions in a different order, and the animals care.
  const prev = new THREE.Vector3();
  const vel = new THREE.Vector3();
  let primed = false;

  return {
    group: group,

    // 0 when nothing is near, 1 when something with a bad temper is close and
    // has noticed you. audio.js hangs the low drone off this.
    danger: 0,
    // Held separately, because a swarm of bees is a sound you are inside of
    // rather than an event that happens.
    buzz: 0,

    update: function (dt, t, playerPos, viewPos, night, voice) {
      VIEW.copy(viewPos || playerPos);
      if (!primed) { prev.copy(playerPos); primed = true; }
      vel.subVectors(playerPos, prev).divideScalar(Math.max(dt, 1e-4));
      prev.copy(playerPos);
      const speed = vel.length();

      for (let i = 0; i < animals.length; i++) {
        animals[i].update(dt, t, playerPos, night, voice);
      }

      let danger = 0, buzz = 0;
      for (let i = 0; i < snakes.length; i++) {
        danger = Math.max(danger, snakes[i].update(dt, t, playerPos, vel, speed, voice));
      }
      for (let i = 0; i < swarms.length; i++) {
        danger = Math.max(danger, swarms[i].update(dt, t, playerPos, vel, speed, voice));
        buzz = Math.max(buzz, swarms[i].buzz);
      }
      danger = Math.max(danger, spider.update(dt, t, playerPos));
      this.danger = danger;
      this.buzz = buzz;

      for (let i = 0; i < crows.length; i++) {
        crows[i].update(dt, t, playerPos, night, voice);
      }
    }
  };
}

// =============================================================
// THE GRID
// =============================================================
// Enough of the maze to walk it. The big animals use the same open cells the
// player does; the small ones ignore all of it and go through the corn.
function makeGrid(isOpen) {
  function open(fx, fy) {
    return fx >= 0 && fy >= 0 && fx < FINE && fy < FINE && isOpen[fx][fy];
  }
  function cellOf(x, z) {
    return [Math.round(x / CELL + (FINE - 1) / 2), Math.round(z / CELL + (FINE - 1) / 2)];
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  return {
    open: open,
    cellOf: cellOf,

    // Somewhere clear to stand, at a chosen range from a point, with the
    // middle of the maze left alone — the garden is not a paddock.
    randomOpen: function (near, minD, maxD) {
      for (let tries = 0; tries < 160; tries++) {
        const fx = 1 + ((Math.random() * (FINE - 2)) | 0);
        const fy = 1 + ((Math.random() * (FINE - 2)) | 0);
        if (!open(fx, fy)) continue;
        if (Math.abs(fx - CLEARING_C) <= CLEARING_HALF && Math.abs(fy - CLEARING_C) <= CLEARING_HALF) continue;
        const w = toWorld(fx, fy);
        const d = Math.hypot(w.x - near.x, w.z - near.z);
        if (d < minD || d > maxD) continue;
        return { x: w.x, z: w.z, fx: fx, fy: fy };
      }
      return null;
    },

    // A cell of standing corn with a path beside it: where something that can
    // push through the stalks comes out.
    randomEdge: function (near, minD, maxD) {
      for (let tries = 0; tries < 200; tries++) {
        const fx = 1 + ((Math.random() * (FINE - 2)) | 0);
        const fy = 1 + ((Math.random() * (FINE - 2)) | 0);
        if (open(fx, fy)) continue;
        const outs = DIRS.filter(function (d) { return open(fx + d[0], fy + d[1]); });
        if (!outs.length) continue;
        const w = toWorld(fx, fy);
        const d = Math.hypot(w.x - near.x, w.z - near.z);
        if (d < minD || d > maxD) continue;
        const o = outs[(Math.random() * outs.length) | 0];
        const t = toWorld(fx + o[0], fy + o[1]);
        return { x: w.x, z: w.z, tx: t.x, tz: t.z };
      }
      return null;
    },

    // One step of a breadth-first search, from cell to cell. The grid is
    // nineteen squared, so the whole search is cheaper than being clever
    // about it, and it is only ever run a couple of times a second.
    stepToward: function (from, to) {
      if (from[0] === to[0] && from[1] === to[1]) return null;
      const seen = new Int8Array(FINE * FINE);
      const cameFrom = new Int32Array(FINE * FINE).fill(-1);
      const queue = [from[0] * FINE + from[1]];
      seen[queue[0]] = 1;
      const goal = to[0] * FINE + to[1];
      let found = false;
      for (let head = 0; head < queue.length && !found; head++) {
        const cur = queue[head];
        const cx = (cur / FINE) | 0, cy = cur % FINE;
        for (let d = 0; d < 4; d++) {
          const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
          if (!open(nx, ny)) continue;
          const id = nx * FINE + ny;
          if (seen[id]) continue;
          seen[id] = 1;
          cameFrom[id] = cur;
          if (id === goal) { found = true; break; }
          queue.push(id);
        }
      }
      if (!found) return null;
      let node = goal;
      while (cameFrom[node] !== from[0] * FINE + from[1]) {
        node = cameFrom[node];
        if (node < 0) return null;
      }
      return [(node / FINE) | 0, node % FINE];
    },

    // The open neighbour that puts the most corn between it and the player.
    awayFrom: function (cell, p) {
      let best = null, bestD = -1;
      for (let d = 0; d < 4; d++) {
        const nx = cell[0] + DIRS[d][0], ny = cell[1] + DIRS[d][1];
        if (!open(nx, ny)) continue;
        const w = toWorld(nx, ny);
        const dd = (w.x - p.x) * (w.x - p.x) + (w.z - p.z) * (w.z - p.z);
        if (dd > bestD) { bestD = dd; best = [nx, ny]; }
      }
      return best;
    },

    // Is there corn in the way? Used only to decide whether an animal can be
    // quietly moved while nobody is looking.
    sees: function (a, b) {
      const dx = b.x - a.x, dz = b.z - a.z;
      const steps = Math.ceil(Math.hypot(dx, dz) / 0.7);
      for (let i = 1; i < steps; i++) {
        const x = a.x + dx * i / steps, z = a.z + dz * i / steps;
        const c = cellOf(x, z);
        if (!open(c[0], c[1])) return false;
      }
      return true;
    }
  };
}

// =============================================================
// A BILLBOARD
// =============================================================
function billboard(texture, w, h) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: texture, side: THREE.DoubleSide, alphaTest: 0.5,
      roughness: 0.9, metalness: 0
    })
  );
  mesh.castShadow = true;
  return mesh;
}

// Where the camera is this frame, which since the piece went third-person is
// not where the player is. A billboard has to turn to the eye or it reads as
// the flat card it is; everything else in here cares about the body instead,
// so the eye is kept here rather than threaded through every animal.
const VIEW = new THREE.Vector3();

function faceCamera(mesh) {
  mesh.rotation.y = Math.atan2(VIEW.x - mesh.position.x, VIEW.z - mesh.position.z);
}

function pick(range) { return range[0] + Math.random() * (range[1] - range[0]); }

// =============================================================
// THE FRIENDLY ONES
// =============================================================
// away -> coming -> watching -> going -> away. The only state with any
// cleverness in it is `going`, and all the cleverness amounts to is leaving.
function makeFriendly(group, spec, texture, grid) {
  const mesh = billboard(texture, spec.w, spec.h);
  mesh.name = spec.kind;
  mesh.visible = false;
  group.add(mesh);

  const pos = new THREE.Vector3();
  const target = new THREE.Vector3();
  let state = 'away';
  let timer = pick([4, spec.rest[1]]);
  let cell = null;
  let repath = 0;
  let walk = 0;

  function goAway() {
    state = 'away';
    mesh.visible = false;
    timer = pick(spec.rest);
  }

  function appear(playerPos) {
    if (spec.path) {
      // Big animals come round a corner, so they start on the path, out of
      // sight, and walk in.
      const spot = grid.randomOpen(playerPos, 13, 21);
      if (!spot) return false;
      if (grid.sees(spot, playerPos)) return false;
      pos.set(spot.x, spec.h / 2, spot.z);
      cell = [spot.fx, spot.fy];
      target.copy(playerPos);
    } else {
      // Small ones are already in the corn. They only have to step out of it.
      const spot = grid.randomEdge(playerPos, 4.5, spec.notice * 0.8);
      if (!spot) return false;
      pos.set(spot.x, spec.h / 2, spot.z);
      target.set(spot.tx, spec.h / 2, spot.tz);
    }
    mesh.position.copy(pos);
    mesh.visible = true;
    state = 'coming';
    timer = 9;
    repath = 0;
    return true;
  }

  function stepTo(dt, tx, tz, speed) {
    const dx = tx - pos.x, dz = tz - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) return 0;
    const step = Math.min(d, speed * dt);
    pos.x += dx / d * step;
    pos.z += dz / d * step;
    walk += step;
    return d - step;
  }

  return {
    update: function (dt, t, playerPos, night, voice) {
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      timer -= dt;

      if (state === 'away') {
        // Deer and turkeys are up at dawn and dusk; the rest of them are
        // happier after dark. Nothing enforces it, it only tilts the odds.
        const hour = spec.path ? (1 - 0.45 * night) : (0.55 + 0.45 * night);
        if (timer <= 0) {
          timer = 6;
          if (Math.random() < hour) appear(playerPos);
        }
        return;
      }

      if (state === 'coming') {
        if (spec.path) {
          repath -= dt;
          if (repath <= 0) {
            repath = 1.1;
            const goal = grid.cellOf(playerPos.x, playerPos.z);
            const next = grid.stepToward(cell, goal);
            if (next) {
              cell = next;
              const w = toWorld(next[0], next[1]);
              target.set(w.x, pos.y, w.z);
            }
          }
          stepTo(dt, target.x, target.z, spec.speed * 0.62);
          const c = grid.cellOf(pos.x, pos.z);
          if (c[0] === cell[0] && c[1] === cell[1]) repath = Math.min(repath, 0.2);
        } else {
          stepTo(dt, target.x, target.z, spec.speed * 0.55);
        }

        // Close enough, or it has thought better of it. Either way it stops
        // and looks — which is the moment the whole thing exists for.
        if (dist < spec.spook + 2.2 || timer <= 0 ||
            (!spec.path && Math.hypot(target.x - pos.x, target.z - pos.z) < 0.15)) {
          state = 'watching';
          timer = pick(spec.watch);
          if (spec.voice && Math.random() < 0.45) voice(spec.voice, dist);
        }
      } else if (state === 'watching') {
        if (timer <= 0 || dist < spec.spook) {
          state = 'going';
          timer = 6;
          if (spec.voice && dist < spec.spook && Math.random() < 0.5) voice(spec.voice, dist);
          voice('bolt', dist);
          if (spec.path) cell = grid.cellOf(pos.x, pos.z);
        }
      } else if (state === 'going') {
        if (spec.path) {
          if (Math.hypot(target.x - pos.x, target.z - pos.z) < 0.4 || repath <= 0) {
            const next = grid.awayFrom(cell, playerPos);
            if (next) {
              cell = next;
              const w = toWorld(next[0], next[1]);
              target.set(w.x, pos.y, w.z);
            }
            repath = 2.5;
          }
          repath -= dt;
          stepTo(dt, target.x, target.z, spec.speed * 1.5);
        } else {
          // Straight back into the corn, by the shortest line away from you.
          const away = Math.atan2(-dx, -dz);
          stepTo(dt, pos.x + Math.sin(away) * 4, pos.z + Math.cos(away) * 4, spec.speed * 1.6);
        }
        if (timer <= 0 || dist > GONE || (dist > 6 && !grid.sees(pos, playerPos))) goAway();
      }

      // A standing animal is never quite still: a slow shift of weight, and
      // the head coming up. A dead-still billboard reads as a cardboard cut-out.
      const moving = state !== 'watching';
      const bob = moving ? Math.sin(walk * 4.5) * spec.h * 0.028
                         : Math.sin(t * 1.7) * spec.h * 0.012;
      mesh.position.set(pos.x, spec.h / 2 + bob, pos.z);
      faceCamera(mesh);
    }
  };
}

// =============================================================
// SNAKE
// =============================================================
// Lies across the path and would rather you went round. Walk past and it
// leaves; back off and it comes after you a couple of metres, which is a
// bluff, and it always gives up first.
function makeSnake(group, tex, grid) {
  const mesh = billboard(tex.snake, 1.05, 0.34);
  mesh.castShadow = false;    // too thin and too flat on the ground to read
  group.add(mesh);

  const pos = new THREE.Vector3();
  let state = 'lying';
  let timer = 0;
  let heading = Math.random() * 6.28;

  function place(playerPos) {
    const spot = grid.randomOpen(playerPos, 14, 30) || grid.randomOpen(playerPos, 0, 40);
    if (spot) pos.set(spot.x, 0.13, spot.z);
    state = 'lying';
    mesh.visible = true;
  }
  place(new THREE.Vector3(0, 0, 0));

  return {
    update: function (dt, t, playerPos, vel, speed, voice) {
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      // How much of the player's movement is straight away from the snake.
      const receding = speed > 0.4 ? (vel.x * dx + vel.z * dz) / (speed * dist) : 0;
      timer -= dt;

      if (state === 'lying') {
        if (dist < 5.5) {
          state = 'roused';
          timer = 1.4;
          voice('rattle', dist);
        }
      } else if (state === 'roused') {
        // Stand your ground or keep walking and it settles. Retreat and it
        // reads that as its own idea.
        if (timer <= 0) {
          if (receding < -0.55) {
            state = 'chasing';
            timer = 1.6 + Math.random() * 1.6;
            voice('rattle', dist);
          } else {
            state = 'leaving';
            timer = 4;
            heading = Math.atan2(-dx, -dz) + (Math.random() - 0.5);
          }
        }
      } else if (state === 'chasing') {
        // Never fast enough to arrive, and it stops well short anyway.
        if (dist > 1.4) {
          const k = 1.55 * dt / dist;
          pos.x += dx * k;
          pos.z += dz * k;
        }
        if (timer <= 0 || dist > 9 || receding > -0.2) {
          state = 'leaving';
          timer = 4;
          heading = Math.atan2(-dx, -dz);
        }
      } else if (state === 'leaving') {
        pos.x += Math.sin(heading) * 1.25 * dt;
        pos.z += Math.cos(heading) * 1.25 * dt;
        if (timer <= 0) {
          if (dist > 12 || !grid.sees(pos, playerPos)) place(playerPos);
          else { state = 'lying'; timer = 6; }
        }
      }

      // Rearing up is most of what makes it look like it means it.
      const up = state === 'roused' || state === 'chasing' ? 1 : 0;
      mesh.scale.set(1, 1 + up * 0.45, 1);
      mesh.position.set(pos.x, 0.13 + up * 0.10 + Math.sin(t * 3 + pos.x) * 0.01, pos.z);
      faceCamera(mesh);

      if (state === 'lying') return 0;
      return Math.max(0, 1 - dist / 7) * (state === 'chasing' ? 1 : 0.7);
    }
  };
}

// =============================================================
// BEES
// =============================================================
// Three of them over one patch of ground, which is enough to be a thing you
// walk round. The sound does the work; the sprites are barely a centimetre.
function makeSwarm(group, tex, grid) {
  const swarm = new THREE.Group();
  const bees = [];
  for (let i = 0; i < 3; i++) {
    const m = billboard(tex.bee, 0.24, 0.18);
    m.castShadow = false;
    swarm.add(m);
    bees.push({ mesh: m, phase: Math.random() * 6.28, r: 0.25 + Math.random() * 0.35, rate: 1.6 + Math.random() * 1.4 });
  }
  group.add(swarm);

  const pos = new THREE.Vector3();
  let state = 'hovering';
  let timer = 0;

  function place(playerPos) {
    const spot = grid.randomOpen(playerPos, 12, 30) || grid.randomOpen(playerPos, 0, 40);
    if (spot) pos.set(spot.x, 1.15, spot.z);
    state = 'hovering';
  }
  place(new THREE.Vector3(0, 0, 0));

  const api = {
    // Held rather than triggered: the buzz is a level that follows how close
    // they are, and audio.js reads it every frame.
    buzz: 0,
    update: function (dt, t, playerPos, vel, speed, voice) {
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      const receding = speed > 0.4 ? (vel.x * dx + vel.z * dz) / (speed * dist) : 0;
      timer -= dt;

      if (state === 'hovering') {
        if (dist < 4.5) { state = 'roused'; timer = 1.0; }
        // A patch of nothing in particular is worth drifting to now and then.
        else if (timer <= 0) {
          timer = 6 + Math.random() * 8;
          const spot = grid.randomOpen(pos, 1, 6);
          if (spot) { pos.x += (spot.x - pos.x) * 0.35; pos.z += (spot.z - pos.z) * 0.35; }
        }
      } else if (state === 'roused') {
        if (timer <= 0) {
          state = receding < -0.5 ? 'following' : 'settling';
          timer = state === 'following' ? 2 + Math.random() * 2 : 5;
          if (state === 'following') voice('buzzUp', dist);
        }
      } else if (state === 'following') {
        if (dist > 1.6) {
          const k = 1.75 * dt / dist;
          pos.x += dx * k; pos.z += dz * k;
        }
        if (timer <= 0 || dist > 10 || receding > -0.15) { state = 'settling'; timer = 5; }
      } else if (state === 'settling') {
        if (timer <= 0) {
          if (dist > 11 || !grid.sees(pos, playerPos)) place(playerPos);
          else { state = 'hovering'; timer = 6; }
        }
      }

      for (let i = 0; i < bees.length; i++) {
        const b = bees[i];
        const a = t * b.rate + b.phase;
        b.mesh.position.set(
          pos.x + Math.sin(a) * b.r,
          pos.y + Math.sin(a * 2.3 + b.phase) * 0.14,
          pos.z + Math.cos(a * 1.3) * b.r
        );
        faceCamera(b.mesh);
      }

      const close = Math.max(0, 1 - dist / 6);
      // You hear them before you see them, which is exactly how it goes.
      api.buzz = close * (state === 'following' ? 1 : 0.8);
      return state === 'hovering' ? close * 0.35 : close;
    }
  };

  return api;
}

// =============================================================
// SPIDER
// =============================================================
// Strung across a corridor at head height. It never moves toward you — it
// runs up its own thread and waits at the top until you have gone, which is
// both what they do and much more unpleasant than being chased.
function makeSpider(group, tex, grid) {
  const web = billboard(tex.web, 1.5, 1.5);
  web.castShadow = false;
  const body = billboard(tex.spider, 0.30, 0.26);
  body.castShadow = false;
  group.add(web);
  group.add(body);

  const spot = grid.randomOpen({ x: 0, z: 0 }, 8, 26) || { x: 6, z: 6 };
  const base = new THREE.Vector3(spot.x, 1.55, spot.z);
  web.position.copy(base);
  let climb = 0;

  return {
    update: function (dt, t, playerPos) {
      const dist = Math.hypot(playerPos.x - base.x, playerPos.z - base.z);
      const want = dist < 3.0 ? 1 : 0;
      climb += (want - climb) * Math.min(1, dt * 2.2);

      web.position.y = base.y;
      faceCamera(web);
      body.position.set(
        base.x,
        base.y + climb * 0.62 + Math.sin(t * 0.9) * 0.02 * (1 - climb),
        base.z
      );
      faceCamera(body);

      return Math.max(0, 1 - dist / 5) * 0.55;
    }
  };
}

// =============================================================
// CROWS
// =============================================================
// They come from somewhere and go somewhere else. Sometimes one drops onto
// the top of a corn wall, says what it thinks of you, and carries on.
function makeCrow(group, tex) {
  const mesh = billboard(tex.crow, 1.0, 0.62);
  mesh.castShadow = false;
  mesh.visible = false;
  group.add(mesh);

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const perch = new THREE.Vector3();
  let state = 'gone';
  let timer = 20 + Math.random() * 70;
  let trip = 0;
  let willPerch = false;

  function launch(playerPos) {
    const a = Math.random() * Math.PI * 2;
    const b = a + Math.PI * (0.55 + Math.random() * 0.9);
    from.set(playerPos.x + Math.cos(a) * 70, 16 + Math.random() * 10, playerPos.z + Math.sin(a) * 70);
    to.set(playerPos.x + Math.cos(b) * 70, 14 + Math.random() * 12, playerPos.z + Math.sin(b) * 70);
    willPerch = Math.random() < 0.45;
    const p = Math.random() * Math.PI * 2;
    perch.set(playerPos.x + Math.cos(p) * 7, 3.15, playerPos.z + Math.sin(p) * 7);
    state = 'crossing';
    trip = 0;
  }

  return {
    update: function (dt, t, playerPos, night, voice) {
      timer -= dt;

      if (state === 'gone') {
        // Crows keep daylight hours. After dark the field is the owl's.
        if (timer <= 0) {
          timer = 25 + Math.random() * 80;
          if (night < 0.5) launch(playerPos);
        }
        return;
      }

      mesh.visible = true;

      if (state === 'crossing' || state === 'leaving') {
        const a = state === 'crossing' ? from : perch;
        const b = state === 'crossing' ? (willPerch ? perch : to) : to;
        // A crossing that ends on a perch is a much shorter flight than one
        // that goes clean over, so it has to be flown faster to look the same.
        trip += dt * (state === 'crossing' && willPerch ? 0.14 : 0.055);
        const u = Math.min(1, trip);
        // A shallow sag in the middle, so it glides rather than tracking a
        // ruler across the sky.
        mesh.position.set(
          a.x + (b.x - a.x) * u,
          a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * 2.5,
          a.z + (b.z - a.z) * u
        );
        mesh.scale.set(1, 0.72 + 0.34 * Math.abs(Math.sin(t * 7.5)), 1);
        if (u >= 1) {
          if (state === 'crossing' && willPerch) {
            state = 'perched';
            timer = 4 + Math.random() * 7;
            voice('crow', 6);
          } else {
            state = 'gone';
            mesh.visible = false;
            timer = 30 + Math.random() * 90;
          }
        }
      } else if (state === 'perched') {
        mesh.position.copy(perch);
        mesh.position.y = perch.y + Math.sin(t * 1.3) * 0.04;
        mesh.scale.set(1, 1, 1);
        const near = Math.hypot(playerPos.x - perch.x, playerPos.z - perch.z);
        if (timer <= 0 || near < 3.5) {
          state = 'leaving';
          trip = 0;
          voice('crow', near);
        } else if (Math.random() < dt * 0.35) {
          voice('crow', near);
        }
      }

      faceCamera(mesh);
    }
  };
}

// =============================================================
// THE ANIMALS THEMSELVES
// =============================================================
// Drawn once each, to a canvas, in three-quarter view: enough of the side to
// be recognisable at a glance and enough of the face to be looking at you,
// which is the pose they spend most of their visible life in.
function makeTextures(maxAniso) {
  return {
    deer: sprite(256, 224, drawDeer, maxAniso),
    turkey: sprite(200, 200, drawTurkey, maxAniso),
    raccoon: sprite(224, 160, drawRaccoon, maxAniso),
    rabbit: sprite(160, 160, drawRabbit, maxAniso),
    mouse: sprite(160, 112, drawMouse, maxAniso),
    crow: sprite(224, 144, drawCrow, maxAniso),
    snake: sprite(256, 96, drawSnake, maxAniso),
    bee: sprite(64, 48, drawBee, maxAniso),
    spider: sprite(96, 84, drawSpider, maxAniso),
    web: sprite(192, 192, drawWeb, maxAniso)
  };
}

function sprite(w, h, draw, maxAniso) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  return tex;
}

function blob(g, pts, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) g.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else g.lineTo(p[0], p[1]);
  }
  g.closePath();
  g.fill();
}

function leg(g, x0, y0, x1, y1, x2, y2, width, colour) {
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.beginPath();
  g.moveTo(x0, y0);
  g.quadraticCurveTo(x1, y1, x2, y2);
  g.stroke();
}

function eye(g, x, y, r) {
  g.fillStyle = '#120d08';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.34, 0, Math.PI * 2); g.fill();
}

function drawDeer(g) {
  const coat = '#a97443', pale = '#c9a271';
  leg(g, 84, 132, 78, 168, 82, 208, 9, '#8a5c33');
  leg(g, 168, 130, 176, 168, 170, 208, 9, '#8a5c33');
  leg(g, 100, 134, 96, 170, 100, 208, 10, coat);
  leg(g, 156, 132, 164, 170, 158, 208, 10, coat);

  blob(g, [[70, 118], [70, 78, 118, 74], [168, 70, 182, 104], [188, 136, 150, 146], [104, 154, 70, 118]], coat);
  blob(g, [[88, 140], [120, 152, 168, 140], [150, 150, 88, 140]], pale);

  // tail, up and white — the last of a deer you usually see
  blob(g, [[74, 96], [58, 78, 62, 104], [72, 118, 74, 96]], '#efe4d2');

  // neck and head, turned to look at you
  blob(g, [[160, 96], [176, 62, 192, 44], [206, 34, 200, 62], [190, 96, 160, 96]], coat);
  blob(g, [[186, 52], [214, 30, 232, 44], [238, 56, 214, 66], [192, 70, 186, 52]], coat);
  blob(g, [[224, 46], [238, 42, 244, 54], [246, 62, 230, 62], [222, 58, 224, 46]], '#6d452a');

  // ears
  blob(g, [[188, 40], [176, 20, 194, 26], [206, 32, 188, 40]], coat);
  blob(g, [[204, 34], [212, 12, 220, 30], [224, 40, 204, 34]], coat);

  // antlers: a young buck's, barely more than a suggestion
  g.strokeStyle = '#8d7a58'; g.lineWidth = 4;
  g.beginPath();
  g.moveTo(198, 30); g.quadraticCurveTo(196, 8, 208, 2);
  g.moveTo(200, 18); g.lineTo(186, 8);
  g.moveTo(212, 34); g.quadraticCurveTo(218, 12, 232, 8);
  g.stroke();

  eye(g, 216, 50, 4.2);
  g.fillStyle = '#2a1c12';
  g.beginPath(); g.ellipse(240, 56, 3.4, 2.4, 0, 0, Math.PI * 2); g.fill();

  g.fillStyle = 'rgba(255,244,220,0.5)';
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.arc(96 + Math.random() * 76, 88 + Math.random() * 34, 2.4, 0, Math.PI * 2);
    g.fill();
  }
}

function drawTurkey(g) {
  // fanned tail first, so the body sits in front of it
  const cx = 74, cy = 128;
  for (let i = 0; i < 11; i++) {
    const a = -2.55 + i * 0.135;
    g.strokeStyle = i % 2 ? '#4a3a24' : '#6b573a';
    g.lineWidth = 13;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 74, cy + Math.sin(a) * 74);
    g.stroke();
  }
  g.strokeStyle = '#c9b489'; g.lineWidth = 5;
  g.beginPath(); g.arc(cx, cy, 70, -2.6, -0.15); g.stroke();

  leg(g, 108, 158, 106, 176, 100, 192, 5, '#b08040');
  leg(g, 126, 158, 130, 176, 136, 192, 5, '#b08040');
  g.strokeStyle = '#b08040'; g.lineWidth = 4;
  g.beginPath();
  g.moveTo(100, 192); g.lineTo(88, 196); g.moveTo(100, 192); g.lineTo(96, 200);
  g.moveTo(136, 192); g.lineTo(148, 196); g.moveTo(136, 192); g.lineTo(140, 200);
  g.stroke();

  blob(g, [[88, 120], [96, 82, 132, 88], [166, 96, 158, 134], [150, 168, 108, 162], [80, 152, 88, 120]], '#3d3122');
  blob(g, [[104, 132], [126, 118, 150, 132], [156, 152, 104, 132]], '#5b4a30');
  // the iridescent flash a turkey has when the light is on it
  g.fillStyle = 'rgba(70,110,86,0.42)';
  g.beginPath(); g.ellipse(128, 126, 26, 16, -0.3, 0, Math.PI * 2); g.fill();

  // neck, head, wattle
  blob(g, [[140, 100], [148, 66, 158, 46], [170, 30, 176, 52], [166, 86, 140, 100]], '#6a5a45');
  blob(g, [[160, 44], [172, 24, 186, 36], [196, 46, 178, 56], [162, 58, 160, 44]], '#b8bcc4');
  g.fillStyle = '#c0392b';
  g.beginPath(); g.ellipse(170, 58, 7, 12, 0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(186, 38, 4, 9, 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8c07a';
  g.beginPath(); g.moveTo(192, 44); g.lineTo(200, 48); g.lineTo(190, 51); g.closePath(); g.fill();
  eye(g, 180, 41, 3);
}

function drawRaccoon(g) {
  const fur = '#7f7c73', dark = '#33322f', pale = '#c9c5b8';

  // The tail is half the animal: thick, ringed, and carried out behind. It
  // is drawn as a line of overlapping discs down a curve, which keeps the
  // rings following the taper instead of sitting on it in stripes.
  for (let i = 10; i >= 0; i--) {
    const u = i / 10;
    const x = 76 - u * 62;
    const y = 104 - u * 44 + Math.sin(u * 2.2) * 6;
    g.fillStyle = (i % 3 === 0) ? dark : (i % 3 === 1 ? '#8f8b80' : fur);
    g.beginPath(); g.arc(x, y, 17 - u * 6, 0, Math.PI * 2); g.fill();
  }

  leg(g, 96, 122, 92, 138, 96, 150, 13, dark);
  leg(g, 152, 120, 158, 138, 154, 150, 13, dark);

  // hunched back, low to the ground, which is how they always look
  blob(g, [[66, 112], [74, 70, 122, 68], [166, 66, 174, 104], [180, 138, 118, 142], [62, 140, 66, 112]], fur);
  blob(g, [[76, 124], [116, 140, 170, 122], [156, 142, 76, 124]], '#605d56');

  blob(g, [[150, 92], [154, 56, 186, 56], [220, 56, 218, 92], [216, 126, 180, 124], [146, 118, 150, 92]], fur);
  // ears, small and round
  g.fillStyle = fur;
  g.beginPath(); g.arc(160, 60, 13, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(210, 60, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5d5a53';
  g.beginPath(); g.arc(160, 62, 7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(210, 62, 7, 0, Math.PI * 2); g.fill();

  // pale face, then the mask straight across it
  blob(g, [[152, 92], [156, 70, 184, 70], [214, 70, 216, 94], [218, 122, 184, 124], [150, 116, 152, 92]], pale);
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(150, 84);
  g.quadraticCurveTo(184, 76, 218, 84);
  g.quadraticCurveTo(220, 104, 214, 104);
  g.quadraticCurveTo(184, 96, 154, 104);
  g.quadraticCurveTo(148, 102, 150, 84);
  g.fill();
  // brow line above the mask, which is what makes it read as a bandit
  g.fillStyle = pale;
  g.beginPath(); g.ellipse(184, 74, 22, 5, 0, 0, Math.PI * 2); g.fill();

  g.fillStyle = '#efece2';
  g.beginPath(); g.arc(167, 91, 5.4, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(201, 91, 5.4, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111';
  g.beginPath(); g.arc(168, 91, 3.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(202, 91, 3.2, 0, Math.PI * 2); g.fill();

  // muzzle and nose
  blob(g, [[172, 108], [184, 104, 196, 108], [198, 122, 184, 126], [170, 122, 172, 108]], pale);
  g.fillStyle = '#1b1a18';
  g.beginPath(); g.ellipse(184, 112, 6.5, 5, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1b1a18'; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(184, 116); g.lineTo(184, 122); g.stroke();
}

function drawRabbit(g) {
  const fur = '#9c8265';
  leg(g, 66, 108, 60, 124, 70, 132, 12, '#8a7156');
  blob(g, [[48, 100], [52, 66, 88, 62], [126, 58, 128, 96], [130, 130, 82, 132], [44, 130, 48, 100]], fur);
  blob(g, [[56, 116], [88, 132, 124, 118], [110, 134, 56, 116]], '#c6b295');
  // scut
  g.fillStyle = '#efe8dc';
  g.beginPath(); g.arc(44, 104, 13, 0, Math.PI * 2); g.fill();

  blob(g, [[112, 82], [116, 54, 140, 54], [164, 54, 162, 84], [160, 110, 130, 108], [108, 104, 112, 82]], fur);
  // ears, one up, one half back — never two the same
  blob(g, [[122, 62], [110, 14, 128, 12], [142, 12, 134, 62]], fur);
  blob(g, [[126, 30], [122, 22, 130, 20], [136, 20, 132, 34]], '#d9a8a8');
  blob(g, [[144, 60], [150, 18, 164, 24], [176, 30, 154, 66]], fur);
  eye(g, 148, 76, 5);
  g.fillStyle = '#3a2a22';
  g.beginPath(); g.ellipse(163, 90, 4, 3, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(240,230,215,0.6)'; g.lineWidth = 1.4;
  for (let i = -2; i <= 2; i++) {
    g.beginPath(); g.moveTo(162, 90); g.lineTo(196, 84 + i * 7); g.stroke();
  }
}

function drawMouse(g) {
  const fur = '#8a8079';
  g.strokeStyle = '#c2a7a0'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(38, 74); g.quadraticCurveTo(10, 62, 16, 40); g.stroke();
  blob(g, [[34, 72], [40, 44, 70, 44], [104, 44, 108, 70], [110, 92, 66, 94], [30, 92, 34, 72]], fur);
  blob(g, [[100, 62], [104, 44, 124, 46], [146, 50, 142, 72], [138, 90, 110, 86], [96, 80, 100, 62]], fur);
  g.fillStyle = '#d6b6b0';
  g.beginPath(); g.arc(104, 46, 17, 0, Math.PI * 2); g.fill();
  g.fillStyle = fur;
  g.beginPath(); g.arc(104, 46, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d6b6b0';
  g.beginPath(); g.arc(130, 44, 12, 0, Math.PI * 2); g.fill();
  eye(g, 128, 66, 3.4);
  g.fillStyle = '#c98d8d';
  g.beginPath(); g.arc(146, 74, 3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(230,225,220,0.7)'; g.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    g.beginPath(); g.moveTo(144, 74); g.lineTo(160, 68 + i * 8); g.stroke();
  }
}

function drawCrow(g) {
  const black = '#171a1f';
  // wings out, mid-beat
  blob(g, [[104, 68], [70, 30, 22, 30], [58, 52, 100, 74]], black);
  blob(g, [[118, 68], [156, 34, 204, 40], [166, 58, 122, 76]], '#1f2329');
  blob(g, [[82, 74], [92, 52, 120, 54], [154, 56, 152, 78], [150, 98, 110, 98], [78, 94, 82, 74]], black);
  blob(g, [[86, 84], [56, 96, 34, 110], [64, 98, 88, 92]], black);
  blob(g, [[146, 62], [152, 44, 168, 46], [186, 48, 180, 66], [174, 82, 150, 78]], black);
  g.fillStyle = '#3a3a33';
  g.beginPath(); g.moveTo(180, 56); g.lineTo(206, 62); g.lineTo(180, 68); g.closePath(); g.fill();
  g.fillStyle = '#c9c2ae';
  g.beginPath(); g.arc(169, 58, 3.6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a0a0c';
  g.beginPath(); g.arc(169, 58, 2, 0, Math.PI * 2); g.fill();
}

function drawSnake(g, W, H) {
  // one long S, drawn as a tapering stroke
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    pts.push([14 + u * (W - 40), H * 0.66 + Math.sin(u * 7.2) * H * 0.20 * (1 - u * 0.55)]);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const u = i / (pts.length - 1);
    g.strokeStyle = '#5d6b3a';
    g.lineWidth = 16 * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, u * 1.15)));
    g.beginPath();
    g.moveTo(pts[i][0], pts[i][1]);
    g.lineTo(pts[i + 1][0], pts[i + 1][1]);
    g.stroke();
    if (i % 4 === 0) {
      g.strokeStyle = 'rgba(40,44,24,0.75)';
      g.lineWidth *= 0.9;
      g.beginPath();
      g.moveTo(pts[i][0], pts[i][1]);
      g.lineTo(pts[i + 1][0], pts[i + 1][1]);
      g.stroke();
    }
  }
  // the head, up off the ground and pointed at you
  const hx = pts[pts.length - 1][0], hy = pts[pts.length - 1][1];
  blob(g, [[hx - 12, hy], [hx - 4, hy - 26, hx + 14, hy - 24], [hx + 34, hy - 22, hx + 30, hy - 6], [hx + 26, hy + 8, hx - 12, hy]], '#67763f');
  g.fillStyle = '#e8d24a';
  g.beginPath(); g.arc(hx + 16, hy - 15, 4.2, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#101008';
  g.beginPath(); g.ellipse(hx + 16, hy - 15, 1.3, 4, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#b03a3a'; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(hx + 30, hy - 6); g.lineTo(hx + 46, hy - 2);
  g.moveTo(hx + 46, hy - 2); g.lineTo(hx + 54, hy - 8);
  g.moveTo(hx + 46, hy - 2); g.lineTo(hx + 54, hy + 3);
  g.stroke();
}

function drawBee(g, W, H) {
  g.fillStyle = 'rgba(226,236,244,0.55)';
  g.beginPath(); g.ellipse(W * 0.42, H * 0.30, 13, 7, -0.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W * 0.58, H * 0.30, 13, 7, 0.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8a72a';
  g.beginPath(); g.ellipse(W * 0.5, H * 0.58, 15, 9, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#221c10';
  for (let i = -1; i <= 1; i++) {
    g.beginPath(); g.ellipse(W * 0.5 + i * 7, H * 0.58, 2.6, 8.6, 0, 0, Math.PI * 2); g.fill();
  }
  g.beginPath(); g.arc(W * 0.5 - 15, H * 0.56, 5, 0, Math.PI * 2); g.fill();
}

function drawSpider(g, W, H) {
  const dark = '#1c1a1e';
  g.strokeStyle = dark;
  for (let i = 0; i < 4; i++) {
    const y = 30 + i * 8;
    g.lineWidth = 3 - i * 0.3;
    g.beginPath();
    g.moveTo(W * 0.5, y);
    g.quadraticCurveTo(W * 0.5 - 22 - i * 6, y - 14 + i * 9, W * 0.5 - 36 - i * 5, y + 18 + i * 6);
    g.stroke();
    g.beginPath();
    g.moveTo(W * 0.5, y);
    g.quadraticCurveTo(W * 0.5 + 22 + i * 6, y - 14 + i * 9, W * 0.5 + 36 + i * 5, y + 18 + i * 6);
    g.stroke();
  }
  g.fillStyle = dark;
  g.beginPath(); g.ellipse(W * 0.5, H * 0.58, 15, 19, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(W * 0.5, H * 0.33, 9, 8, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#c8b23c';
  g.beginPath(); g.ellipse(W * 0.5, H * 0.58, 6, 11, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e6e2d6';
  g.beginPath(); g.arc(W * 0.5 - 3.5, H * 0.30, 1.7, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(W * 0.5 + 3.5, H * 0.30, 1.7, 0, Math.PI * 2); g.fill();
}

function drawWeb(g, W, H) {
  const cx = W / 2, cy = H / 2, R = W * 0.47;
  g.strokeStyle = 'rgba(232,238,240,0.55)';
  g.lineWidth = 1.1;
  const SPOKES = 12;
  for (let i = 0; i < SPOKES; i++) {
    const a = (i / SPOKES) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    g.stroke();
  }
  for (let ring = 1; ring <= 7; ring++) {
    const r = R * (ring / 7) * (0.35 + 0.65 * ring / 7);
    g.beginPath();
    for (let i = 0; i <= SPOKES; i++) {
      const a = (i / SPOKES) * Math.PI * 2;
      // sagging thread between each pair of spokes
      const rr = r * (i % 2 ? 0.97 : 1.0);
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
}
