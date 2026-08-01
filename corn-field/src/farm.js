// The land outside the maze.
//
// The field used to run on forever in corn, which meant stepping out of the
// exit looked exactly like being lost inside it. Now the corn stops at the
// field boundary and what lies beyond is a harvested farm: stubble, a track,
// a barn, a tractor somebody left out. You can see where the maze is from
// outside, and coming out of it feels like arriving somewhere.
//
// The world still has no visible edge. It dissolves into haze and a
// suggestion of trees rather than into more corn.

import * as THREE from 'three';
import { FIELD } from './maze.js';

const HALF = FIELD / 2;
// How far out the stubble is populated. Past about sixty metres the haze has
// taken everything anyway, so instances spent out there are wasted.
const GRASS_R = 58;
// The treeline. Far enough out that it is a suggestion rather than a wall:
// the ring is centred on the field but the player can stand thirty metres
// off-centre, so anything nearer than this looms on the side you walk toward.
const TREE_R = 96;
const ROAD_X = -43;    // the track runs north-south, west of the entrance
const ROAD_W = 7.5;

export function createFarm(entrance, exit, maxAniso) {
  const group = new THREE.Group();
  const obstacles = [];
  const uTime = { value: 0 };
  const nightly = [];   // things that change when the light goes

  addOuterGround(group, maxAniso);
  addRoad(group, entrance, maxAniso);
  addStubble(group, uTime, maxAniso);

  const treeTex = makeTreeTexture(maxAniso);
  addTreeline(group, uTime, treeTex);

  addBarn(group, obstacles, nightly, maxAniso);
  addTractor(group, obstacles);
  addHayBales(group, obstacles, maxAniso);
  addFence(group, entrance);
  addScarecrow(group, obstacles, entrance);
  addRestSpot(group, obstacles, exit, treeTex);

  // Shadows, decided in one place because the rule is the same for the whole
  // farm: solid things cast and receive; the ground and the track only
  // receive; and the two instanced fields cast nothing. Seventeen thousand
  // tufts of stubble would put a second pass over the whole field to draw a
  // fringe of shadow half a metre long, and the treeline is a hundred metres
  // out, well past anything the shadow camera covers.
  group.traverse(function (o) {
    if (!o.isMesh) return;
    o.receiveShadow = true;
    const flat = Math.abs(o.rotation.x + Math.PI / 2) < 0.01;
    o.castShadow = !o.isInstancedMesh && !flat;
  });

  return {
    group: group,
    obstacles: obstacles,
    uTime: uTime,
    update: function (night) {
      for (let i = 0; i < nightly.length; i++) nightly[i](night);
    }
  };
}

// The same trick the corn uses: displace by h*h in the vertex shader so the
// plant pivots from its base, and never touch an instance matrix again.
//
// The normal is also thrown away and replaced with straight up. A billboard's
// real normal points whichever way the quad happens to face, so half of a
// scattered field ends up facing away from the sun and goes black — a lawn of
// dark blobs. Lighting every tuft as though it were a patch of ground is both
// cheaper and much closer to how grass actually reads.
function addWind(material, uTime, amount, speed) {
  material.onBeforeCompile = function (shader) {
    shader.uniforms.uTime = uTime;
    shader.uniforms.uAmount = { value: amount };
    shader.uniforms.uSpeed = { value: speed };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nuniform float uTime;\nuniform float uAmount;\nuniform float uSpeed;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '#ifdef USE_INSTANCING',
        '  vec3 iPos = instanceMatrix[3].xyz;',
        '  float h = clamp(position.y, 0.0, 1.0);',
        '  float phase = iPos.x * 0.55 + iPos.z * 0.42;',
        '  float gust = 0.62 + 0.38 * sin(uTime * 0.13 + iPos.x * 0.035 + iPos.z * 0.021);',
        '  float sway = sin(uTime * uSpeed + phase)',
        '             + sin(uTime * uSpeed * 2.4 + phase * 1.7) * 0.34;',
        '  transformed.x += sway * uAmount * h * h * gust;',
        '  transformed.z += sway * uAmount * 0.42 * h * h * gust;',
        '#endif'
      ].join('\n'));
  };
}

// True inside the block of corn, where nothing else should grow.
function inField(x, z) {
  return Math.abs(x) < HALF + 0.8 && Math.abs(z) < HALF + 0.8;
}

function onRoad(x) {
  return x > ROAD_X - ROAD_W * 0.75 && x < ROAD_X + ROAD_W * 0.75;
}

// =============================================================
// GROUND
// =============================================================
// Cut stubble: pale straw with the harvester's rows still in it. The rows are
// what make it read as a worked field rather than a lawn, so they go down
// first and everything else is scattered over them.
function addOuterGround(group, maxAniso) {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');

  g.fillStyle = '#a68d54';
  g.fillRect(0, 0, S, S);

  for (let y = 0; y < S; y += 16) {
    g.fillStyle = 'rgba(128,103,52,0.55)';
    g.fillRect(0, y, S, 6);
    g.fillStyle = 'rgba(212,193,136,0.42)';
    g.fillRect(0, y + 7, S, 4);
  }

  // cut stalks, still standing in their rows
  for (let n = 0; n < 9000; n++) {
    const x = Math.random() * S;
    const y = (Math.floor(Math.random() * (S / 16)) * 16) + 2 + Math.random() * 10;
    g.fillStyle = 'rgba(' + (196 + Math.random() * 45 | 0) + ',' +
                            (176 + Math.random() * 45 | 0) + ',' +
                            (110 + Math.random() * 50 | 0) + ',' +
                            (0.3 + Math.random() * 0.45).toFixed(2) + ')';
    g.fillRect(x, y, 1 + Math.random() * 2, 2 + Math.random() * 4);
  }

  // patches of bare earth showing through
  for (let n = 0; n < 260; n++) {
    const x = Math.random() * S, y = Math.random() * S;
    const r = 4 + Math.random() * 22;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(126,101,56,0.42)');
    rg.addColorStop(1, 'rgba(126,101,56,0)');
    g.fillStyle = rg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = maxAniso;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0 })
  );
  mesh.rotation.x = -Math.PI / 2;
  group.add(mesh);
}

// A dirt track past the west side of the field, with a short spur up to the
// entrance. It is the reason the entrance is where it is.
function addRoad(group, entrance, maxAniso) {
  const along = makeRoadTexture(maxAniso, false);
  along.wrapT = THREE.RepeatWrapping;
  along.repeat.set(1, 14);

  const mainMat = new THREE.MeshStandardMaterial({
    map: along, roughness: 1, transparent: true, depthWrite: false
  });
  const main = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 230), mainMat);
  main.rotation.x = -Math.PI / 2;
  main.position.set(ROAD_X, 0.02, 0);
  main.renderOrder = 1;
  group.add(main);

  // The spur, from the track up to the mouth of the maze.
  const from = ROAD_X - 1.5, to = entrance.x + 0.6;
  const across = makeRoadTexture(maxAniso, true);
  across.wrapS = THREE.RepeatWrapping;
  across.repeat.set(2.2, 1);

  const spur = new THREE.Mesh(
    new THREE.PlaneGeometry(to - from, 5.2),
    new THREE.MeshStandardMaterial({ map: across, roughness: 1, transparent: true, depthWrite: false })
  );
  spur.rotation.x = -Math.PI / 2;
  spur.position.set((from + to) / 2, 0.03, entrance.z);
  spur.renderOrder = 2;
  group.add(spur);
}

// Drawn tall, then optionally blitted sideways — the spur needs the same
// ruts running the other way, and rotating the texture is fiddlier than
// rotating the pixels once at load.
function makeRoadTexture(maxAniso, horizontal) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512;
  const g = c.getContext('2d');

  g.fillStyle = '#a98d5e';
  g.fillRect(0, 0, 128, 512);

  for (let s = 0; s < 2; s++) {
    const rx = s === 0 ? 34 : 94;
    const rg = g.createLinearGradient(rx - 16, 0, rx + 16, 0);
    rg.addColorStop(0, 'rgba(198,174,126,0)');
    rg.addColorStop(0.5, 'rgba(198,174,126,0.75)');
    rg.addColorStop(1, 'rgba(198,174,126,0)');
    g.fillStyle = rg;
    g.fillRect(rx - 16, 0, 32, 512);
  }

  // grass down the middle, grit everywhere
  g.fillStyle = 'rgba(122,116,62,0.30)';
  g.fillRect(58, 0, 12, 512);
  for (let n = 0; n < 7000; n++) {
    g.fillStyle = 'rgba(' + (90 + Math.random() * 110 | 0) + ',' +
                            (78 + Math.random() * 90 | 0) + ',' +
                            (50 + Math.random() * 60 | 0) + ',' +
                            (0.10 + Math.random() * 0.3).toFixed(2) + ')';
    g.fillRect(Math.random() * 128, Math.random() * 512, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }

  // Feathered sides, so the track fades into the stubble instead of being a
  // rectangle laid on top of it.
  const edge = g.createLinearGradient(0, 0, 128, 0);
  edge.addColorStop(0.00, 'rgba(0,0,0,1)');
  edge.addColorStop(0.16, 'rgba(0,0,0,0)');
  edge.addColorStop(0.84, 'rgba(0,0,0,0)');
  edge.addColorStop(1.00, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = edge;
  g.fillRect(0, 0, 128, 512);

  let out = c;
  if (horizontal) {
    out = document.createElement('canvas');
    out.width = 512; out.height = 128;
    const g2 = out.getContext('2d');
    g2.translate(0, 128);
    g2.rotate(-Math.PI / 2);
    g2.drawImage(c, 0, 0);
  }

  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = maxAniso;
  return tex;
}

// =============================================================
// STUBBLE, WEEDS AND THE TREELINE
// =============================================================
const GRASS_COUNT = 17000;

function addStubble(group, uTime, maxAniso) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);

  const mat = new THREE.MeshStandardMaterial({
    map: makeTuftTexture(maxAniso),
    side: THREE.DoubleSide,
    alphaTest: 0.34,
    roughness: 0.95,
    metalness: 0
  });
  addWind(mat, uTime, 0.13, 1.55);

  const mesh = new THREE.InstancedMesh(geo, mat, GRASS_COUNT);
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placed = 0, guard = 0;
  while (placed < GRASS_COUNT && guard++ < GRASS_COUNT * 8) {
    // Sampled on a disc, so density thins with distance the same way the
    // useful detail does. Anything past the haze is a wasted instance.
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * GRASS_R;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (inField(x, z) || onRoad(x)) continue;

    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, Math.random() * Math.PI, 0);
    // Short. This is stubble in a cut field, not meadow — anything much over
    // half a metre stops reading as "harvested" and starts reading as
    // "abandoned", which is a different and less peaceful picture.
    const h = 0.2 + Math.random() * 0.42;
    dummy.scale.set(h * (1.0 + Math.random() * 0.5), h, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    // Dry gold most of the time, with the odd green survivor.
    const dry = Math.random() > 0.22;
    tint.setHSL(dry ? 0.13 + Math.random() * 0.04 : 0.24 + Math.random() * 0.05,
                0.26 + Math.random() * 0.20,
                0.60 + Math.random() * 0.28);
    mesh.setColorAt(placed, tint);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}

// A tuft of dry grass with a few seed heads, and sometimes a flower.
function makeTuftTexture(maxAniso) {
  const W = 128, H = 128;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const baseY = H - 1;

  // Many fine blades rather than a few thick ones: at a distance a handful of
  // heavy strokes reads as a dead shrub, which is the wrong plant entirely.
  for (let b = 0; b < 54; b++) {
    const lean = (Math.random() - 0.5) * 46;
    const x0 = W / 2 + (Math.random() - 0.5) * 52;
    const top = 16 + Math.random() * 62;
    g.strokeStyle = 'rgba(' + (150 + Math.random() * 80 | 0) + ',' +
                              (140 + Math.random() * 70 | 0) + ',' +
                              (72 + Math.random() * 60 | 0) + ',0.95)';
    g.lineWidth = 1.0 + Math.random() * 1.5;
    g.beginPath();
    g.moveTo(x0, baseY);
    g.quadraticCurveTo(x0 + lean * 0.35, (baseY + top) / 2, x0 + lean, top);
    g.stroke();

    if (Math.random() > 0.72) {
      g.fillStyle = 'rgba(214,196,132,0.9)';
      g.beginPath();
      g.ellipse(x0 + lean, top, 1.8, 4.5, lean * 0.01, 0, Math.PI * 2);
      g.fill();
    }
  }

  // a flower head or two — the only saturated colour out here
  for (let f = 0; f < 2; f++) {
    if (Math.random() > 0.5) continue;
    const fx = W / 2 + (Math.random() - 0.5) * 40, fy = 16 + Math.random() * 34;
    g.fillStyle = Math.random() > 0.5 ? 'rgba(226,208,110,0.95)' : 'rgba(206,150,178,0.9)';
    for (let p = 0; p < 6; p++) {
      const a = p / 6 * Math.PI * 2;
      g.beginPath();
      g.ellipse(fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 3.2, 2.4, 2.4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  return tex;
}

const TREE_COUNT = 240;

// A ring of trees at the edge of what the haze lets you see. They are never
// meant to be reached or looked at closely; they exist so the horizon has
// something in it other than nothing.
function addTreeline(group, uTime, treeTex) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.translate(0, 0.5, 0);

  const mat = new THREE.MeshStandardMaterial({
    map: treeTex, side: THREE.DoubleSide, alphaTest: 0.4, roughness: 1, metalness: 0
  });
  addWind(mat, uTime, 0.06, 0.5);

  const mesh = new THREE.InstancedMesh(geo, mat, TREE_COUNT * 2);
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let idx = 0;
  for (let i = 0; i < TREE_COUNT; i++) {
    const a = (i / TREE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.06;
    const r = TREE_R + (Math.random() - 0.5) * 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 7 + Math.random() * 6;
    // Every tree needs its own base angle. Without one, all the quads line up
    // with the world axes, and looking down an axis turns every tree in the
    // ring into an edge-on sliver at once.
    const base = Math.random() * Math.PI;
    tint.setHSL(0.26 + Math.random() * 0.05, 0.22 + Math.random() * 0.14, 0.30 + Math.random() * 0.16);
    // Crossed pair, like the corn — a single quad flickers out of existence
    // as you walk along the line.
    for (let q = 0; q < 2; q++) {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, base + q * Math.PI / 2, 0);
      dummy.scale.set(h * 0.8, h, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(idx, dummy.matrix);
      mesh.setColorAt(idx, tint);
      idx++;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}

function makeTreeTexture(maxAniso) {
  const W = 128, H = 160;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');

  g.fillStyle = '#5a4326';
  g.fillRect(W / 2 - 5, H * 0.55, 10, H * 0.45);

  // Blobs of canopy. It only ever reads at a distance, so a silhouette with
  // some internal variation is the whole job.
  for (let n = 0; n < 90; n++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.pow(Math.random(), 0.55);
    const x = W / 2 + Math.cos(a) * rr * 52;
    const y = H * 0.36 + Math.sin(a) * rr * 44;
    const sz = 8 + Math.random() * 20;
    const l = 0.55 + (1 - rr) * 0.35;
    g.fillStyle = 'rgba(' + (60 * l | 0) + ',' + (95 * l | 0) + ',' + (48 * l | 0) + ',0.95)';
    g.beginPath(); g.arc(x, y, sz, 0, Math.PI * 2); g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = maxAniso;
  return tex;
}

// =============================================================
// THE BARN
// =============================================================
const BARN = { x: -53, z: -37, w: 15, d: 10, wall: 5.2, ridge: 3.4, turn: 0.22 };

function addBarn(group, obstacles, nightly, maxAniso) {
  const barn = new THREE.Group();
  barn.position.set(BARN.x, 0, BARN.z);
  barn.rotation.y = BARN.turn;

  const plank = new THREE.MeshStandardMaterial({ map: makePlankTexture(maxAniso), roughness: 0.95, metalness: 0 });
  const roofMat = new THREE.MeshStandardMaterial({
    map: makeRoofTexture(maxAniso), side: THREE.DoubleSide, roughness: 0.7, metalness: 0.1
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(BARN.w, BARN.wall, BARN.d), plank);
  body.position.y = BARN.wall / 2;
  barn.add(body);

  // The two roof planes. A plane lying in XY, tilted about x by
  // -atan2(d/2, ridge), puts its top edge on the ridge and its bottom edge on
  // the eave — the sign flips for the far slope.
  const slope = Math.sqrt(BARN.d * BARN.d / 4 + BARN.ridge * BARN.ridge);
  const tilt = Math.atan2(BARN.d / 2, BARN.ridge);
  for (let s = -1; s <= 1; s += 2) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(BARN.w + 1.2, slope + 0.7), roofMat);
    panel.rotation.x = -s * tilt;
    panel.position.set(0, BARN.wall + BARN.ridge / 2, s * BARN.d / 4);
    barn.add(panel);
  }

  // Gable ends: one triangle each, filling the space under the roof.
  const gableMat = new THREE.MeshStandardMaterial({ map: plank.map, side: THREE.DoubleSide, roughness: 0.95 });
  for (let s = -1; s <= 1; s += 2) {
    const geo = new THREE.BufferGeometry();
    const x = s * BARN.w / 2;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      x, BARN.wall, -BARN.d / 2,
      x, BARN.wall, BARN.d / 2,
      x, BARN.wall + BARN.ridge, 0
    ]), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2));
    geo.computeVertexNormals();
    barn.add(new THREE.Mesh(geo, gableMat));
  }

  // the big sliding door, and its rail
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.95 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(5.4, 4.0, 0.22), doorMat);
  door.position.set(-2.2, 2.0, BARN.d / 2 + 0.06);
  barn.add(door);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.22, 0.3), doorMat);
  rail.position.set(-1.4, 4.25, BARN.d / 2 + 0.1);
  barn.add(rail);

  // Windows. This is the barn's whole contribution to the night: two warm
  // rectangles a long way off, saying somebody lives out here.
  const panes = [];
  const halos = [];
  for (let w = 0; w < 2; w++) {
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.2),
      new THREE.MeshBasicMaterial({ color: 0x2b2a26 })
    );
    pane.position.set(3.2 + w * 2.6, 3.3, BARN.d / 2 + 0.07);
    barn.add(pane);
    panes.push(pane);

    const halo = glowSprite(0xffc770, 5);
    halo.position.copy(pane.position);
    halo.position.z += 0.3;
    barn.add(halo);
    halos.push(halo);
  }

  // a lamp over the door
  const lamp = glowSprite(0xffd28a, 7);
  lamp.position.set(-2.2, 4.7, BARN.d / 2 + 0.5);
  barn.add(lamp);
  halos.push(lamp);

  nightly.push(function (night) {
    // Squared, so the windows come on late in the dusk rather than easing up
    // through it — a light being switched on is an event.
    const lit = night * night;
    for (let i = 0; i < panes.length; i++) {
      panes[i].material.color.setRGB(0.17 + lit * 0.83, 0.16 + lit * 0.62, 0.14 + lit * 0.26);
    }
    for (let i = 0; i < halos.length; i++) halos[i].material.opacity = lit * 0.6;
  });

  group.add(barn);
  obstacles.push({ x: BARN.x, z: BARN.z, hw: BARN.w / 2 + 0.4, hd: BARN.d / 2 + 0.4, turn: BARN.turn });
}

let haloTexture = null;
function glowSprite(color, size) {
  if (!haloTexture) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,0.9)');
    rg.addColorStop(0.3, 'rgba(255,255,255,0.28)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    haloTexture = new THREE.CanvasTexture(c);
  }
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: haloTexture, color: color, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  spr.scale.set(size, size, 1);
  return spr;
}

function makePlankTexture(maxAniso) {
  const W = 256, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#7d3c2c';
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) {
    const shade = 0.82 + Math.random() * 0.36;
    g.fillStyle = 'rgb(' + (125 * shade | 0) + ',' + (60 * shade | 0) + ',' + (44 * shade | 0) + ')';
    g.fillRect(x, 0, 15, H);
    g.fillStyle = 'rgba(40,18,12,0.55)';
    g.fillRect(x + 15, 0, 1, H);
  }
  // weathering: the paint has gone chalky in patches
  for (let n = 0; n < 2600; n++) {
    g.fillStyle = 'rgba(' + (170 + Math.random() * 60 | 0) + ',' +
                            (140 + Math.random() * 50 | 0) + ',' +
                            (120 + Math.random() * 40 | 0) + ',' +
                            (0.04 + Math.random() * 0.12).toFixed(2) + ')';
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 5, 1 + Math.random() * 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = maxAniso;
  return tex;
}

function makeRoofTexture(maxAniso) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#4c4a45';
  g.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 8) {
    g.fillStyle = 'rgba(96,94,88,0.7)';
    g.fillRect(x, 0, 3, 128);
    g.fillStyle = 'rgba(30,29,27,0.5)';
    g.fillRect(x + 5, 0, 2, 128);
  }
  for (let n = 0; n < 400; n++) {
    g.fillStyle = 'rgba(122,86,54,' + (0.05 + Math.random() * 0.2).toFixed(2) + ')';
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 6, 2 + Math.random() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 2);
  tex.anisotropy = maxAniso;
  return tex;
}

// =============================================================
// THINGS LEFT LYING ABOUT
// =============================================================
// Parked just inside the gate with the keys probably still in it.
function addTractor(group, obstacles) {
  const t = new THREE.Group();
  t.position.set(-35.5, 0, -25.8);
  t.rotation.y = -0.55;

  const red = new THREE.MeshStandardMaterial({ color: 0x9e3320, roughness: 0.62, metalness: 0.25 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.85 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x6f7176, roughness: 0.5, metalness: 0.4 });

  const bonnet = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.95, 2.5), red);
  bonnet.position.set(0, 1.15, 0.75);
  t.add(bonnet);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.7, 3.4), red);
  belly.position.set(0, 0.72, 0.1);
  t.add(belly);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.75), black);
  seat.position.set(0, 1.42, -0.95);
  t.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.62, 0.18), black);
  back.position.set(0, 1.72, -1.3);
  t.add(back);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), grey);
  column.position.set(0, 1.72, -0.32);
  column.rotation.x = 0.42;
  t.add(column);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 16), black);
  wheel.position.set(0, 2.08, -0.16);
  wheel.rotation.x = Math.PI / 2 - 0.42;
  t.add(wheel);

  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.5, 8), grey);
  pipe.position.set(0.42, 2.05, 1.5);
  t.add(pipe);

  const rearGeo = new THREE.CylinderGeometry(0.92, 0.92, 0.42, 16);
  const frontGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 14);
  const hubGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.44, 12);
  for (let s = -1; s <= 1; s += 2) {
    const rear = new THREE.Mesh(rearGeo, black);
    rear.position.set(s * 0.92, 0.92, -1.0);
    rear.rotation.z = Math.PI / 2;
    t.add(rear);

    const hub = new THREE.Mesh(hubGeo, grey);
    hub.position.set(s * 0.95, 0.92, -1.0);
    hub.rotation.z = Math.PI / 2;
    t.add(hub);

    const front = new THREE.Mesh(frontGeo, black);
    front.position.set(s * 0.72, 0.5, 1.6);
    front.rotation.z = Math.PI / 2;
    t.add(front);

    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.05, 2.1), red);
    fender.position.set(s * 0.86, 1.35, -1.0);
    t.add(fender);
  }

  group.add(t);
  obstacles.push({ x: t.position.x, z: t.position.z, r: 2.3 });
}

// Round bales, stacked the way round bales get stacked.
function addHayBales(group, obstacles, maxAniso) {
  const mat = new THREE.MeshStandardMaterial({ map: makeStrawTexture(maxAniso), roughness: 1, metalness: 0 });
  const geo = new THREE.CylinderGeometry(0.95, 0.95, 1.5, 14);

  // x, z, tier
  const spots = [
    [-50.5, -30.5, 0], [-50.5, -28.4, 0], [-50.5, -26.3, 0],
    [-50.5, -29.4, 1], [-50.5, -27.3, 1],
    [-34.5, 24.5, 0], [-34.5, 22.4, 0]
  ];
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    const bale = new THREE.Mesh(geo, mat);
    bale.position.set(s[0], 0.95 + s[2] * 1.7, s[1]);
    bale.rotation.z = Math.PI / 2;
    bale.rotation.y = Math.random() * 0.2;
    group.add(bale);
    if (s[2] === 0) obstacles.push({ x: s[0], z: s[1], r: 1.35 });
  }
}

function makeStrawTexture(maxAniso) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c6a961';
  g.fillRect(0, 0, 128, 128);
  for (let n = 0; n < 2600; n++) {
    const x = Math.random() * 128, y = Math.random() * 128;
    g.strokeStyle = 'rgba(' + (150 + Math.random() * 90 | 0) + ',' +
                              (128 + Math.random() * 80 | 0) + ',' +
                              (60 + Math.random() * 60 | 0) + ',' +
                              (0.2 + Math.random() * 0.5).toFixed(2) + ')';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 4);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = maxAniso;
  return tex;
}

// Posts and two wire runs along the field side of the track, with a gap where
// the spur goes through.
function addFence(group, entrance) {
  const postMat = new THREE.MeshStandardMaterial({ color: 0x6a5636, roughness: 1 });
  const from = -96, to = 96, step = 3.1;
  const x = ROAD_X + ROAD_W * 0.5 + 1.2;

  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 1.4, 0.14), postMat,
    Math.ceil((to - from) / step) + 1
  );
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let z = from; z <= to; z += step) {
    if (Math.abs(z - entrance.z) < 4.0) continue;   // the gateway
    dummy.position.set(x + (Math.random() - 0.5) * 0.12, 0.7, z);
    dummy.rotation.set((Math.random() - 0.5) * 0.06, Math.random() * 0.3, (Math.random() - 0.5) * 0.09);
    dummy.scale.set(1, 0.9 + Math.random() * 0.25, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(n++, dummy.matrix);
  }
  posts.count = n;
  posts.instanceMatrix.needsUpdate = true;
  group.add(posts);

  // Two wires. A thin long box reads better than a Line, which has no
  // thickness and disappears at a distance.
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.8, metalness: 0.3 });
  const spans = [[from, entrance.z - 4.2], [entrance.z + 4.2, to]];
  for (let s = 0; s < spans.length; s++) {
    const len = spans[s][1] - spans[s][0];
    const mid = (spans[s][0] + spans[s][1]) / 2;
    for (let h = 0; h < 2; h++) {
      const wire = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, len), wireMat);
      wire.position.set(x, 0.72 + h * 0.42, mid);
      group.add(wire);
    }
  }
}

// Standing just outside the corn near the entrance, so you pass it on the way
// in and recognise it on the way out.
function addScarecrow(group, obstacles, entrance) {
  const s = new THREE.Group();
  s.position.set(entrance.x - 2.6, 0, entrance.z + 7.5);
  s.rotation.y = -1.1;

  const wood = new THREE.MeshStandardMaterial({ color: 0x6a5233, roughness: 1 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x7d6c4a, roughness: 1 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x4d6470, roughness: 1 });
  const hat = new THREE.MeshStandardMaterial({ color: 0xb59a5c, roughness: 1 });

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 2.5, 0.13), wood);
  post.position.y = 1.25;
  s.add(post);

  const arms = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.11, 0.11), wood);
  arms.position.y = 1.85;
  arms.rotation.z = 0.06;
  s.add(arms);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.34), shirt);
  torso.position.y = 1.62;
  s.add(torso);

  for (let a = -1; a <= 1; a += 2) {
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.2), shirt);
    sleeve.position.set(a * 0.62, 1.85 + a * 0.02, 0);
    s.add(sleeve);
  }

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), cloth);
  head.position.y = 2.28;
  head.scale.set(1, 1.15, 0.95);
  s.add(head);

  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), hat);
  brim.position.y = 2.48;
  brim.rotation.z = 0.12;
  s.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 14), hat);
  crown.position.set(0.03, 2.62, 0);
  crown.rotation.z = 0.12;
  s.add(crown);

  group.add(s);
  obstacles.push({ x: s.position.x, z: s.position.z, r: 0.5 });
}

// A bench under a tree, out past the exit. Nothing happens here. That is the
// point of it — somewhere to have arrived at and sit, if finding the way out
// is going to mean anything at all.
function addRestSpot(group, obstacles, exit, treeTex) {
  const x = exit.x + 9.5, z = exit.z + 4.5;

  const tree = new THREE.Group();
  tree.position.set(x + 2.6, 0, z - 2.4);
  const treeMat = new THREE.MeshStandardMaterial({
    map: treeTex, side: THREE.DoubleSide, alphaTest: 0.4, roughness: 1
  });
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  leafGeo.translate(0, 0.5, 0);
  for (let q = 0; q < 3; q++) {
    const quad = new THREE.Mesh(leafGeo, treeMat);
    quad.scale.set(9.5, 12, 1);
    quad.rotation.y = q * Math.PI / 3;
    tree.add(quad);
  }
  group.add(tree);
  obstacles.push({ x: tree.position.x, z: tree.position.z, r: 0.7 });

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a41, roughness: 1 });
  const bench = new THREE.Group();
  bench.position.set(x, 0, z);
  bench.rotation.y = -0.9;   // facing back at the corn

  const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.09, 0.5), wood);
  seat.position.y = 0.46;
  bench.add(seat);
  const rest = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.32, 0.08), wood);
  rest.position.set(0, 0.82, -0.22);
  rest.rotation.x = -0.16;
  bench.add(rest);
  for (let s = -1; s <= 1; s += 2) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.46), wood);
    leg.position.set(s * 0.9, 0.23, 0);
    bench.add(leg);
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.55, 0.09), wood);
    upright.position.set(s * 0.9, 0.7, -0.2);
    bench.add(upright);
  }
  group.add(bench);
  obstacles.push({ x: x, z: z, r: 1.15 });
}
