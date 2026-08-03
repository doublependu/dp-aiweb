// Movement, collision and camera.

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { FINE, CELL, toWorld } from './maze.js';

const EYE = 1.62;
const SPEED = 2.05;
const TURN = 1.5;
const BODY = 0.26;   // how much room the player takes up

export function createPlayer(options) {
  const camera = options.camera;
  const domElement = options.domElement;
  const isOpen = options.isOpen;
  const reduceMotion = options.reduceMotion;
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

  camera.position.set(options.startPos.x, EYE, options.startPos.z);
  camera.rotation.order = 'YXZ';

  // Asymmetric on purpose, and the same limits both ways of looking. There is
  // nothing under your feet but a path, and there is a moon and a sky full of
  // stars overhead — at the old limit of 0.55 up, a full moon at midnight
  // sits above the top of the screen and you can never quite look at it.
  const UP = 0.98, DOWN = -0.55;

  // Mouse look proper, once you have clicked into it. The drag-to-look below
  // stays because pointer lock is a desktop-only idea and a phone still has
  // to be able to turn round.
  const controls = new PointerLockControls(camera, domElement);
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

  let walkT = 0;

  function blocked(x, z) {
    const fx = Math.round(x / CELL + (FINE - 1) / 2);
    const fy = Math.round(z / CELL + (FINE - 1) / 2);
    for (let ax = -1; ax <= 1; ax++) {
      for (let ay = -1; ay <= 1; ay++) {
        const cx2 = fx + ax, cy2 = fy + ay;
        if (cx2 < 0 || cy2 < 0 || cx2 >= FINE || cy2 >= FINE) continue;
        if (isOpen[cx2][cy2]) continue;
        const w = toWorld(cx2, cy2);
        if (Math.abs(x - w.x) < CELL * 0.5 + 0.24 && Math.abs(z - w.z) < CELL * 0.5 + 0.24) return true;
      }
    }

    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const dx = x - o.x, dz = z - o.z;
      if (o.r !== undefined) {
        const rr = o.r + BODY;
        if (dx * dx + dz * dz < rr * rr) return true;
      } else {
        // Rotate into the box's own frame rather than growing an
        // axis-aligned bound around it, which for the barn would put an
        // invisible wall several metres out from the real one.
        const turn = o.turn || 0;
        const c = Math.cos(-turn), s = Math.sin(-turn);
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        if (Math.abs(lx) < o.hw + BODY && Math.abs(lz) < o.hd + BODY) return true;
      }
    }
    return false;
  }

  function update(dt) {
    // While the pointer is locked the controls own the camera, so the frame
    // starts by taking their word for where you are looking rather than
    // writing over it. Everything downstream then works the same either way.
    if (controls.isLocked) {
      yaw = camera.rotation.y;
      pitch = camera.rotation.x;
    }

    if (keys['arrowleft']) yaw += TURN * dt;
    if (keys['arrowright']) yaw -= TURN * dt;

    let mx = 0, mz = 0;
    // The arrows walk the way the arrow points; w/a/s/d do the usual thing.
    if (keys['w'] || keys['arrowup']) { mx -= Math.sin(yaw); mz -= Math.cos(yaw); }
    if (keys['s'] || keys['arrowdown']) { mx += Math.sin(yaw); mz += Math.cos(yaw); }
    if (keys['a']) { mx -= Math.cos(yaw); mz += Math.sin(yaw); }
    if (keys['d']) { mx += Math.cos(yaw); mz -= Math.sin(yaw); }

    const mag = Math.sqrt(mx * mx + mz * mz);
    if (mag > 0.001) {
      mx /= mag; mz /= mag;
      walkT += dt * 6.4;
      const nx = camera.position.x + mx * SPEED * dt;
      const nz = camera.position.z + mz * SPEED * dt;
      // Axes resolved separately so a glancing hit slides along the corn
      // instead of stopping you dead.
      if (!blocked(nx, camera.position.z)) camera.position.x = nx;
      if (!blocked(camera.position.x, nz)) camera.position.z = nz;
    }

    camera.position.y = EYE + (mag > 0.001 && !reduceMotion ? Math.sin(walkT) * 0.042 : 0);
    camera.rotation.set(pitch, yaw, 0);
  }

  return { update: update, lock: lock, controls: controls };
}
