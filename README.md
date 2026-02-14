# Double Pendulum Chaos Map

An interactive WebGL-based visualization tool for exploring the chaotic behavior of double pendulum systems.

**[🌐 Launch the Chaos Map](https://antelling.github.io/Chaos-Map/chaos-map.html)**

---

## Overview

This tool generates "chaos maps" that visualize how quickly two nearly identical double pendulums diverge from each other. Each pixel in the map represents a different initial condition, and the color indicates how many iterations it took for the two pendulums to diverge beyond a threshold.

![Example Chaos Map](assets/chaos-map-example.png)

*Example chaos map showing θ₁ vs θ₂. Colors indicate divergence rate - warmer colors (yellow/green) diverge quickly (chaotic), cooler colors (blue/purple) take longer to diverge.*

---

## Double Pendulum Equations of Motion

The double pendulum system consists of two pendulums attached end-to-end, with the following state variables:

- **θ₁, θ₂**: Angles of the first and second pendulum (radians, 0 = hanging down)
- **ω₁, ω₂**: Angular velocities of the first and second pendulum (rad/s)

The equations of motion are derived from Lagrangian mechanics:

```
Let:
  M = m₁ + m₂ (total mass)
  δ = θ₁ - θ₂ (angle difference)
  sinδ = sin(δ), cosδ = cos(δ)
  denom = m₁ + m₂ × sin²(δ)

Angular accelerations (α₁, α₂):

  num₁ = -m₂·L₁·ω₁²·sinδ·cosδ 
         - m₂·L₂·ω₂²·sinδ 
         - M·g·sin(θ₁) 
         + m₂·g·sin(θ₂)·cosδ

  num₂ = M·L₁·ω₁²·sinδ 
         + m₂·L₂·ω₂²·sinδ·cosδ 
         + M·g·sin(θ₁)·cosδ 
         - M·g·sin(θ₂)

  α₁ = num₁ / (L₁ × denom)
  α₂ = num₂ / (L₂ × denom)
```

The state derivatives are:
- dθ₁/dt = ω₁
- dθ₂/dt = ω₂  
- dω₁/dt = α₁
- dω₂/dt = α₂

---

## Divergence Detection

To detect chaotic behavior, the simulation runs **two pendulums simultaneously** from slightly different initial conditions:

1. **Pendulum 1**: Starts at the base state defined by the pixel position
2. **Pendulum 2**: Starts with a small perturbation (offset) from the base state

### Divergence Metric

At each timestep, the Euclidean distance between the two pendulum states is computed:

```
dθ₁ = circular_diff(θ₁₁, θ₁₂)   [normalized to [-π, π]]
dθ₂ = circular_diff(θ₂₁, θ₂₂)   [normalized to [-π, π]]
dω₁ = ω₁₁ - ω₁₂
dω₂ = ω₂₁ - ω₂₂

divergence = √(dθ₁² + dθ₂² + dω₁² + dω₂²)
```

### When Divergence is Detected

- If `divergence > threshold`: The pendulums have diverged
- The iteration count at divergence determines the pixel color
- If no divergence occurs within `maxIterations`, the pixel is colored white (stable/non-chaotic)

### Perturbation Modes

Two modes for creating the initial perturbation:

| Mode | Description |
|------|-------------|
| **Fixed** | Adds constant offsets to each parameter (θ₁, θ₂, ω₁, ω₂, L₁, L₂, m₁, m₂) |
| **Random** | Uses Gaussian (normal) distributed perturbations with configurable center and standard deviation for each parameter |

---

## Numerical Integrators

The simulation supports two numerical integration methods:

### 1. RK4 (Runge-Kutta 4th Order)

A general-purpose explicit integrator that provides good accuracy for most systems.

```
k₁ = f(s)
k₂ = f(s + 0.5·dt·k₁)
k₃ = f(s + 0.5·dt·k₂)
k₄ = f(s + dt·k₃)

s_next = s + (dt/6) × (k₁ + 2k₂ + 2k₃ + k₄)
```

**Characteristics**:
- 4th-order accuracy (error ~ O(dt⁵))
- Good for general-purpose simulation
- May accumulate energy error over very long integrations

### 2. Velocity Verlet (Symplectic)

A symplectic integrator specifically designed for Hamiltonian systems.

```
// Half-step velocity
ω_half = ω + 0.5·dt·α

// Full position update
θ_next = θ + dt·ω_half

// New accelerations at updated positions
α_new = compute_accelerations(θ_next)

// Final half-step velocity
ω_next = ω_half + 0.5·dt·α_new
```

**Characteristics**:
- Preserves energy and phase space volume over long periods
- Better for studying long-term chaotic behavior
- 2nd-order accuracy but superior stability
- Recommended for most chaos visualization

---

## Simulation Parameters

### Pendulum Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Gravity (g)** | 9.81 m/s² | Gravitational acceleration |

### Simulation Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Time Step (dt)** | 0.002 s | Integration timestep. Smaller values = more accurate but slower |
| **Max Iterations** | 20,000 | Maximum simulation steps before giving up on divergence |
| **Divergence Threshold** | 0.05 | Distance threshold for declaring divergence (radians + rad/s) |
| **Perturbation Mode** | Random | Fixed offsets or Random (Gaussian) perturbations |
| **Integrator** | Verlet | RK4 or Velocity Verlet |

### Map Settings

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Map Resolution** | 1024×1024 | Pixel resolution of the chaos map (256 to 4096) |

### Color Mapping

| Parameter | Default | Description |
|-----------|---------|-------------|
| **Tone Mapping** | Linear | How iteration counts are mapped to colors: Linear, Logarithmic, Square Root, Exponential, S-Curve, Gamma 0.4, Hyper Log, Hard Cap 97%, Cyclical |
| **Color Palette** | Rainbow | Color scheme: Rainbow, Heatmap, Cool, Hot, Grayscale, Viridis, Plasma, Inverted Rainbow |
| **Cycle Period** | 500 | For Cyclical tone mapping, the period of color cycling |

### Transformation Stack (Layer-Based)

The map axes can map any two pendulum parameters using a layer-based system:

**Available Dimensions:**
- θ₁ (theta1): First pendulum angle (rad)
- θ₂ (theta2): Second pendulum angle (rad)
- ω₁ (omega1): First angular velocity (rad/s)
- ω₂ (omega2): Second angular velocity (rad/s)
- L₁ (l1): First pendulum length (m)
- L₂ (l2): Second pendulum length (m)
- m₁ (m1): First bob mass (kg)
- m₂ (m2): Second bob mass (kg)

**Layer Workflow:**
1. Start with a base state (all parameters at default values)
2. Add layers that map X/Y viewport to any two dimensions
3. Place pins on the map to sample states and create new layers
4. Stack layers to explore high-dimensional parameter spaces

**Default Ranges by Dimension:**

| Dimension | Min | Max |
|-----------|-----|-----|
| θ₁, θ₂ | -3.14 | 3.14 rad |
| ω₁, ω₂ | -10 | 10 rad/s |
| L₁, L₂ | 0.1 | 3 m |
| m₁, m₂ | 0.1 | 5 kg |

---

## Controls

- **Hover**: Preview pendulum animation at cursor position
- **Click + Drag**: Zoom into a region of the map
- **Right Click**: Zoom out
- **Pin Sim Button**: Save a simulation for side-by-side comparison (max 3)
- **Generate Button**: Recompute the chaos map with current settings
- **Download Button**: Save the current map as PNG image

---

## Technical Details

- **Physics**: CPU-based 64-bit double precision
- **Rendering**: WebGL GPU-accelerated tile-based rendering
- **Chaos Map**: Fragment shader computes divergence for each pixel in parallel
- **Browser Support**: Requires WebGL-enabled browser
