// Movement, collision and camera.

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

  domElement.addEventListener('pointerdown', function (e) {
    dragging = true; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('pointerup', function () { dragging = false; });
  window.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    yaw -= (e.clientX - lastX) * 0.0035;
    // Asymmetric on purpose. There is nothing under your feet but a path, and
    // there is now a moon and a sky full of stars overhead — at the old limit
    // of 0.55 up, a full moon at midnight sits above the top of the screen
    // and you can never quite look at it.
    pitch = Math.max(-0.55, Math.min(0.98, pitch - (e.clientY - lastY) * 0.0035));
    lastX = e.clientX; lastY = e.clientY;
  });

  camera.position.set(options.startPos.x, EYE, options.startPos.z);
  camera.rotation.order = 'YXZ';

  let walkT = 0, stepMark = 0;

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
    if (keys['arrowleft']) yaw += TURN * dt;
    if (keys['arrowright']) yaw -= TURN * dt;

    let mx = 0, mz = 0;
    if (keys['s'] || keys['arrowup']) { mx += Math.sin(yaw); mz += Math.cos(yaw); }
    if (keys['w'] || keys['arrowdown']) { mx -= Math.sin(yaw); mz -= Math.cos(yaw); }
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

      if (walkT - stepMark > Math.PI) { stepMark = walkT; if (onStep) onStep(); }
    }

    camera.position.y = EYE + (mag > 0.001 && !reduceMotion ? Math.sin(walkT) * 0.042 : 0);
    camera.rotation.set(pitch, yaw, 0);
  }

  return { update };
}
