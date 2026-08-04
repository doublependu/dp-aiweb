// Maze generation: recursive backtracker on a room grid.
//
// Rooms live on the odd/odd cells of a FINE x FINE grid; the cells between
// them are the passages the carver opens. Everything downstream (ground
// texture, corn placement, collision) reads the same `isOpen` grid, so the
// walls you see and the walls you bump into can never disagree.

import { mulberry32, randomSeed } from './rng.js';

export const ROOMS = 9;
export const FINE = ROOMS * 2 + 1;
export const CELL = 3.2;
export const FIELD = FINE * CELL;

// The clearing at the middle of the maze, where the garden is. A corridor is
// too narrow to be anywhere, so the centre three-by-three block of fine cells
// is opened out into one room — wide enough to stand back and look at, and
// wide enough that four corridors run into it, which turns the centre from a
// junction into a place you can arrive at from any direction.
export const CLEARING_C = (FINE - 1) / 2;
export const CLEARING_HALF = 1;                   // fine cells either side
export const CLEARING_R = (CLEARING_HALF + 0.5) * CELL;   // world radius of the open floor

export function toWorld(fx, fy) {
  return { x: (fx - (FINE - 1) / 2) * CELL, z: (fy - (FINE - 1) / 2) * CELL };
}

// The carve runs on its own seeded generator, even though main.js has already
// swapped `Math.random` for a seeded one by the time this is called. The
// corridors are the one thing that has to survive everything: drawn from the
// shared stream, a three.js upgrade that generated one more UUID during
// startup would shift every wall in a maze somebody had learned their way
// around. Where a stalk leans can drift between versions. The maze cannot.
export function createMaze(seed) {
  const usedSeed = (typeof seed === 'number') ? (seed >>> 0) : randomSeed();
  const rand = mulberry32(usedSeed);

  const isOpen = [];
  for (let i = 0; i < FINE; i++) {
    isOpen.push(new Array(FINE).fill(false));
  }
  for (let rx = 0; rx < ROOMS; rx++) {
    for (let ry = 0; ry < ROOMS; ry++) isOpen[rx * 2 + 1][ry * 2 + 1] = true;
  }

  carve(isOpen, rand);

  // The clearing is opened after the carve, so the maze is a real maze first
  // and the middle of it is knocked through afterwards.
  for (let gx = CLEARING_C - CLEARING_HALF; gx <= CLEARING_C + CLEARING_HALF; gx++) {
    for (let gy = CLEARING_C - CLEARING_HALF; gy <= CLEARING_C + CLEARING_HALF; gy++) {
      isOpen[gx][gy] = true;
    }
  }

  // A few extra openings create loops — dead ends are stressful, loops are calming.
  for (let loop = 0; loop < 7; loop++) {
    const lx = 1 + ((rand() * (FINE - 2)) | 0);
    const ly = 1 + ((rand() * (FINE - 2)) | 0);
    if ((lx % 2) !== (ly % 2)) isOpen[lx][ly] = true;
  }

  const entranceRow = 1, exitRow = ROOMS - 2;
  isOpen[0][entranceRow * 2 + 1] = true;
  isOpen[FINE - 1][exitRow * 2 + 1] = true;

  return {
    isOpen,
    // Handed back so main.js can write it down. This number is the field.
    seed: usedSeed,
    entranceRow,
    exitRow,
    startPos: toWorld(1, entranceRow * 2 + 1),
    exitPos: toWorld(FINE - 2, exitRow * 2 + 1)
  };
}

function carve(isOpen, rand) {
  const seen = [];
  for (let a = 0; a < ROOMS; a++) seen.push(new Array(ROOMS).fill(false));
  const stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cxr = cur[0], cyr = cur[1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(function (d) {
      const nx = cxr + d[0], ny = cyr + d[1];
      return nx >= 0 && ny >= 0 && nx < ROOMS && ny < ROOMS && !seen[nx][ny];
    });
    if (!opts.length) { stack.pop(); continue; }
    const d2 = opts[(rand() * opts.length) | 0];
    seen[cxr + d2[0]][cyr + d2[1]] = true;
    isOpen[cxr * 2 + 1 + d2[0]][cyr * 2 + 1 + d2[1]] = true;
    stack.push([cxr + d2[0], cyr + d2[1]]);
  }
}

// The odd/odd cells that survived as rooms — where kernels and fireflies go.
export function openRooms(isOpen) {
  const rooms = [];
  for (let kx = 0; kx < FINE; kx++) {
    for (let ky = 0; ky < FINE; ky++) {
      if (isOpen[kx][ky] && kx % 2 === 1 && ky % 2 === 1) rooms.push([kx, ky]);
    }
  }
  return rooms;
}
