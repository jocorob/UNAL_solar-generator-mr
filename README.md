# Solar Field — WebXR mixed-reality simulator

An interactive, Spanish-language solar-generator experience built with Three.js and Vite. The portable station is assembled from procedural meshes—metal enclosure, reinforced corners, handle, live LCD, sockets, LEDs, adjustable photovoltaic frame and individual blue cells—with simulated device connections and a battery-survival challenge. The supplied photograph is retained as a design reference only; it is not loaded or used as a scene texture.

## Play locally

Requires Node.js 22 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. To verify the production bundle locally, use `npm run build` and `npm run preview`.

## Controls and simulation

- Drag to orbit around the actual 3D meshes through 360°; use the wheel or a two-finger pinch to zoom. Click the sun to advance the simulated time or click a 3D appliance to connect/disconnect it.
- Adjust the time and latitude sliders to change the simulated sun position and solar generation; the hinged 3D panel smoothly tilts and yaws to follow it.
- Toggle the LED lamp, phone and laptop to change the load. Battery percentage, generated power and consumption update in real time.
- The 60-minute challenge runs accelerated (one real second represents one simulated minute). Keep the battery above 70% to complete it.
- Use **Enter VR** in a compatible WebXR browser/headset, or **Explore in augmented reality** on a compatible AR device. Controller rays select the virtual sun and appliances in VR. AR asks the browser for camera/environment access.

The simulator is educational: the 120 W peak, battery capacity, appliance loads, sunlight and charge behavior are illustrative scenario values, not measured or verified product specifications. The equinox model is deliberately simplified and is not a local weather/solar forecast.

## Deploy on GitHub Pages

The workflow `.github/workflows/pages.yml` builds the Vite app and deploys `dist/` whenever a commit reaches `main`, or when manually run from **Actions**.

1. In **Settings → Pages**, set **Build and deployment → Source** to **GitHub Actions**.
2. Merge/push changes to `main` or manually run **Deploy solar mixed-reality experience to GitHub Pages**.
3. Open the deployment URL shown in the workflow or **Settings → Pages**.

Vite uses relative asset paths, which work at a repository subpath as well as at a custom domain. GitHub Pages is served over HTTPS, as required for WebXR. Actual VR/AR session support depends on the user's browser, operating system, hardware and permissions; the non-immersive 3D simulator remains available without a headset.
