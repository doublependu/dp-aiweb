# TODO

1. Add some glowing animated portals that takes you to other web experiences when going through it 
   - the portals should be parallel to the walls of maize maze, and distributed randomly in the maze
   - create portals that lead to the following web apps / urls
      - https://wave-racer.vercel.app/
      - https://apex-formula-2026.vercel.app/
      - https://genex.games/world/skate
      - https://play.mint.gg/complete-shelf
      - https://starknightt.github.io/operation-ironhold/
      - https://mrdoob.github.io/toys/
      - https://nuketown.luckeysystems.com/
      - https://maize.live
   - most portals should have a sign next to it, that has the name of the game / experience and maybe screenshot or game play video. 
      - some portals can be mysterious and without such label
   - for the visual of the portal: consider the minecraft purple portal as a reference. I want better graphics. 


# Done

1. **Full day cycle.** `scene.js` runs afternoon → dusk → night → dawn →
   day → round again on a loop. `CYCLE_LENGTH` (1200s) is the only dial.
   Palettes are sampled by the sun's *elevation* rather than by a clock,
   with separate tables for the sun going down and coming up, so dusk
   and dawn read differently without any duplicated machinery. The cycle
   starts at the exact elevation the original afternoon was authored at,
   so the opening frame is unchanged.

2. **Moon.** `sky.js`. Rides the same arc as the sun, with its own cold
   directional light.

3. **Moon phase.** Drawn in the fragment shader from the moon's
   elongation from the sun, so shape and position can never disagree —
   full means opposite the sun, so it rises at sunset and stands overhead
   at midnight, and a crescent follows the sun down shortly after it
   sets. Seven in-world days to a lunar month, so it is a visibly
   different shape by the second night. Earthshine on the dark limb.

4. **Light in the maze at night.** `lanterns.js` — eleven lanterns on
   stakes, spread through the corridors with one at each end. Every one
   has a glow sprite; the nearest three get real point lights.

5. **Thicker corn walls.** Twice the plants per cell, wider, a lower
   alpha cutoff so leaf edges survive, and a slight random lean so the
   gaps stop lining up with each other.

6. **A farm outside the field.** `farm.js` — no corn beyond the
   boundary. Cut stubble, a dirt track with a spur up to the entrance,
   fence and wire, a barn whose windows light up after dark, a tractor,
   round bales, a scarecrow, and a hazy treeline. The maze now reads as a
   block of corn in a worked field, so you can see where it starts and
   ends from outside it.

7. **A zen garden in the middle of the maze.** `zen.js`, in a clearing
   `maze.js` opens at the centre — the middle three-by-three block of
   cells, so four corridors run into it and it is a place rather than a
   junction. Raked gravel, three stones, a water basin with a bamboo
   spout, and a stone lantern that takes its turn in the lantern pool
   instead of adding a fourth light. Two things answer back: the gravel
   keeps your footprints and loses them again over about half a minute,
   and the basin drips more often while you are standing at it — a note
   and a ring on the water each time. Neither is counted.

8. **Animals.** `critters.js`. Deer, wild turkey, raccoon, rabbit and
   mouse come to the edge of the path, look at you, and go. Deer and
   turkeys are too big for the corn and walk the corridors like you do
   (breadth-first over the same grid); the small ones push straight
   through the stalks and are hidden by them rather than by a fade.
   Crows fly over, and about half the time one drops onto a corn wall,
   says what it thinks of you, and carries on.

9. **Animals that mean it.** A snake across the path, bees over a patch
   of ground, and one spider in a web at head height. They look worse
   than they are: walk past and they leave, back away and the snake or
   the bees may follow a couple of metres before thinking better of it,
   and nothing can reach you or ever will. A low note in `audio.js`
   comes up with how close and how bothered the nearest one is; the
   snake rattles, the bees are a level rather than an event, and the
   spider just climbs its thread and waits.

10. **Corn casts shadows.** One shadow-casting light in the scene, the
    sun, with the shadow camera carried along with the player so the map
    is spent where somebody is standing. The corn's depth material gets
    the same wind displacement as its surface material, or eleven
    thousand plants would sway while their shadows stood still. The corn
    casts but does not receive — see the note in `corn.js` for why.

11. **Weather.** `weather.js`. Cloud drifts overhead all the time and
    the same map is read again by everything the sun lights, so the
    shadow crossing the field is the shadow of the cloud you can see.
    Showers come every four to nine minutes and last one to three; the
    light goes flat a minute before the first drop. Rain is short line
    segments in a column that follows the camera, and its own band of
    hiss in the sound.

12. **Mouse look.** `PointerLockControls`, entered by clicking, escaped
    with escape. Drag-to-look is still there for anything without a
    pointer to lock. The arrow keys now walk the way the arrow points.

# Also changed along the way

- Stars, a milky way, and the occasional shooting star.
- The night has its own sound: birds fade out, crickets come up, an owl
  every so often, and the wind drops.
- You can look further up than before — a full moon at midnight sat
  above the old pitch limit.
- A bench under a tree past the exit. Nothing happens there.
- `r` starts a shower, for looking at the rain without waiting for it.

# Ideas, unstarted

- The kernels are unexplained. Perhaps they should stay that way.
- The garden is the only place inside the maze worth stopping at, and
  there is still nowhere to sit in it.
- The deer never come out into the farm, only the corridors.
