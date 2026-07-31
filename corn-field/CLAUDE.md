# A Field of Corn

A first-person three.js scene: wandering a corn maze on a late summer
afternoon. Browser-based, Vite + vanilla JS (no framework).

## The point of this project

This is an **ambient exploration piece, not a game**. There is no score,
no timer, no fail state, and no enemy. The player is meant to feel
unhurried. Finding the exit is optional and unrewarded beyond a quiet
line of text.

When proposing features, weigh them against that. Reject anything that
introduces pressure, urgency, or optimisation pressure — leaderboards,
countdowns, combo multipliers, enemies, "efficiency" scoring. If a
feature would make a player hurry, it's wrong for this project even if
it's fun in the abstract.

Good directions: ambient life, weather, light over time, sound,
things to notice, places to rest, texture and detail.

## Architecture

- `src/maze.js` — recursive-backtracker generation on a room grid.
  `ROOMS` rooms per side, expanded to a `FINE = ROOMS*2+1` cell grid
  where odd/odd cells are rooms and the cells between them are
  passages. A few extra openings are punched in afterwards to create
  loops, because dead ends feel stressful.
- `src/corn.js` — the corn. One `InstancedMesh`, ~11k instances, single
  draw call.
- `src/audio.js` — all sound is synthesised via Web Audio. No audio files.
- `src/player.js` — movement, collision, camera.
- `src/scene.js` — renderer, lights, sky, fog, ground.

## Technical constraints — please respect these

**Corn is instanced billboards, not geometry.** Each plant is two
crossed alpha-tested quads sharing one canvas-drawn texture. Do not
replace this with per-plant meshes or `CylinderGeometry` stalks; an
earlier version did that and the field was too sparse to read as a maze
at 600 stalks, and too slow at the density actually needed.

**Wind lives in the vertex shader.** It's injected via
`material.onBeforeCompile`, patching `#include <begin_vertex>` and
displacing by `h*h` so plants pivot from the base. Instance matrices are
uploaded once and never touched again. Do NOT move sway back to
per-frame CPU matrix updates — that was the original bottleneck.

**Corn must stay taller than eye height.** Camera eye is at 1.62m;
plants are 2.6–3.5m. If plants get shorter than ~2.2m the maze stops
enclosing the player and the whole feeling collapses.

**The world has no visible edge.** Corn continues past the maze bounds
in every direction. Keep it that way.

## Style

- Vanilla JS, no TypeScript, no framework.
- Prefer procedural/canvas-generated assets over binary files where the
  quality cost is acceptable — it keeps the project a single clone away
  from running.
- Comments explain *why*, not *what*.

## Verifying changes

Run `npm run dev` and look at it. This project's correctness is visual
and felt — a change can be bug-free and still wrong. When you finish a
visual change, say what you expect it to look like so I can check
whether that matches what I see.
