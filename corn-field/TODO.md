# TODO

1. Please put an interactive zen garden in the middle of the maize maze

2. Add some friendly animals in the maze. They'd occasionally wonder out, look at you and hurry away
   - racoon
   - deer
   - mouse
   - wild turkey
   - crows (fly in, fly out)
   - and others you can think of
   - small animals can go through and between corn stalks, while big animals, like deer, will need to follow the maze path like you. 

3. Add some dangerous animals in the maze
   - snake
   - bee
   - and others you can think of
   - they should look a little bit threatening, the background sound should indicate danger
   - they don't really attack: if you walk past them then they'll run away
   - if you start to run away from them then they might chase you a little bit. 

4. the corn stalk should cast shadows

5. Add weather
   - light rain sometimes
   - cloud move in the sky and cast shadow on the ground and corn stalk



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

# Also changed along the way

- Stars, a milky way, and the occasional shooting star.
- The night has its own sound: birds fade out, crickets come up, an owl
  every so often, and the wind drops.
- You can look further up than before — a full moon at midnight sat
  above the old pitch limit.
- A bench under a tree past the exit. Nothing happens there.

# Ideas, unstarted

- The kernels are unexplained. Perhaps they should stay that way.
- Somewhere to sit *inside* the maze, not only outside it.
