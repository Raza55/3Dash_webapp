# 3Dash

A 3D floorplan dashboard for Home Assistant. Load your own 3D model, map it to your smart home entities, and control everything from an interactive view in your browser.

## How to access

Once the add-on is running, open 3Dash in your browser at:

```
http://<your-ha-ip>:8099
```

Replace `<your-ha-ip>` with the IP address of your Home Assistant machine (e.g. `http://192.168.1.100:8099`).

Your browser may show a certificate warning on first visit -- this is normal (self-signed SSL). Accept it to proceed.

## Features

- 3D floorplan with custom `.glb` models, runtime scale controls, and imported 3D objects
- Light control (on/off, dimmable, RGB, RGBW, IR remote) with editable shape, rotation, and scale
- Blinds/covers linked to Home Assistant cover entities
- Wall displays with live sensor data and TV-style media-player mode
- Animated network throughput tubes
- Real-time sun positioning and weather effects
- Configurable side panel with scripts, indicators, and graphs
- Built-in config editor, model-object editor, and onboarding wizard
- Backup and restore
- Dark and light themes
