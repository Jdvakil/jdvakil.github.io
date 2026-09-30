# jdvakil.github.io

Personal site of Jay Vakil. Plain static HTML/CSS/JS served by GitHub Pages; there is no build step.

## Layout

```
index.html              home page (bio, publications, experience, press, teaching)
bouldering.html         bouldering reels
assets/css/site.css     design tokens, light/dark themes, all page styles
assets/js/site.js       theme toggle, nav, lazy video, portrait swap, robot boot
assets/js/fr3-sim.js    MuJoCo simulation + IK controller + pick-and-place autopilot
assets/js/fr3-viewer.js three.js renderer, pointer interaction, HUD
assets/fr3/             robot model: scene.xml (MJCF), collision meshes, fr3.glb (visuals)
media/web/              web-optimised images, videos, portraits and colour logos
tools/                  scripts that regenerate assets/fr3/fr3.glb, media/web/ and the logos
```

## The robot in the hero

A Franka Research 3 with a Franka Hand, simulated live in the browser by the official
MuJoCo WebAssembly build (`@mujoco/mujoco`, loaded from jsDelivr) and rendered with three.js.

- Physics runs at 500 Hz. A damped-least-squares IK controller drives the arm's position
  actuators; the gripper uses the Menagerie Franka Hand tendon actuator.
- Visitors can hover to steer the gripper, click a block to pick it up, click the table (or
  another block) to place it, drag blocks to throw them, drag the arm to move it, and drag
  empty space to orbit. This only works on large screens with a mouse or trackpad; phones and
  tablets get a hands-off demo. After a few idle seconds the autopilot takes over again and cycles through arrangements on its own: a tower, a row sorted by
  colour, twin towers, and a 2x2 grid, clearing blockers and recovering thrown blocks.
- `window.fr3` exposes the running stage in the browser console (`fr3.sim` is the simulation).

The arm model comes from `mujoco_menagerie/franka_fr3` and the hand from
`mujoco_menagerie/franka_emika_panda`, both Apache-2.0 (licenses in `assets/fr3/`).

To test the simulation headless, load `assets/js/fr3-sim.js` in Node 18+ with
`@mujoco/mujoco` installed and feed it `assets/fr3/scene.xml` plus the files in
`assets/fr3/meshes/`.

## Local preview

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Logo masks use root-relative URLs (`/media/web/logos/...`), so preview from the repo root.
