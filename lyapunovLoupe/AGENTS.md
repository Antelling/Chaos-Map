# Lyapunov Loupe - AGENTS.md

## Deployment Requirements

### Web Server

- **Type**: Any static file server (Nginx, Apache, or simple HTTP server)
- **Protocol**: HTTP or HTTPS
- **No server-side processing required** - fully client-side WebGL2 application

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name localhost;
    
    root /var/www/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Directory Structure for Deployment

```
/var/www/html/
├── index.html               # Landing page (links to all projects)
├── index.css                # Landing page styles
├── chaos-map/               # Chaos map v1 (sibling project)
├── lyapunovLoupe/           # THIS PROJECT
│   ├── index.html           # Main HTML entry point
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── main.js
│   │   ├── webgl-utils.js
│   │   ├── texture-manager.js
│   │   ├── ui.js
│   │   ├── debug-visualizer.js
│   │   ├── animation-storage.js
│   │   ├── animation-assembler.js
│   │   ├── core/
│   │   │   ├── SimulationEngine.js
│   │   │   ├── RenderEngine.js
│   │   │   ├── FrameManager.js
│   │   │   └── StateGenerator.js
│   │   ├── utils/
│   │   │   ├── ColorMaps.js
│   │   │   └── ShaderLoader.js
│   │   └── systems/
│   │       └── SystemRegistry.js
│   └── shaders/
│       ├── common.glsl
│       ├── integrator-rk4.glsl
│       ├── integrator-verlet.glsl
│       ├── accumulate-ftle.glsl
│       ├── accumulate-bob2-distance.glsl
│       ├── render-ftle.glsl
│       ├── render-tile.glsl
│       ├── render-pendulum.glsl
│       ├── render-phase-space.glsl
│       ├── system-double-pendulum.glsl
│       ├── system-elastic-pendulum.glsl
│       ├── system-henon-heiles.glsl
│       └── system-duffing.glsl
└── dot-dodger/              # Game (sibling project)
```

### Browser Requirements

- **WebGL2 support** (required)
- `EXT_color_buffer_float` extension (for RGBA32F textures)
- Multiple render targets (MRT) support
- Tested on: Chrome, Firefox, Safari, Edge

### Local Development

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8000
```

### Production Deployment

```bash
# Copy to nginx serve directory
cp -r lyapunovLoupe/ /var/www/html/
```

No build step required - serve files as-is.

## GitHub Pages

The project is deployed to GitHub Pages:
- **Repo**: `git@github.com:Antelling/Chaos-Map.git`
- **Access**: `https://antelling.github.io/Chaos-Map/lyapunovLoupe/index.html`

---

## Project Overview

Lyapunov Loupe is a **fully client-side WebGL2 visualization platform** for exploring chaotic dynamical systems. It computes FTLE (Finite-Time Lyapunov Exponent)-like fields using random Gaussian perturbations and renders trajectories entirely on the GPU.

### Key Features

- **4 Chaotic Systems**: Double Pendulum, Elastic Pendulum, Hénon-Heiles, Duffing Oscillator
- **2 Integration Methods**: RK4 (Runge-Kutta 4th order) and Verlet (symplectic)
- **Multiple Visualization Modes**: Instant FTLE, Accumulated FTLE, Threshold tracking, Bob2 Distance
- **20 Color Maps**: Viridis, Magma, Plasma, Turbo, Jet, Rainbow, etc.
- **Frame-by-frame Animation**: Generate and playback time evolution
