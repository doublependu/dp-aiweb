// Movement, collision, and the camera that follows the body around.
//
// The player is a position on the floor with a heading; the camera is on a
// boom behind it. Everything in the field that wants to know where somebody
// is standing reads `position` — which is the body, not the camera. Those are
// three metres apart now, and a portal you can trigger by pointing the camera
// at it is not a door you walked through.

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { FINE, CELL, toWorld } from './maze.js';

const WALK = 2.05;
const RUN = 4.2;
const TURN = 1.5;    // arrow-key turning, radians a second
const BODY = 0.26;   // how much room the player takes up

const GRAVITY = 18;
const JUMP = 5.4;    // about 0.8m up and 0.6s in the air
const AIR = 0.75;    // how much of your walking control you keep off the ground

// The boom. It swings around a point at chest height, which keeps the head
// off the middle of the screen and the floor in shot.
const PIVOT = 1.45;
const BOOM = 3.2;
const SHOULDER = 0.42;   // how far off to one side the boom hangs
const CAM_BODY = 0.22;   // how much room the camera needs before corn is in its way
const CAM_FLOOR = 0.5;   // and how low it may get

// The old first-person limits were about what you could crane your neck at.
// These are about where the camera is allowed to be: down is capped because
// the boom rises as you look down, and at much past this it clears the top of
// the shortest corn and you can see over the maze. Up is unchanged — there is
// a moon worth looking at — and is paid for by pulling the boom in instead.
const UP = 0.98, DOWN = -0.26;

export function createPlayer(options) {
  const camera = options.camera;
  const domElement = options.domElement;
  const isOpen = options.isOpen;
  const onStep = options.onStep;
  // Solid things that are not corn: lantern posts, hay bales, the barn. A
  // circle if it has `r`, an oriented box if it has `hw`/`hd`.
  const obstacles = options.obstacles || [];

  const keys = {};
  window.addEventListener('keydown', function (e) {
    keys[e.key.toLowerCase()] = true;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(e.key.toLowerCase()) > -1) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

  // Face the way out to begin with — not as a hint, just so the first thing
  // you see is a corridor rather than a wall.
  let yaw = Math.atan2(options.exitPos.x - options.startPos.x, options.exitPos.z - options.startPos.z);
  let pitch = 0;
  let dragging = false, lastX = 0, lastY = 0;

  const position = new THREE.Vector3(options.startPos.x, 0, options.startPos.z);
  // The body faces the way it is going, which to begin with is nowhere — so it
  // faces away from the camera, down the corridor the camera is looking along.
  const motion = {
    x: position.x, y: 0, z: position.z,
    facing: yaw + Math.PI, speed: 0, running: false, airborne: false, vy: 0
  };
  let vy = 0;
  let boom = BOOM;
  let lift = 0;   // the height the camera is following, which lags a jump

  camera.rotation.order = 'YXZ';

  // Mouse look proper, once you have clicked into it. It drives a bare object
  // rather than the camera: the camera's own transform is worked out from the
  // boom every frame, and two things writing to it would only fight.
  const look = new THREE.Object3D();
  look.rotation.order = 'YXZ';
  const controls = new PointerLockControls(look, domElement);
  controls.minPolarAngle = Math.PI / 2 - UP;
  controls.maxPolarAngle = Math.PI / 2 - DOWN;
  controls.pointerSpeed = 0.6;

  // Asking for the lock here rather than through controls.lock(), which
  // swallows the promise: a refusal — no gesture, or a browser that has no
  // pointer lock at all — would otherwise surface as an unhandled rejection.
  // The controls still see the lock happen; they listen on the document.
  function lock() {
    const asked = domElement.requestPointerLock();
    if (asked && asked.catch) asked.catch(function () { /* drag to look, then */ });
  }
  domElement.addEventListener('click', lock);

  // The drag-to-look below stays because pointer lock is a desktop-only idea
  // and a phone still has to be able to swing the camera round.
  domElement.addEventListener('pointerdown', function (e) {
    if (controls.isLocked) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('pointerup', function () { dragging = false; });
  window.addEventListener('pointermove', function (e) {
    if (!dragging || controls.isLocked) return;
    yaw -= (e.clientX - lastX) * 0.0035;
    pitch = Math.max(DOWN, Math.min(UP, pitch - (e.clientY - lastY) * 0.0035));
    lastX = e.clientX; lastY = e.clientY;
  });

  let walkT = 0, stepMark = 0;

  function blocked(x, z, pad) {
    const room = pad === undefined ? BODY : pad;
    const fx = Math.round(x / CELL + (FINE - 1) / 2);
    const fy = Math.round(z / CELL + (FINE - 1) / 2);
    for (let ax = -1; ax <= 1; ax++) {
      for (let ay = -1; ay <= 1; ay++) {
        const cx2 = fx + ax, cy2 = fy + ay;
        if (cx2 < 0 || cy2 < 0 || cx2 >= FINE || cy2 >= FINE) continue;
        if (isOpen[cx2][cy2]) continue;
        const w = toWorld(cx2, cy2);
        if (Math.abs(x - w.x) < CELL * 0.5 + room && Math.abs(z - w.z) < CELL * 0.5 + room) return true;
      }
    }

    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const dx = x - o.x, dz = z - o.z;
      if (o.r !== undefined) {
        const rr = o.r + room;
        if (dx * dx + dz * dz < rr * rr) return true;
      } else {
        // Rotate into the box's own frame rather than growing an
        // axis-aligned bound around it, which for the barn would put an
        // invisible wall several metres out from the real one.
        const turn = o.turn || 0;
        const c = Math.cos(-turn), s = Math.sin(-turn);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < o.hw + room && Math.abs(lz) < o.hd + room) return true;
      }
    }
    return false;
  }

  const focus = new THREE.Vector3();
  const dir = new THREE.Vector3();

  // Where the camera can get to along the boom before something is in the way.
  // Sampled rather than raycast: the corn is one instanced mesh of eleven
  // thousand quads and the wall it makes is the grid, not the geometry.
  function reach(want) {
    // Looking up swings the camera down and, past a point, into the floor.
    // Rather than stopping it there — which would leave the sky out of shot
    // for good — the boom shortens, so craning all the way up ends with the
    // camera at the back of your own head and a clear view of the moon.
    if (dir.y < -0.01) want = Math.min(want, (focus.y - CAM_FLOOR) / -dir.y);

    const STEP = 0.3;
    for (let d = STEP; d < want; d += STEP) {
      if (blocked(focus.x + dir.x * d, focus.z + dir.z * d, CAM_BODY)) return Math.max(0.35, d - STEP);
    }
    return want;
  }

  function update(dt, active) {
    // While the pointer is locked the controls own the look object, so the
    // frame starts by taking their word for where you are looking. The arrow
    // keys then write back into it, or the next mouse move would undo them.
    if (controls.isLocked) {
      yaw = look.rotation.y;
      pitch = look.rotation.x;
    }

    if (active && keys['arrowleft']) yaw += TURN * dt;
    if (active && keys['arrowright']) yaw -= TURN * dt;
    look.rotation.set(pitch, yaw, 0);

    let mx = 0, mz = 0;
    if (active) {
      // Movement is read off the camera, not the body: forward is into the
      // screen. The arrows walk the way the arrow points; w/a/s/d as usual.
      if (keys['w'] || keys['arrowup']) { mx -= Math.sin(yaw); mz -= Math.cos(yaw); }
      if (keys['s'] || keys['arrowdown']) { mx += Math.sin(yaw); mz += Math.cos(yaw); }
      if (keys['a']) { mx -= Math.cos(yaw); mz += Math.sin(yaw); }
      if (keys['d']) { mx += Math.cos(yaw); mz -= Math.sin(yaw); }
    }

    const grounded = position.y <= 0.0001;
    if (active && grounded && keys[' ']) { vy = JUMP; }

    const wasX = position.x, wasZ = position.z;
    const mag = Math.sqrt(mx * mx + mz * mz);
    let speed = 0;
    if (mag > 0.001) {
      mx /= mag; mz /= mag;
      const running = !!(keys['shift'] && active);
      speed = (running ? RUN : WALK) * (grounded ? 1 : AIR);
      motion.running = running;
      motion.facing = Math.atan2(mx, mz);

      const nx = position.x + mx * speed * dt;
      const nz = position.z + mz * speed * dt;
      // Axes resolved separately so a glancing hit slides along the corn
      // instead of stopping you dead.
      if (!blocked(nx, position.z)) position.x = nx;
      if (!blocked(position.x, nz)) position.z = nz;
    } else {
      motion.running = false;
    }

    // A jump goes straight up and comes straight down. Nothing in the field is
    // above head height to land on, so there is no ground to test but the one.
    vy -= GRAVITY * dt;
    position.y += vy * dt;
    if (position.y <= 0) {
      const fell = position.y < 0;
      position.y = 0;
      vy = 0;
      if (fell && onStep) onStep();
    }

    // How fast the body actually went, which is not how fast it was asked to
    // go: a corner takes a stride off you. The legs are driven by this, so
    // they stay with the ground — but not all the way down, or leaning on a
    // corn wall would leave somebody standing perfectly still against it.
    const went = Math.hypot(position.x - wasX, position.z - wasZ) / Math.max(dt, 1e-4);
    const paced = mag > 0.001 ? Math.max(WALK * 0.7, Math.min(speed, went)) : 0;

    // The footstep cadence follows the real pace, so running sounds like it.
    if (position.y <= 0.0001 && paced > 0.01) {
      walkT += dt * 6.4 * (paced / WALK);
      if (walkT - stepMark > Math.PI) { stepMark = walkT; if (onStep) onStep(); }
    }

    motion.x = position.x; motion.y = position.y; motion.z = position.z;
    motion.speed = paced;
    motion.airborne = position.y > 0.001;
    motion.vy = vy;

    // ---- the camera ----
    // A jump is 0.8m and lasts a moment; the camera takes it slowly, so the
    // hop is something the body does rather than something the field does.
    lift += (position.y - lift) * Math.min(1, dt * 6);
    // Stood a little off your shoulder rather than straight behind you, so a
    // 3.2m corridor is not entirely filled with the back of your own head.
    // The offset comes out again as the boom shortens — scaled by last frame's
    // length, so that the ray the corn is tested along is the one the camera
    // is actually on — or a camera pushed in against the corn would leave the
    // body out of frame.
    const off = SHOULDER * (boom / BOOM);
    focus.set(position.x + Math.cos(yaw) * off, lift + PIVOT, position.z - Math.sin(yaw) * off);

    const cp = Math.cos(pitch);
    dir.set(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);   // focus -> camera

    // Looking up walks the camera in towards the head; see `reach`.
    const want = BOOM * (pitch > 0 ? 1 - 0.9 * Math.pow(pitch / UP, 1.5) : 1);
    const fit = reach(want);
    // Snap in when something gets between you and the camera, ease back out
    // when it has gone. The other way round and you spend the corner inside a
    // corn wall, looking at the black side of it.
    boom = fit < boom ? fit : boom + (fit - boom) * Math.min(1, dt * 3.5);

    camera.position.copy(focus).addScaledVector(dir, boom);
    camera.lookAt(focus);

    // Once the boom is this short you are inside the body rather than behind
    // it, so it is faded out instead of being turned inside out.
    if (options.avatar) options.avatar.setOpacity(Math.max(0, Math.min(1, (boom - 0.7) / 0.45)));
  }

  return {
    update: update,
    lock: lock,
    controls: controls,

    // Where the player is standing — the body's feet, and the thing the rest
    // of the field should be reading rather than the camera.
    position: position,

    // How that body is moving, for whatever is drawing it.
    motion: motion
  };
}
