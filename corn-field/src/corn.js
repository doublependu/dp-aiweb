// The corn: one InstancedMesh, ~11k crossed billboards, a single draw call.
//
// Two constraints hold this together and should not be relaxed:
//   * the plants are alpha-tested quads sharing one canvas-drawn texture, not
//     geometry — per-plant meshes were too sparse to read as a maze at a
//     density that still ran;
//   * the sway lives in the vertex shader. Instance matrices are uploaded once
//     and never touched again; moving sway back to per-frame CPU matrix
//     updates was the original bottleneck.

import * as THREE from 'three';
import { FINE, CELL, toWorld } from './maze.js';

// Doubled from the original 15. At 15 you could see the next corridor over
// through the gaps between stalks, which made the maze feel like a suggestion
// rather than a wall. The budget for it comes from the corn that used to
// carry on past the field boundary — that is farm.js's job now.
const PER_CELL = 30;
const QUADS = 2;      // crossed pair per plant

export function createCorn(isOpen, maxAniso) {
  const uTime = { value: 0 };
  const cornTex = makeCornTexture(maxAniso);

  const cornMat = new THREE.MeshStandardMaterial({
    map: cornTex,
    side: THREE.DoubleSide,
    // Lowered from 0.38: it keeps the soft outer edge of every leaf instead
    // of cutting it away, which is a surprising amount of the opacity of a
    // wall of corn.
    alphaTest: 0.28,
    roughness: 0.92,
    metalness: 0.0
  });

  // Displacing by h*h makes the plant pivot from its base instead of sliding
  // sideways as a whole.
  const WIND = [
    '#include <begin_vertex>',
    '#ifdef USE_INSTANCING',
    '  vec3 iPos = instanceMatrix[3].xyz;',
    '  float h = clamp(position.y, 0.0, 1.0);',
    '  float bend = h * h;',
    '  float phase = iPos.x * 0.55 + iPos.z * 0.42;',
    '  float gust = 0.62 + 0.38 * sin(uTime * 0.13 + iPos.x * 0.035 + iPos.z * 0.021);',
    '  float sway = sin(uTime * 1.05 + phase) * 0.20',
    '             + sin(uTime * 2.60 + phase * 1.7) * 0.065',
    '             + sin(uTime * 0.47 + phase * 0.5) * 0.10;',
    '  transformed.x += sway * bend * gust;',
    '  transformed.z += sway * 0.42 * bend * gust;',
    '#endif'
  ].join('\n');

  function bendInWind(shader) {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', WIND);
  }

  cornMat.onBeforeCompile = bendInWind;

  // The shadow pass runs its own material, which knows nothing about the
  // wind. Left alone, eleven thousand plants would sway while their shadows
  // stood still — which is far more noticeable than no shadow at all. So the
  // depth material gets the identical displacement, and the alpha map too, or
  // every plant would cast the shadow of a solid rectangle.
  const depthMat = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: cornTex,
    alphaTest: 0.28
  });
  depthMat.onBeforeCompile = bendInWind;

  const plantGeo = new THREE.PlaneGeometry(1, 1, 1, 4);
  plantGeo.translate(0, 0.5, 0);

  const plants = placePlants(isOpen);

  const mesh = new THREE.InstancedMesh(plantGeo, cornMat, plants.length * QUADS);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  // Casts but does not receive, which is a deliberate asymmetry.
  //
  // A billboard has no real normal — DoubleSide flips it to face the camera,
  // which is the whole reason a wall of flat quads reads as a lit plant at
  // all. Shadow receiving does not play along: it samples by world position,
  // so the wall comes back mottled with the shadows of the leaves in front of
  // it, and the field goes from summer green to a dark, blotchy olive. It is
  // arguably more correct and it looks worse, and this scene's colour was
  // hand-picked against corn lit the other way. The shadows that matter are
  // the ones the corn throws across the corridor floor, and those are cast,
  // not received.
  mesh.receiveShadow = false;
  mesh.customDepthMaterial = depthMat;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let idx = 0;
  for (let pi = 0; pi < plants.length; pi++) {
    const pl = plants[pi];
    tint.setHSL(0.23 + Math.random() * 0.06, 0.34 + Math.random() * 0.2, 0.62 + Math.random() * 0.22);
    for (let q = 0; q < QUADS; q++) {
      dummy.position.set(pl.x, 0, pl.z);
      // A little lean. Plants that all stand dead upright line their gaps up
      // with each other; leaning them breaks the sightlines through the wall.
      dummy.rotation.set(pl.tx, pl.r + q * (Math.PI / QUADS), pl.tz);
      dummy.scale.set(pl.w, pl.h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      mesh.setColorAt(idx, tint);
      idx++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return { mesh, uTime };
}

// Heights stay above the 1.62m eye line — shorter than ~2.2m and the maze
// stops enclosing the player.
//
// The corn stops at the field boundary now. It used to carry on into the
// distance so the world had no visible edge; the world still has no visible
// edge, but what is out there is farmland (see farm.js) rather than more of
// the same, so that the maze is a thing you can see the shape of from
// outside it.
function placePlants(isOpen) {
  const plants = [];

  for (let wx = 0; wx < FINE; wx++) {
    for (let wy = 0; wy < FINE; wy++) {
      if (isOpen[wx][wy]) continue;
      const wc = toWorld(wx, wy);
      for (let p = 0; p < PER_CELL; p++) {
        plants.push({
          x: wc.x + (Math.random() - 0.5) * CELL * 1.02,
          z: wc.z + (Math.random() - 0.5) * CELL * 1.02,
          h: 2.7 + Math.random() * 0.85,
          w: 1.5 + Math.random() * 0.62,
          r: Math.random() * Math.PI,
          tx: (Math.random() - 0.5) * 0.16,
          tz: (Math.random() - 0.5) * 0.16
        });
      }
    }
  }

  return plants;
}

// One plant drawn to a canvas: stalk, leaves, an ear and a tassel.
function makeCornTexture(maxAniso) {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cx = W / 2, baseY = H - 2, topY = H * 0.11;

  // --- stalk
  const sg = g.createLinearGradient(cx - 8, 0, cx + 8, 0);
  sg.addColorStop(0.0, '#456a22');
  sg.addColorStop(0.45, '#82ad42');
  sg.addColorStop(1.0, '#3d5f1d');
  g.fillStyle = sg;
  g.beginPath();
  g.moveTo(cx - 8, baseY);
  g.lineTo(cx - 3.5, topY);
  g.lineTo(cx + 3.5, topY);
  g.lineTo(cx + 8, baseY);
  g.closePath();
  g.fill();

  // --- leaves
  function leaf(attachY, dir, len, rise, droop, c0, c1) {
    const tipX = cx + dir * len;
    const tipY = attachY - rise + droop;
    const a1x = cx + dir * len * 0.30, a1y = attachY - rise * 0.85;
    const a2x = cx + dir * len * 0.72, a2y = attachY - rise * 0.95;
    const w = Math.max(8, len * 0.17);

    g.beginPath();
    g.moveTo(cx, attachY + w * 0.55);
    g.bezierCurveTo(a1x, a1y + w, a2x, a2y + w * 0.75, tipX, tipY);
    g.bezierCurveTo(a2x, a2y - w * 0.45, a1x, a1y - w * 0.65, cx, attachY - w * 0.85);
    g.closePath();
    const lg = g.createLinearGradient(cx, attachY, tipX, tipY);
    lg.addColorStop(0, c0);
    lg.addColorStop(1, c1);
    g.fillStyle = lg;
    g.fill();

    g.strokeStyle = 'rgba(238,255,206,0.20)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(cx, attachY);
    g.bezierCurveTo(a1x, a1y + w * 0.2, a2x, a2y + w * 0.1, tipX, tipY);
    g.stroke();
  }

  const pal = [['#3a651b', '#7fb340'], ['#48782a', '#93c04c'], ['#325718', '#6ea033']];
  const ROWS = 8;
  for (let i = 0; i < ROWS; i++) {
    const f = i / (ROWS - 1);
    const attachY = baseY - (H * 0.74) * f - 22;
    const dir = (i % 2 === 0) ? -1 : 1;
    const len = Math.min(cx - 8, 112 * (1 - f * 0.42) * (0.85 + Math.random() * 0.3));
    leaf(attachY, dir, len, 42 * (1 - f * 0.3), 58 * (1 - f * 0.4),
         pal[i % 3][0], pal[i % 3][1]);
  }

  // --- ear of corn tucked against the stalk
  g.save();
  g.translate(cx + 9, baseY - H * 0.30);
  g.rotate(0.22);
  g.fillStyle = '#a8bf5c';
  g.beginPath();
  g.ellipse(0, 0, 11, 34, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(70,100,30,0.5)';
  g.lineWidth = 1;
  for (let e = -2; e <= 2; e++) {
    g.beginPath(); g.moveTo(e * 4, -32); g.lineTo(e * 4, 32); g.stroke();
  }
  g.strokeStyle = '#c9a05a'; g.lineWidth = 2;
  for (let s = 0; s < 5; s++) {
    g.beginPath();
    g.moveTo(0, -32);
    g.quadraticCurveTo(4 + s * 3, -46, 2 + s * 5, -58);
    g.stroke();
  }
  g.restore();

  // --- tassel
  g.strokeStyle = '#cbab6d';
  g.lineWidth = 2.2;
  for (let t = 0; t < 9; t++) {
    const ang = (t / 8 - 0.5) * 1.25;
    g.beginPath();
    g.moveTo(cx, topY + 30);
    g.quadraticCurveTo(cx + Math.sin(ang) * 24, topY - 2,
                       cx + Math.sin(ang) * 42, topY - 26);
    g.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
