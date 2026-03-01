# Lyapunov Loupe

GPU-accelerated chaos visualization platform for exploring nonlinear dynamical systems.

## Features

- Fully client-side WebGL rendering
- Multiple chaotic systems: Double Pendulum, Elastic Pendulum, Hénon–Heiles, Duffing Oscillator
- FTLE-like visualization using random Gaussian perturbations
- RK4 and Störmer–Verlet integration
- Interactive exploration: hover probes, zoom, pan, parameter adjustments
- Dynamic color mapping for FTLE fields

## Architecture

```
lyapunovLoupe/
├── index.html              # Main entry point
├── css/
│   └── styles.css          # UI styling
├── js/
│   ├── webgl-utils.js      # WebGL context and shader utilities
│   ├── texture-manager.js  # Texture and framebuffer management
│   ├── ui.js               # User interface controls
│   └── main.js             # Main orchestrator
└── shaders/
    ├── common.glsl         # Common GLSL utilities
    ├── integrator-rk4.glsl # RK4 integration shader
    ├── integrator-verlet.glsl  # Verlet integration shader
    ├── system-double-pendulum.glsl
    ├── system-elastic-pendulum.glsl
    ├── system-henon-heiles.glsl
    ├── system-duffing.glsl
    ├── render-ftle.glsl    # FTLE color mapping
    ├── render-pendulum.glsl
    └── render-phase-space.glsl
```

## Usage

1. Open `index.html` in a WebGL2-compatible browser
2. Select a system from the dropdown
3. Choose an integrator (RK4 or Verlet)
4. Adjust parameters: dt, iterations, perturbation scale
5. Click "Run Simulation" to compute FTLE field
6. Use hover to explore individual initial conditions
7. Adjust zoom and color map as needed

## Supported Systems

### Double Pendulum
Classic chaotic system with two rigidly coupled pendulums.

### Elastic Pendulum
Second pendulum connected by a spring instead of rigid rod.

### Hénon–Heiles
2D Hamiltonian system exhibiting chaotic behavior.

### Duffing Oscillator
Forced nonlinear oscillator with periodic driving.

## Integration Methods

### RK4
Fourth-order Runge-Kutta integration for generic ODE systems.

### Störmer–Verlet
Symplectic integrator for Hamiltonian systems, preserves energy.

## Browser Requirements

- WebGL2 support
- `RGBA32F` floating-point textures
- Transform feedback support

## Performance

- Supports 1024×1024 resolution in real-time
- GPU-accelerated simulation and rendering
- Multiple perturbations per pixel for smoother FTLE maps
