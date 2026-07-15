# 3Dash -- Documentation

## Getting started

Once the add-on is installed and running, open 3Dash in your browser at:

```
http://<your-ha-ip>:8099
```

Replace `<your-ha-ip>` with the IP address of your Home Assistant machine (e.g. `http://192.168.1.100:8099`).

The onboarding wizard will guide you through the initial setup:

1. Enter your Home Assistant URL and port (default: `8123`).
2. Provide a **long-lived access token** (create one in your HA profile under **Security > Long-lived access tokens**).
3. Set your location (latitude/longitude) for accurate sun positioning.
4. Upload a `.glb` 3D model of your home.

The default port is `8099`. You can change it in **Settings > Add-ons > 3Dash > Configuration**.

## Configuration

All configuration happens in the browser -- no files to edit manually.

| What | Where |
|---|---|
| Home Assistant connection | Onboarding wizard or Settings |
| Location (for sun tracking) | Onboarding wizard or Settings |
| Theme, rendering, camera | Settings modal |
| 3D model replacement, model scale, and texture toggle | Settings and Config editor |
| Lights, blinds/covers, screens/computers, light blockers, smart-home devices, energy flows, imported objects | Config editor |

## Added editor features

- Use the editor transform mode to switch between moving, rotating, and scaling selected objects.
- Add blinds/covers as slatted rectangular surfaces and connect them to Home Assistant cover entities.
- Use TV mode on displays to connect a `media_player` entity and show on/off screen states.
- Import additional 3D objects and fine-tune model subobjects without rewriting the original model file.
- Add built-in 3D light fixtures and optional translucent icon touch zones.
- Visualise network, electricity, water, gas, smart plugs, and meters under Energy & Flows.

For a complete overview of additions in the `featureaddon` fork, see
[`FORK_CHANGES.md`](../FORK_CHANGES.md).

## SSL / HTTPS

When running behind HTTPS, the add-on automatically uses `wss://` for the WebSocket connection. If you use a self-signed certificate, your browser must trust it for the connection to work.

## Backup and restore

You can export your full configuration (settings, 3D model, lights, blinds, displays, tubes, and model-object overrides) as a ZIP file from the settings panel. Use this to back up your setup or transfer it to another instance.

## Support

For issues and feature requests, visit the [GitHub repository](https://github.com/kdcius/3Dash_webapp).
