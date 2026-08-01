# A Field of Corn

A first-person three.js scene: wandering a corn maze on a working farm.
It opens on a late summer afternoon and turns through dusk, night, dawn
and day on a twenty-minute loop (`CYCLE_LENGTH` in `scene.js`).
Browser-based, Vite + vanilla JS (no framework).

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
  draw call. Stops at the field boundary; outside is `farm.js`.
- `src/audio.js` — all sound is synthesised via Web Audio. No audio files.
  Birds, crickets and an owl are cross-faded by `setNight()`.
- `src/player.js` — movement, collision, camera. Collision is the maze
  grid plus a list of `obstacles` (circles, or oriented boxes) supplied
  by `farm.js` and `lanterns.js`.
- `src/scene.js` — renderer, lights, fog, ground, and the day/night
  cycle. Palettes are sampled by the sun's **elevation**, not by the
  clock, so dusk and dawn come out of the same table and colour can
  never drift out of step with where the sun is.
- `src/sky.js` — dome, stars, sun glow, and the moon (phase drawn in the
  fragment shader). All of it rides in one group parked on the camera.
- `src/farm.js` — the world outside the maze: stubble, dirt track, barn,
  tractor, bales, fence, scarecrow, treeline, and a bench to sit on.
- `src/lanterns.js` — lanterns on stakes along the corridors, so the
  night is walkable. Takes an `extra` list of flames that belong to
  other modules, so they compete for the same three lights.
- `src/zen.js` — the raked garden in the clearing at the centre of the
  maze. The gravel is a canvas the player scuffs and that heals itself.
- `src/critters.js` — every animal. All billboards; the friendly ones
  emerge, watch and leave, the dangerous ones bluff. Big animals walk
  the maze grid, small ones go through the corn.
- `src/weather.js` — cloud and rain. Owns one tiling noise texture that
  is both the cloud you see overhead and the shadow it casts, patched
  into every lit material in the scene from `main.js`.
- `src/portals.js` — eight lit doorways set into the corn walls, each
  one a link out to somebody else's web thing. Owns the destination
  list, the sheet shader, and the painted signs beside most of them.

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

**The world has no visible edge.** It used to have none because the corn
ran on forever; now the corn stops at the field boundary and the land
outside carries the job instead — stubble, then a treeline at ~96m that
the haze has mostly eaten. Keep the *property*: the world must always
dissolve into distance, never end at a line. If you move the treeline
in, or thin the fog, you get a visible rim and the field stops feeling
like it is somewhere.

**Night must stay walkable.** The cycle now runs all the way round to
dark. There is no fail state here, so the player must never be unable
to see the corridor they are standing in. Three things guarantee that
together — the `NIGHT` palette's `hemiI`/`ambI` floor, moonlight, and
the lanterns. Do not lower any of them for realism without checking the
other two still carry it.

**The corn casts shadows but does not receive them.** A billboard's
normal is flipped to face the camera, which is the only reason a wall of
flat quads reads as a lit plant. Shadow receiving samples by world
position instead, so switching it on mottles the wall with the shadows
of the leaves in front of it and turns the field a dark blotchy olive.
The shadows worth having are the ones thrown across the corridor floor.
Whatever else changes, the corn's `customDepthMaterial` must keep the
same wind displacement as its surface material, or the plants sway while
their shadows stand still.

**A portal is the only thing that leaves.** Walking into one navigates
away from the page, which is the single most destructive act available
in a piece with no fail state — so it is deliberately not instant. The
threshold in `portals.js` charges over about six tenths of a second of
standing in the sheet and falls back faster than it fills, so brushing
past a door does nothing and stepping back out of one cancels it. Do
not make this a plain distance test. The door also has to stay set
*into* a wall rather than across a corridor: the corn behind it is what
makes overshooting impossible.

**Only three point lights ever burn at once.** The corn is one
instanced mesh of ~11k quads, so every light in the scene is paid for by
all of them. `lanterns.js` gives every lantern a free glow sprite and
hands real `PointLight`s to the nearest three only. Adding a light per
lantern will look identical and cost a great deal.

**The colour and light setup deliberately opts out of modern three.**
The scene was authored against r128. `scene.js` sets
`ColorManagement.enabled = false` and a linear output colour space, and
every light intensity carries `LEGACY_LIGHT_SCALE` (`Math.PI`) because
r155 deleted the non-physical lighting path that used to apply it.
These are not leftovers — removing any of them shifts the whole
afternoon paler and flatter. If you ever do want modern colour, it is a
deliberate re-grade of every hue in the file, not a one-line switch.

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


## Git and Workflow Constraints
- Never create a git commit, push to remote, create branches, or open pull requests.
- Do not auto-commit or auto-push after implementing changes or fixing bugs.
- Always apply edits directly to the local files and leave the working directory unstaged for user review.


