# Thinking loaders: designs to keep

Shown under "Assistant" while the model thinks (see the thinking indicators). Nothing here is built
into the app yet. Each design is a self-contained page in `docs/plans/loaders/`, open it in a browser;
colours come from the page's palette buttons. All are plain canvas or CSS, no libraries.

## Liked, for later

| Design | File | Notes |
| --- | --- | --- |
| Wave field (colour rings travelling out) | round-2 | Liked; the square grid is less elegant than the round pond in round 3 |
| Trefoil knot (colour flowing along it) | round-2 | Liked |
| Ghost, drifting (redesign) | round-3, round-4 | Liked the idea, not the cartoon eyes. Round 4's wisp, hollow-eyes and veil are the next step |
| Never-repeating chaos | round-4 | Drifting attractor, harmonograph, flow field, Aizawa, Thomas, De Jong. The "always changing" idea the user wants |
| Clifford torus | round-4 | The 4D doughnut that turns inside out; the source of the shape net idea |
| Lissajous curve | round-5 | Liked, as a comet tracing a 3D Lissajous knot |
| Shape net and shape cloud | round-5 | Liked. A 3D mesh folding between heart, star, moon, bolt, flower, butterfly and infinity |
| Pendulum wave | round-5 | Liked. Pendulums falling in and out of step |
| Fun objects | round-5 | Liked: jellyfish (best), butterfly, hourglass (fits "waiting"), koi |

## Ideas for next time

- Start each reply's loader from a different point in its chaotic path, so every reply looks different.
- The ghost, redesigned without eyes, as a wisp with a fading trail.
- Some loaders are heavy for a small indicator (about 300 points per frame for the net, thousands for the
  attractors). Check frame rate on a phone before using one; pick the lighter ones first.

## Rules to keep

- Each design is a single file with no external libraries, so it can be copied straight into the app.
- Colour comes from the theme's tokens when built, not the palettes in these pages.
- Reduced motion: every page slows right down under `prefers-reduced-motion`; keep that when built.
