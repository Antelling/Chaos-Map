# Quick Start Guide

## Installation

No installation required! This is a standalone client-side application.

## Running the Application

### Option 1: Simple HTTP Server (Python)
```bash
cd /home/anthony/lyapunovLoupe
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

### Option 2: NPM Serve (if Node.js installed)
```bash
cd /home/anthony/lyapunovLoupe
npm run serve
```

### Option 3: VS Code Live Server
1. Install "Live Server" extension
2. Right-click on `index.html`
3. Select "Open with Live Server"

## Basic Usage

1. **Select a System**: Choose from the dropdown menu
   - Double Pendulum: Classic chaotic system
   - Elastic Pendulum: Spring-coupled pendulum
   - Hénon–Heiles: 2D Hamiltonian
   - Duffing Oscillator: Forced nonlinear oscillator

2. **Choose Integrator**:
   - RK4: General-purpose, good accuracy
   - Verlet: Symplectic (energy-preserving) for Hamiltonian systems

3. **Set Parameters**:
   - `dt`: Time step (smaller = more accurate, slower)
   - `Iterations`: Number of integration steps per simulation
   - `Perturbation Scale`: Size of initial perturbation

4. **Run Simulation**: Click "Run Simulation" to compute FTLE field

5. **Explore**:
   - Hover over the map to see FTLE value and state
   - Use zoom controls to adjust view
   - Change color map to highlight different features

6. **Export**: Click "Download Image" to save the current visualization

## Understanding FTLE Maps

The visualization shows Finite-Time Lyapunov Exponent values:
- **High values (warm colors)**: Chaotic regions, sensitive to initial conditions
- **Low values (cool colors)**: Regular regions, predictable behavior

## Keyboard Shortcuts

Currently none, but you can use the UI controls for all interactions.

## Troubleshooting

### "WebGL2 not supported" error
- Update your browser to the latest version
- Chrome, Firefox, Safari, and Edge all support WebGL2
- Check if hardware acceleration is enabled in browser settings

### Simulation runs slowly
- Reduce the `Iterations` parameter
- Decrease canvas resolution (edit `index.html`)
- Close other browser tabs that might be using GPU

### Weird colors/artifacts
- Try a different `dt` value
- Reduce `Perturbation Scale`
- Try a different `Integrator`

## Tips

- Start with Double Pendulum and RK4 integrator
- Use `dt = 0.01` and `Iterations = 100` for good balance
- Viridis colormap is generally the most readable
- Hover in different regions to understand the chaos structure

## Next Steps

- Try different systems to compare chaos patterns
- Experiment with parameter combinations
- Use zoom to explore fractal structure in chaotic regions
- Save interesting configurations for reference
