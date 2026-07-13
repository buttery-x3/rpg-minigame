# RPG Minigame

A compact Three.js + TypeScript + Vite framework for an isometric RPG prototype.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL, usually `http://127.0.0.1:5173/`.

## Verify

```bash
npm run verify
```

This runs the production build and a headless browser smoke test for canvas rendering, HUD layout, resize handling, and WASD party movement.

## Deploy

From the repository root on the Linux server:

```bash
./deploy.sh
```

The deployment script pulls the latest fast-forwardable commit, installs dependencies, builds the `/rpg/` deployment, reloads PM2, saves the process list, and reports the `rpg-minigame` status.

## Current Shape

- Full-screen Three.js renderer with an orthographic isometric camera.
- Camera-relative WASD movement and facing for a ten-member party: two tanks, three melee DPS, three ranged DPS, and two healers.
- Triangle, tight circle, loose circle, horizontal line, and vertical line formation controls.
- Party portraits with individual health bars and role-colored in-world units.
- Hold left click and gesture toward a role, then choose a Move, Hold, or Return command for that role group.
- A reusable ability system with prototype Taunt, Whirlwind, Fireball, and Heal abilities, currently kept out of the formation HUD.
- No enemy implementation yet; ability effects are emitted as combat events for the next pass.
- Simple modular game loop, input, party, ability, world, camera, and HUD classes.
- Dev-only `window.__RPG_GAME__` diagnostics hook for render and gameplay checks.
- Production static server, PM2 config, deploy script, and Playwright render verification matching the other minigame projects.
