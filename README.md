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

This runs the production build and a headless browser smoke test for canvas rendering, HUD layout, resize handling, and click-to-move input.

## Current Shape

- Full-screen Three.js renderer with an orthographic isometric camera.
- Click or hold movement on a bounded ground plane.
- Simple modular game loop, input, player, world, camera, and HUD classes.
- Dev-only `window.__RPG_GAME__` diagnostics hook for render and gameplay checks.
- Production static server, PM2 config, deploy script, and Playwright render verification matching the other minigame projects.

