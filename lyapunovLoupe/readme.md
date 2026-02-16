# requirements.md — GPU-Only Visual Exploration Architecture (Updated with Verlet & Rendering)

---

# 1. Project Context

This system is a **fully client-side WebGL visualization platform** for exploring chaotic dynamical systems.

Key points:

* No backend; all computation runs on the GPU.
* Systems include: Double Pendulum, Elastic Double Pendulum, Hénon–Heiles, Duffing Oscillator.
* Approximates FTLE / chaotic behavior using **random Gaussian perturbations**.
* Supports **RK4 and Störmer–Verlet integration** depending on system type.
* Allows interactive exploration: parameter changes, dimension navigation, zoom, hover probing.
* Provides real-time rendering of **trajectories and oscillators** directly on GPU.

---

# 2. Core Principles

1. **GPU-centric computation and rendering**

   * All integration and perturbation propagation occurs on the GPU.
   * Trajectories, pendulum arms, and oscillator positions are rendered without CPU readback.

2. **High-precision floating-point**

   * Use `highp` everywhere.
   * Use `RGBA32F` textures for state, auxiliary data, and trajectory accumulation.

3. **Separation of concerns**

   * **Simulation shader:** updates state, applies perturbations, computes approximate FTLE, integrates via RK4 or Verlet.
   * **Rendering shader:** converts state, FTLE, and trajectory data into visual output.
   * **UI layer:** handles input, hover, parameter changes, dimension selection, and coloring.

---

# 3. Simulation Architecture

### 3.1 Texture Layout

For each pixel (initial condition):

* **State texture**: stores N floats per system (vec2, vec4, or split for N>4).
* **Perturbation texture**: small Gaussian deviation vector.
* **FTLE accumulator texture**: scalar divergence sum.
* **Optional trajectory accumulation texture**: positions for rendering oscillator/pendulum.
* **Optional parameter texture**: per-pixel system parameters.

---

### 3.2 Integration Loop

* **Integrator:** RK4 or Störmer–Verlet (if system supports Hamiltonian form).
* Each step:

1. **Propagate state:** integrate base trajectory (RK4 or Verlet).
2. **Apply perturbation:** add Gaussian deviation vector.
3. **Propagate perturbed state:** integrate perturbed trajectory.
4. **Compute separation:** `delta = ||x_perturbed - x||`.
5. **Update FTLE accumulator:** `S += log(delta / delta0)`.
6. **Renormalize perturbation:** maintain small deviation size.
7. **Optional:** store positions into trajectory texture for rendering.

* Repeat for a fixed number of steps to generate **finite-time Lyapunov estimates**.

---

### 3.3 Random Gaussian Perturbations

* Generate per-pixel on GPU using high-quality GLSL PRNG.
* Support **multiple independent perturbations per pixel** to reduce noise.
* Optionally average results for smoother FTLE fields.

---

# 4. Rendering Architecture

### 4.1 FTLE / Field Visualization

* Input: FTLE accumulator texture.

* Shader converts scalar to color using:

  * Linear scaling
  * Log scaling
  * Diverging or user-selectable color maps

* Recoloring is **dynamic**; does not require simulation re-run.

---

### 4.2 Pendulum / Oscillator Rendering

* Render **trajectories, pendulum arms, and oscillator masses** entirely on GPU:

  1. **Trajectory accumulation:**

     * Optional floating-point texture stores recent positions.
     * Shader draws lines / trails from positions.
  2. **Pendulum arms / oscillator masses:**

     * Compute positions from state vector in shader.
     * Render using GPU primitives (lines for arms, circles for masses).
  3. **Avoid CPU readbacks** for real-time rendering.

* Hovered points or isolated probes may read **single-pixel state** for additional 2D plots, but main visualization remains GPU-native.

---

### 4.3 Hover / Probe Rendering

* On hover:

  * Use `gl.readPixels` for the single selected pixel to obtain current state.
  * Launch isolated secondary GPU simulation for this initial condition.
  * Render:

    * Phase-space trajectory
    * FTLE(t) curve
    * Pendulum or oscillator visualization

* These are **small isolated runs**, not the main texture grid.

---

# 5. GPU Pipeline

### 5.1 Simulation Pass

* Input: state + perturbation + parameters.
* Output: updated state, perturbation, FTLE accumulator, trajectory positions.
* Supports multiple steps per frame.
* Supports batching multiple independent perturbations per pixel.
* Integrator chosen per system (RK4 or Verlet).

---

### 5.2 Rendering Pass

* Reads FTLE texture and optional trajectory texture.

* Draws:

  * FTLE color map
  * Pendulum arms and masses
  * Oscillator positions
  * Trajectories / trails

* Allows dynamic color LUT updates without re-simulation.

---

### 5.3 Hover Probe Pass

* Isolated pixel simulation on GPU.
* RK4 or Verlet integration.
* Trajectory / FTLE accumulation stored in small per-probe textures.
* Output rendered to overlay canvas or separate visual panel.

---

# 6. Performance Requirements

* Support **1024×1024 IC resolution** in real time.
* Multiple perturbations per pixel without noticeable FPS drop.
* Maintain highp precision for chaotic systems.
* Avoid CPU-GPU stalls; only read single pixels for hover probes.
* Render pendulums / oscillator masses entirely on GPU to minimize overhead.

---

# 7. Extensibility

* Support arbitrary **low-dimensional chaotic systems** defined in GLSL.
* Easily add new ODEs or Hamiltonians.
* Plug in multiple integrators (Euler, RK4, Verlet).
* Adjustable perturbation strategies (Gaussian, uniform, multiple vectors).
* Optional trajectory accumulation textures for advanced rendering.
* Future: support multi-dimensional FTLE matrices.

---

# 8. UX Requirements

* Smooth zoom and pan.
* Dimension sliders for non-displayed coordinates.
* Hover probe visualization: trajectory + FTLE(t) curve + pendulum/oscillator rendering.
* Dynamic color mapping for FTLE.
* Toggle Gaussian averaging for smoother FTLE maps.
* Optionally highlight multiple trajectories or past paths.

---

# 9. Summary

This architecture allows:

* Fully **client-side, GPU-only chaotic system exploration**.
* FTLE-like visualizations using **random Gaussian perturbations**.
* Supports **RK4 and Störmer–Verlet integration**.
* Real-time rendering of **pendulums, elastic pendulums, and oscillators** entirely on GPU.
* Interactive exploration: hover probes, zoom, pan, parameter adjustments, color mapping.
* High performance and scalability without backend dependencies.

It is **modular, GPU-native, and flexible**, and can be extended later to integrate symbolic Jacobian approaches if higher mathematical rigor is desired.

