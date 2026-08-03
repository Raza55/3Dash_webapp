# 3Dash

A 3D floorplan dashboard for [Home Assistant](https://www.home-assistant.io/). Load your own 3D model, map it to your smart home entities, and control everything from an interactive view in your browser.

## Features

- **3D floorplan** -- load a custom `.glb` model, adjust model scale, import extra 3D objects, and navigate freely
- **Light control** -- toggle, dim, color-pick, rotate, and scale lights directly from the 3D scene, with optional 3D fixtures and translucent icon touch zones (supports on/off, dimmable, RGB, RGBW, and IR remote types)
- **Blinds / covers** -- place slatted blinds in the model and link them to Home Assistant cover entities
- **Wall displays and TV mode** -- render sensor data or connect media players with on/off screen states
- **Energy & flows** -- animated paths for network traffic, electricity, water, gas, smart plugs, and meters
- **Sun and weather** -- sun position tracks your real location; optional rain/snow particle effects
- **Side panel** -- configurable cards for scripts, indicators, and graphs
- **Config editor** -- define lights, blinds, displays, light blockers, smart-home devices, energy flows, imported objects, and model-object overrides from a built-in UI
- **Room mapping** -- import Home Assistant areas, draw rectangular or polygonal room zones directly in 3D, and curate automatically prioritised room entities
- **Onboarding wizard** -- guided setup for first-time users
- **Backup / restore** -- export and import your full configuration as a ZIP
- **Demo mode** -- explore the dashboard without a Home Assistant instance
- **PWA** -- installable as a progressive web app with offline support
- **Dark and light themes**

## Recent fork additions

A complete, categorized overview is available in
[`FORK_CHANGES.en.md`](./FORK_CHANGES.en.md) ([Deutsch](./FORK_CHANGES.md)).

- Runtime 3D model tools: replace the main GLB without reloading the page, automatically restore the previous model after a failed import, adjust shared scene scale, toggle textures, and keep placed objects aligned.
- Smart-home device markers: place coffee makers, fans, robot vacuums, air-quality devices, speakers, cameras, and generic appliances in functional subgroups and connect them to Home Assistant entities.
- Invisible light blockers can be placed where imported models are missing shadow-casting walls, ceilings, or roofs.
- Model-object editor: select imported subobjects or uploaded objects and fine-tune position, rotation, and scale with shared gizmo modes.
- Smart-home object expansion: blinds/covers, TV-style media-player displays, ellipsoid lights, and rotation/scale editing for placed items.
- Editor polish: lower camera sensitivity, smoother zoom, German/English UI text, and more complete backup/restore coverage.
- Home Assistant room mapping: synchronise areas and assigned entities, edit room centres and polygon corners directly in 3D, and prioritise safety and primary controls automatically.

## Tech stack

React, TypeScript, Babylon.js, Vite, Home Assistant WebSocket API.

## Getting started

### Option 1 -- GitHub hosted version

Use the hosted version directly at **https://kdcius.github.io/3Dash_webapp/**.

No installation required. Your Home Assistant instance must be accessible over HTTPS for the WebSocket connection to work from the hosted page.

### Option 2 -- Home Assistant add-on

The easiest way to self-host. Runs on the same machine as your Home Assistant instance.

[![Add repository to Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkdcius%2F3Dash_webapp)

Or manually:

1. In Home Assistant, go to **Settings > Add-ons > Add-on Store**.
2. Open the overflow menu and select **Repositories**.
3. Add `https://github.com/kdcius/3Dash_webapp`.
4. Install **3Dash** from the store and start it.
5. Open `http://<your-ha-ip>:8099` in your browser.

> When running behind HTTPS, the add-on automatically uses `wss://` for the WebSocket connection. If you use a self-signed certificate, your browser must trust it for the connection to work.

### Option 3 -- Self-host on any machine

For advanced users who want to build and serve 3Dash themselves.

```bash
git clone https://github.com/kdcius/3Dash_webapp.git
cd 3Dash_webapp
npm ci
npm run build
```

Serve the `dist/` directory with any static file server (Nginx, Caddy, etc.). For development with hot reload, use `npm run dev` instead.

## Configuration

All configuration happens in the browser -- no config files to edit manually.

| What | Where |
|---|---|
| Home Assistant URL, port, and token | Onboarding wizard or Settings |
| Location (for sun tracking) | Onboarding wizard or Settings |
| Theme, rendering, camera | Settings modal |
| 3D model, scale, textures, and object overrides | Settings and Config editor |
| Lights, blinds, displays, rooms, light blockers, smart-home devices, energy flows, imported objects | Config editor |

Configuration is persisted in `localStorage`. The 3D model is stored in `IndexedDB`.

## Project structure

```
src/
  babylon/       3D scene, model loading, lights, blinds, displays, energy flows, sun, weather
  components/    React UI (HUD, modals, side panel, cards, forms, guided tour)
  pages/         Dashboard, config editor, onboarding
  services/      HA WebSocket client, config/settings persistence, storage
  contexts/      React contexts (demo mode, camera, language, theme)
  types/         TypeScript type definitions
  utils/         Color conversion helpers
public/          Static assets (default 3D model, fonts, icons, PWA manifests)
3dash-addon/     Home Assistant add-on (Dockerfile, nginx config, run script)
```

## License

This project is provided as-is. See the repository for license details.
