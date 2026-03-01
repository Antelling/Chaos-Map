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
    
    root /var/www/lyapunov-loupe;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
}
```

### Directory Structure for Deployment

```
/var/www/lyapunov-loupe/
├── index.html                    # Main HTML entry point
├── css/
│   └── styles.css               # UI styling
├── js/
│   ├── main.js                  # Main orchestrator
│   ├── webgl-utils.js           # WebGL context & shader compilation
│   ├── texture-manager.js       # Texture & framebuffer management
│   ├── ui.js                    # User interface controls
│   ├── debug-visualizer.js      # Debug panel
│   ├── animation-storage.js     # Frame storage
│   ├── animation-assembler.js   # Video generation
│   ├── core/                    # Core rendering modules
│   │   ├── SimulationEngine.js
│   │   ├── RenderEngine.js
│   │   ├── FrameManager.js
│   │   └── StateGenerator.js
│   ├── utils/
│   │   ├── ColorMaps.js
│   │   └── ShaderLoader.js
│   └── systems/
│       └── SystemRegistry.js
├── shaders/                     # GLSL shaders (GPU code)
│   ├── common.glsl
│   ├── integrator-rk4.glsl
│   ├── integrator-verlet.glsl
│   ├── accumulate-ftle.glsl
│   ├── accumulate-bob2-distance.glsl
│   ├── render-ftle.glsl
│   ├── render-tile.glsl
│   ├── render-pendulum.glsl
│   ├── render-phase-space.glsl
│   ├── system-double-pendulum.glsl
│   ├── system-elastic-pendulum.glsl
│   ├── system-henon-heiles.glsl
│   └── system-duffing.glsl
└── docs/
    └── elastic-double-pendulum-odes.md
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

1. Copy all files to web server root
2. Ensure proper MIME types for `.js`, `.css`, and `.glsl` files
3. No build step required - serve files as-is
4. Optional: Enable gzip compression for faster loading

---

## Project Overview

Lyapunov Loupe is a **fully client-side WebGL2 visualization platform** for exploring chaotic dynamical systems. It computes FTLE (Finite-Time Lyapunov Exponent)-like fields using random Gaussian perturbations and renders trajectories entirely on the GPU.

### What This Page Does

The page visualizes chaos in dynamical systems by:
1. Taking a 2D grid of initial conditions (each pixel represents a different starting state)
2. Evolving each initial condition through time using GPU-accelerated integration
3. Tracking how nearby trajectories diverge (measuring sensitivity to initial conditions)
4. Rendering the results as a heatmap where color represents the degree of chaos

### Key Features

- **4 Chaotic Systems**: Double Pendulum, Elastic Pendulum, Hénon-Heiles, Duffing Oscillator
- **2 Integration Methods**: RK4 (Runge-Kutta 4th order) and Verlet (symplectic)
- **Multiple Visualization Modes**: Instant FTLE, Accumulated FTLE, Threshold tracking, Bob2 Distance
- **20 Color Maps**: Viridis, Magma, Plasma, Turbo, Jet, Rainbow, etc.
- **Frame-by-frame Animation**: Generate and playback time evolution

---

## Core Module Documentation

### 1. SimulationEngine (js/core/SimulationEngine.js)

**Purpose**: Manages all GPU-based simulation and integration.

**Key Responsibilities**:
- Compiles simulation shaders (combines system + integrator)
- Manages ping-pong buffers for iterative integration
- Runs integration steps on the GPU
- Tracks simulation state (position, velocity, FTLE values)

**Texture Data Format** (Ping-Pong Buffer Output):
- `color0` (RGBA32F): Current state `[s1, s2, s3, s4]`
  - Double Pendulum: `[theta1, omega1, theta2, omega2]`
  - Hénon-Heiles: `[x, px, y, py]`
  - Duffing: `[x, v, t, unused]`
- `color1` (RGBA32F): Previous state (for Verlet integrator)
- `color2` (RGBA32F): FTLE accumulator `[maxLogGrowth, hasValidData, 0, 0]`

---

### 2. RenderEngine (js/core/RenderEngine.js)

**Purpose**: Handles all rendering passes including FTLE accumulation and display.

**Key Responsibilities**:
- Compiles render shaders (FTLE color mapping)
- Manages accumulation textures for temporal averaging
- Computes automatic value ranges for color mapping
- Renders final visualization to canvas

---

### 3. FrameManager (js/core/FrameManager.js)

**Purpose**: Manages saved animation frames and threshold tracking.

**Key Responsibilities**:
- Stores per-frame texture data for animation playback
- Tracks threshold crossing (when FTLE exceeds threshold)
- Manages animation state (play/pause/frame navigation)

---

### 4. StateGenerator (js/core/StateGenerator.js)

**Purpose**: Generates initial condition data for the simulation grid.

**Key Responsibilities**:
- Maps 2D grid coordinates to system state variables
- Supports "delta mode" (perturbations around basis point)
- Generates random perturbation textures
- Generates noise textures for GPU-based random numbers

---

## Shader Documentation

### Data Formats in Textures

All GPU textures use **RGBA32F** format (4-channel 32-bit float).

### System Shader Interface

Each system shader implements:
```glsl
vec4 systemDeriv(vec4 state, vec4 params) {
  // Return time derivative of state
  // state = [s1, s2, s3, s4]
  // return [ds1/dt, ds2/dt, ds3/dt, ds4/dt]
}
```

---

## Extension Points

### Adding a New System

1. Create `shaders/system-<name>.glsl`:
```glsl
#version 300 es
precision highp float;

vec4 systemDeriv(vec4 state, vec4 params) {
  // Your equations here
  return vec4(ds1, ds2, ds3, ds4);
}
```

2. Add to `SystemRegistry.js`:
```javascript
'my-system': {
  state: [...],
  params: [...],
  dimensions: [...],
  defaultMapping: { x: '...', y: '...' },
  defaultRange: { x: [min, max], y: [min, max] }
}
```

3. Add UI option in `index.html`

### Adding a New Colormap

1. Add to `js/utils/ColorMaps.js`:
```javascript
static myColormap(t) {
  return [r, g, b];  // 0-255
}
```

2. Add to `colormap()` switch statement

3. Add to `render-ftle.glsl`:
```glsl
vec3 colormapMyMap(float t) {
  return vec3(r, g, b);  // 0.0-1.0
}
```
