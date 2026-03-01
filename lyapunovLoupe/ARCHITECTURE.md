# Lyapunov Loupe - Architecture Summary

## Overview

Lyapunov Loupe is a fully client-side WebGL2 visualization platform for exploring chaotic dynamical systems. It computes FTLE-like fields using random Gaussian perturbations and renders trajectories and pendulums entirely on the GPU.

## Project Structure

```
lyapunovLoupe/
├── index.html                 # Main entry point (HTML)
├── css/
│   └── styles.css            # UI styling
├── js/
│   ├── webgl-utils.js        # WebGL context & shader compilation (82 lines)
│   ├── texture-manager.js    # Texture & framebuffer management (186 lines)
│   ├── ui.js                 # User interface controls (211 lines)
│   └── main.js               # Main orchestrator (343 lines)
├── shaders/
│   ├── common.glsl           # GLSL utilities & PRNG (30 lines)
│   ├── integrator-rk4.glsl   # RK4 integration (62 lines)
│   ├── integrator-verlet.glsl # Verlet integration (71 lines)
│   ├── system-double-pendulum.glsl    # Double pendulum (32 lines)
│   ├── system-elastic-pendulum.glsl  # Elastic pendulum (41 lines)
│   ├── system-henon-heiles.glsl      # Hénon–Heiles (16 lines)
│   ├── system-duffing.glsl           # Duffing oscillator (18 lines)
│   ├── render-ftle.glsl      # FTLE color mapping (56 lines)
│   ├── render-pendulum.glsl  # Pendulum visualization (73 lines)
│   └── render-phase-space.glsl # Phase space plot (33 lines)
└── README.md                 # Documentation (81 lines)
```

## Key Components

### 1. WebGL Utilities (`webgl-utils.js`)
- WebGL2 context creation with high precision
- Shader compilation and program linking
- Transform feedback setup for compute shaders
- Fullscreen quad vertex shader

### 2. Texture Management (`texture-manager.js`)
- `TextureManager`: Creates RGBA32F floating-point textures
- `FramebufferManager`: Manages FBOs with multiple color attachments
- `PingPongBuffers`: Double-buffered texture swapping for iterative algorithms

### 3. User Interface (`ui.js`)
- System and integrator selection
- Parameter sliders (dt, iterations, perturbation scale)
- Color map selection (Viridis, Magma, Jet, Rainbow)
- Zoom and pan controls
- Hover info display
- Download functionality

### 4. Main Orchestrator (`main.js`)
- Initializes WebGL context
- Loads and compiles shaders
- Manages simulation loop
- Handles GPU rendering
- Event handling (hover, resize)
- Image export

### 5. Simulation Shaders

#### Integrators
- **RK4**: Fourth-order Runge-Kutta for generic ODE systems
- **Verlet**: Symplectic integrator for Hamiltonian systems

#### System Definitions
Each system provides a `systemDeriv()` function:
- `vec4 systemDeriv(vec4 state, vec4 params)`

State vector: `vec4(x, v, y, w)` or `vec4(theta1, omega1, theta2, omega2)`

### 6. Rendering Shaders

#### FTLE Visualization
- Converts FTLE scalar to color using selected colormap
- Supports linear and log scaling
- Dynamic recoloring without re-simulation

#### Pendulum Visualization
- Renders pendulum arms and masses using signed distance fields
- GPU-native rendering (no CPU readback)

#### Phase Space Plot
- Trajectory accumulation for hover probes
- Renders phase-space trajectories

## Data Flow

```
User Input (UI)
    ↓
Parameter Update
    ↓
Simulation Shader (GPU)
    ├─ State Texture (RK4/Verlet integration)
    ├─ Perturbation Texture (Gaussian)
    └─ FTLE Accumulator (log divergence)
    ↓
Render Shader (GPU)
    ├─ FTLE Color Mapping
    └─ Pendulum Visualization
    ↓
Display
```

## Key Features

- **GPU-only computation**: All simulation on GPU via shaders
- **High precision**: `highp` float with RGBA32F textures
- **Multiple systems**: 4 chaotic systems with modular architecture
- **Two integrators**: RK4 for ODEs, Verlet for Hamiltonians
- **Interactive**: Real-time hover, zoom, pan, parameter changes
- **Extensible**: Easy to add new systems (add GLSL file, update UI)
- **No backend**: Fully client-side, no server required

## Extension Points

### Adding a New System
1. Create `shaders/system-new-system.glsl` with `systemDeriv()` function
2. Add option to UI in `ui.js`
3. Register in `main.js` systemShaders map

### Adding a New Integrator
1. Create shader following RK4/Verlet pattern
2. Use transform feedback for output
3. Select via UI dropdown

### Adding a New Color Map
1. Add colormap function to `render-ftle.glsl`
2. Add option to UI dropdown

## Browser Requirements

- WebGL2 support
- `RGBA32F` floating-point textures
- Transform feedback support
- ES6 modules

## Performance Targets

- 1024×1024 resolution in real-time
- Multiple perturbations per pixel
- Minimal CPU-GPU synchronization
- Transform feedback for efficient simulation

## Future Extensions

- Multiple trajectory vectors for Lyapunov spectrum
- Time-dependent forcing systems
- Parameter sensitivity equations
- 3D systems with ray marching
- Symbolic Jacobian integration (Python backend)
