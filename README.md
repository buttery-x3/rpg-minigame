# RPG Minigame

A compact Three.js + TypeScript + Vite framework for an autonomous party-combat prototype.

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

This runs the deterministic combat tests, production build, and a headless browser smoke test for models, effects, HUD controls, formations, and party movement.

## Deploy

From the repository root on the Linux server:

```bash
./deploy.sh
```

The deployment script pulls the latest fast-forwardable commit, installs dependencies, builds the `/rpg/` deployment, reloads PM2, saves the process list, and reports the `rpg-minigame` status.

## Current Shape

- Full-screen Three.js renderer with an isometric combat camera and a neutral checker-grid arena laid out as a northbound combat lane.
- Four increasingly large enemy groups (4, 6, 8, and 10 units) staged along the lane for progression testing.
- Model-rendered party portraits and a right-side party-management drawer expose health, energy, threat, attributes, and equipped abilities.
- Ten-member player party and four-member computer party running through the same combat simulation.
- Global per-unit threat within awareness, continuous decay, encounter-bounded engagement, energy, cooldowns, and automated stance policies.
- Low- and high-energy abilities for tanks, melee, ranged, and healers, with arbitrary loadouts supported by `configureMember`.
- Single-target Taunt, Threat Shout, Fan of Knives, Backstab, Fireball, Meteor, Heal, and channeled Healing Circle.
- Sword auto-attacks for tanks/melee and wand projectiles for ranged/healers.
- Event-synchronized transparent projectiles, slashes, channels, teleports, area impacts, healing, and death feedback.
- Optimized 512px diffuse-only models, opaque friendly presentation, red hostile overlays, faction rings, and owned-unit status bars.
- Triangle, tight circle, loose circle, horizontal line, and vertical line formation controls.
- Aggressive, balanced, and defensive resource policies plus unilateral Return to Formation controls.
- Owner-validated group commands and filtered player views as the multiplayer boundary.
- Dev-only `window.__RPG_GAME__` diagnostics used by render and gameplay verification.
