// The player, seen from outside.
//
// One glTF character with seven clips, and a small state machine that decides
// how much of each one you are looking at. Everything here is presentation:
// where the body is and which way it points is decided in `player.js`, and
// handed over each frame. This module never moves anybody.
//
// The one binary asset in the project, which is a deliberate exception to the
// canvas-and-code rule elsewhere — a walk cycle is not something you draw in a
// 2D context at load time.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URL = import.meta.env.BASE_URL + 'hero_male.glb';

// Scaled to this at load, from whatever the file happens to be authored at.
// The camera used to sit at 1.62 and the corn is 2.6m at its shortest; a body
// of about this height keeps the same relationship to both.
const HEIGHT = 1.78;

const CLIPS = {
  idle: 'freehand/idle-loop',
  walk: 'freehand/walk-loop',
  run: 'freehand/run-loop',
  jump: 'jump_start',
  fall: 'freehand/fall-loop',
  land: 'landing/soft'
};
// `landing/roll` is in the file and is not used. The ground is flat and a jump
// is 0.8m at its highest, so there is nothing to come down from hard enough to
// earn a roll, and a body tumbling forward out of a hop it made on purpose
// reads as a stumble.

// How fast the two locomotion loops travel when played at their authored rate.
// Playback is scaled by the real ground speed against these, so the feet stay
// with the floor instead of skating over it.
const WALK_CLIP = 1.7, RUN_CLIP = 4.2;

// How quickly a clip's share of the pose changes. Slow enough to blend, fast
// enough that stopping dead does not leave you gliding.
const BLEND = 11;

export function createHero(onLoad) {
  const group = new THREE.Group();
  const materials = [];
  const action = {};       // by clip role: idle, walk, run, …
  const weight = {};       // what is actually being mixed right now
  const want = {};         // what should be
  for (const role in CLIPS) { weight[role] = 0; want[role] = 0; }

  let mixer = null;
  let airborne = false;    // last frame's, to catch the moment of landing
  let landing = 0;         // seconds of landing pose left to play out
  let posed = false;       // whether the body has been put anywhere yet

  const LANDING = 0.5;     // how long the landing pose is held over the top

  new GLTFLoader().load(URL, function (gltf) {
    const model = gltf.scene;

    const box = new THREE.Box3().setFromObject(model);
    model.scale.setScalar(HEIGHT / (box.max.y - box.min.y));

    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      // A skinned mesh's bounds are the ones it was exported in, and an arm
      // thrown out mid-stride can leave them. Three of them are not worth
      // being careful about.
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (let i = 0; i < mats.length; i++) {
        // So the body can be faded out when the camera comes right in on it.
        // Set once here rather than switched on demand: `transparent` is part
        // of the shader's cache key, and toggling it recompiles.
        mats[i].transparent = true;
        materials.push(mats[i]);
      }
    });

    mixer = new THREE.AnimationMixer(model);
    for (const role in CLIPS) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, CLIPS[role]);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (role === 'jump' || role === 'land') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      // Everything is always running; only the weights say who is visible.
      a.play();
      a.setEffectiveWeight(role === 'idle' ? 1 : 0);
      action[role] = a;
    }
    weight.idle = 1;

    group.add(model);
    if (onLoad) onLoad(materials);
  });

  // Radians, shortest way round.
  function turnTo(from, to, k) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return from + d * k;
  }

  return {
    group: group,

    // 0 hides the body entirely — used when the camera has come in so close
    // that you would be looking at the inside of a head.
    setOpacity: function (o) {
      for (let i = 0; i < materials.length; i++) materials[i].opacity = o;
      group.visible = o > 0.02;
    },

    update: function (dt, m) {
      group.position.set(m.x, m.y, m.z);
      // Turned into the direction of travel rather than snapped to it, so a
      // change of mind is a body turning round. The first frame is a snap:
      // there is nothing to turn from yet.
      group.rotation.y = posed ? turnTo(group.rotation.y, m.facing, Math.min(1, dt * 12)) : m.facing;
      posed = true;
      if (!mixer) return;

      for (const role in want) want[role] = 0;

      // Landing runs over the top of whatever else is happening, and gets out
      // of the way again over the tail of its own clip.
      if (!m.airborne && airborne) { landing = LANDING; if (action.land) action.land.reset().play(); }
      if (m.airborne && !airborne && action.jump) action.jump.reset().play();
      airborne = m.airborne;
      landing = Math.max(0, landing - dt);

      if (m.airborne) {
        // The push-off has its own short clip; once you are no longer going up,
        // you are falling, whatever it looked like on the way out.
        want[m.vy > 0.4 ? 'jump' : 'fall'] = 1;
      } else {
        // Idle gives way to the walk over the first slow metre a second, and
        // the walk to the run only once you are going faster than a walk can
        // honestly carry. Anything in between is a real mix of two clips.
        const s = m.speed;
        const TROT = WALK_CLIP * 1.35;
        if (s < TROT) {
          const k = clamp01((s - 0.15) / (WALK_CLIP * 0.8 - 0.15));
          want.idle = 1 - k; want.walk = k;
        } else {
          const k = clamp01((s - TROT) / (RUN_CLIP - TROT));
          want.walk = 1 - k; want.run = k;
        }
        if (landing > 0) want.land = landing / LANDING;
      }

      if (action.walk) action.walk.timeScale = clampScale(m.speed / WALK_CLIP);
      if (action.run) action.run.timeScale = clampScale(m.speed / RUN_CLIP);

      // Weights are normalised rather than crossfaded, so a landing that
      // overlaps a run is a real mix of the two and nothing has to be
      // sequenced. A pose that adds up to more than one goes rubbery.
      let sum = 0;
      const k = Math.min(1, dt * BLEND);
      for (const role in weight) {
        weight[role] += (want[role] - weight[role]) * k;
        sum += weight[role];
      }
      if (sum < 1e-4) sum = 1;
      for (const role in weight) {
        if (action[role]) action[role].setEffectiveWeight(weight[role] / sum);
      }

      mixer.update(dt);
    }
  };
}

function clampScale(s) { return Math.max(0.65, Math.min(1.6, s)); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
