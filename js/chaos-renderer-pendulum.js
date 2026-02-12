// Double Pendulum Chaos Map - Pendulum Simulation Methods (Part 5)
// These methods extend ChaosMapRenderer

// Update the hover preview pane (top one) with current hover state
ChaosMapRenderer.prototype.updateHoverPreview = function(nx, ny) {
    // Compute the state at this position
    const state = this.stack.computeState(nx, ny);
    
    // Update hover preview state
    this.hoverPreviewState = { ...state };
    this.hoverPerturbedState = this.computePerturbedState(state);
    
    // Update the title
    const title = document.getElementById('hoverPaneTitle');
    if (title) {
        title.textContent = `Preview (${nx.toFixed(2)}, ${ny.toFixed(2)})`;
    }
    
    // Initialize or reset GPU simulation
    this.initHoverGPUSim(state);
};

// Initialize GPU simulation for hover preview
ChaosMapRenderer.prototype.initHoverGPUSim = function(state) {
    try {
        // Clean up existing simulation
        if (this.hoverGPUSim) {
            this.hoverGPUSim.destroy();
            this.hoverGPUSim = null;
        }
        
        // Cancel any existing animation frame
        if (this.hoverAnimationId) {
            cancelAnimationFrame(this.hoverAnimationId);
            this.hoverAnimationId = null;
        }
        
        // Create perturbed state
        const perturbedState = this.computePerturbedState(state);
        
        // Create new GPU simulation
        this.hoverGPUSim = new GPUPendulumSimulation(this.pendulumPreviewCanvas, {
            g: this.baseParams.g,
            dt: this.baseParams.dt,
            l1: state.l1,
            l2: state.l2,
            m1: state.m1,
            m2: state.m2,
            integrator: this.baseParams.integrator,
            threshold: this.baseParams.threshold,
            initialState1: {
                theta1: state.theta1,
                theta2: state.theta2,
                omega1: state.omega1,
                omega2: state.omega2
            },
            initialState2: {
                theta1: perturbedState.theta1,
                theta2: perturbedState.theta2,
                omega1: perturbedState.omega1,
                omega2: perturbedState.omega2
            },
            perturb: this.baseParams.perturbFixed
        });
        
        // Start animation loop
        this.animateHoverGPUSim();
    } catch (e) {
        console.error('Failed to initialize GPU simulation:', e);
        // Fall back to CPU rendering
        this.drawInPreviewPane(this.pendulumPreviewCanvas, this.hoverPreviewState, this.hoverPerturbedState);
    }
};

// Animation loop for hover GPU simulation
ChaosMapRenderer.prototype.animateHoverGPUSim = function() {
    if (!this.hoverGPUSim) return;
    
    // Step and render
    this.hoverGPUSim.step(this.pendulumSimSpeed);
    this.hoverGPUSim.render();
    
    // Continue animation
    this.hoverAnimationId = requestAnimationFrame(() => this.animateHoverGPUSim());
};

// Toggle pin mode - when active, clicking on map creates a pinned simulation
ChaosMapRenderer.prototype.togglePinMode = function(forceState = null) {
    this.pinMode = forceState !== null ? forceState : !this.pinMode;
    
    const btn = document.getElementById('pinSimBtn');
    const title = document.getElementById('pendulumPreviewTitle');
    
    if (this.pinMode) {
        if (btn) {
            btn.style.background = 'rgba(255, 200, 100, 0.3)';
            btn.style.borderColor = 'rgba(255, 200, 100, 0.5)';
            btn.style.color = '#fc8';
            btn.textContent = '📍 Click on map...';
        }
        if (title) title.textContent = 'Click on map to pin simulation';
        this.canvas.style.cursor = 'crosshair';
        // Cancel any layer creation mode
        if (this.layerCreationState.active || this.layerCreationState.isPlacingPin) {
            this.cancelLayerCreation();
        }
    } else {
        if (btn) {
            btn.style.background = 'rgba(100, 200, 100, 0.2)';
            btn.style.borderColor = 'rgba(100, 200, 100, 0.3)';
            btn.style.color = '#8f8';
            btn.textContent = '📍 Pin Sim';
        }
        this.updatePinnedSimulationTitle();
        this.canvas.style.cursor = 'default';
    }
};

// Clear all pinned simulations
ChaosMapRenderer.prototype.clearAllPinnedSimulations = function() {
    // Stop all animations and remove all simulations
    while (this.pinnedSimulations.length > 0) {
        this.removePinnedSimulation(this.pinnedSimulations[0].id);
    }
    this.updatePinnedSimulationTitle();
};

// Create a new pinned simulation (max 3)
ChaosMapRenderer.prototype.createPinnedSimulation = function(nx, ny) {
    // Check if we already have a simulation at this exact position
    const existing = this.pinnedSimulations.find(s => 
        Math.abs(s.nx - nx) < 0.01 && Math.abs(s.ny - ny) < 0.01
    );
    if (existing) return;
    
    // If at max capacity, remove the oldest one
    if (this.pinnedSimulations.length >= this.maxPinnedSimulations) {
        this.removePinnedSimulation(this.pinnedSimulations[0].id);
    }
    
    // Compute state
    const state = this.stack.computeState(nx, ny);
    const perturbedState = this.computePerturbedState(state);
    
    // Create simulation object
    const sim = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        nx,
        ny,
        state: { ...state },
        perturbedState: { ...perturbedState },
        trail: [],
        divergenceTime: null,
        animationId: null,
        canvas: null,
        element: null,
        gpuSim: null
    };
    
    // Create DOM element for this simulation
    sim.element = this.createPinnedSimulationElement(sim);
    
    // Add to container (after the hover pane)
    const container = document.getElementById('simulationContainer');
    if (container) {
        container.appendChild(sim.element);
    }
    
    // Get canvas and create GPU simulation
    sim.canvas = sim.element.querySelector('canvas');
    
    try {
        // Create GPU simulation
        sim.gpuSim = new GPUPendulumSimulation(sim.canvas, {
            g: this.baseParams.g,
            dt: this.baseParams.dt,
            l1: state.l1,
            l2: state.l2,
            m1: state.m1,
            m2: state.m2,
            integrator: this.baseParams.integrator,
            threshold: this.baseParams.threshold,
            initialState1: {
                theta1: state.theta1,
                theta2: state.theta2,
                omega1: state.omega1,
                omega2: state.omega2
            },
            initialState2: {
                theta1: perturbedState.theta1,
                theta2: perturbedState.theta2,
                omega1: perturbedState.omega1,
                omega2: perturbedState.omega2
            },
            perturb: this.baseParams.perturbFixed
        });
        
        // Store in map
        this.pinnedGPUSims.set(sim.id, sim.gpuSim);
    } catch (e) {
        console.error('Failed to create GPU simulation:', e);
        // Fall back to CPU-based simulation
        this.setupPinnedSimulationWebGL(sim);
    }
    
    // Add to array
    this.pinnedSimulations.push(sim);
    
    // Start animation
    this.animatePinnedSimulation(sim);
    
    // Update title
    this.updatePinnedSimulationTitle();
};

// Create DOM element for a pinned simulation
ChaosMapRenderer.prototype.createPinnedSimulationElement = function(sim) {
    const div = document.createElement('div');
    div.className = 'sim-pane pinned-pane';
    div.dataset.simId = sim.id;
    
    div.innerHTML = `
        <div class="sim-pane-header">
            <span class="sim-pane-title">Pinned (${sim.nx.toFixed(2)}, ${sim.ny.toFixed(2)})</span>
            <span class="sim-pane-status" id="status-${sim.id}">Running...</span>
            <button class="sim-pane-delete" data-sim-id="${sim.id}" title="Remove simulation">×</button>
        </div>
        <div class="preview-canvas-container">
            <canvas class="preview-canvas pinned-sim-canvas" width="256" height="256"></canvas>
        </div>
    `;
    
    // Add delete handler
    const deleteBtn = div.querySelector('.sim-pane-delete');
    deleteBtn.addEventListener('click', () => {
        this.removePinnedSimulation(sim.id);
    });
    
    return div;
};

// Setup WebGL context for a pinned simulation
ChaosMapRenderer.prototype.setupPinnedSimulationWebGL = function(sim) {
    if (!sim.canvas) return;
    
    sim.gl = sim.canvas.getContext('webgl', {
        antialias: true,
        preserveDrawingBuffer: true
    });
    
    if (!sim.gl) {
        console.error('WebGL not supported for pinned simulation');
        return;
    }
    
    const gl = sim.gl;
    
    // Use the shader scripts from HTML
    const vsEl = document.getElementById('pendulum-preview-vertex-shader');
    const fsEl = document.getElementById('pendulum-preview-fragment-shader');
    const vsSource = vsEl ? vsEl.textContent : null;
    const fsSource = fsEl ? fsEl.textContent : null;
    
    if (!vsSource || !fsSource) return;
    
    const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    
    if (!vs || !fs) return;
    
    sim.program = this.createProgram(gl, vs, fs);
    sim.trailBuffer = gl.createBuffer();
    sim.positionBuffer = gl.createBuffer();
};

// Remove a pinned simulation
ChaosMapRenderer.prototype.removePinnedSimulation = function(id) {
    const index = this.pinnedSimulations.findIndex(s => s.id === id);
    if (index === -1) return;
    
    const sim = this.pinnedSimulations[index];
    
    // Stop animation
    if (sim.animationId) {
        cancelAnimationFrame(sim.animationId);
    }
    
    // Clean up GPU simulation
    if (sim.gpuSim) {
        sim.gpuSim.destroy();
        this.pinnedGPUSims.delete(id);
    }
    
    // Remove DOM element
    if (sim.element && sim.element.parentNode) {
        sim.element.parentNode.removeChild(sim.element);
    }
    
    // Remove from array
    this.pinnedSimulations.splice(index, 1);
    
    // Update title
    this.updatePinnedSimulationTitle();
};

// Update the main title based on number of pinned simulations
ChaosMapRenderer.prototype.updatePinnedSimulationTitle = function() {
    const title = document.getElementById('pendulumPreviewTitle');
    if (title) {
        const count = this.pinnedSimulations.length;
        if (this.pinMode) {
            title.textContent = 'Click on map to pin simulation';
        } else if (count === 0) {
            title.textContent = 'Hover map to preview • Click Pin to save';
        } else {
            title.textContent = `${count} pinned simulation${count > 1 ? 's' : ''} (max 3)`;
        }
    }
};

// Animate a pinned simulation
ChaosMapRenderer.prototype.animatePinnedSimulation = function(sim) {
    const steps = this.pendulumSimSpeed;
    
    // Use GPU simulation if available
    if (sim.gpuSim) {
        // Step GPU simulation
        sim.gpuSim.step(steps);
        
        // Render
        sim.gpuSim.render();
        
        // Update status
        const statusEl = document.getElementById(`status-${sim.id}`);
        if (statusEl) {
            if (sim.gpuSim.diverged) {
                statusEl.textContent = `Diverged at t=${sim.gpuSim.divergenceTime}`;
                statusEl.style.color = '#f88';
            } else {
                statusEl.textContent = `t=${sim.gpuSim.frameCount}`;
                statusEl.style.color = '#8f8';
            }
        }
    } else {
        // Fallback to CPU simulation
        this.animatePinnedSimulationCPU(sim, steps);
    }
    
    // Continue animation
    sim.animationId = requestAnimationFrame(() => this.animatePinnedSimulation(sim));
};

// CPU fallback for pinned simulation animation
ChaosMapRenderer.prototype.animatePinnedSimulationCPU = function(sim, steps) {
    let diverged = false;
    
    // Get base state (lengths and masses)
    const baseState = this.stack.computeState(sim.nx, sim.ny);
    
    for (let i = 0; i < steps; i++) {
        // Step physics (GPU-side only - uses RK4 for preview)
        sim.state = this.stepPhysicsRK4OnGPU(sim.state, baseState.l1, baseState.l2, baseState.m1, baseState.m2);
        sim.perturbedState = this.stepPhysicsRK4OnGPU(sim.perturbedState, baseState.l1, baseState.l2, baseState.m1, baseState.m2);
        
        // Check for divergence
        if (!diverged && sim.divergenceTime === null) {
            const dist = this.measureDivergence(sim.state, sim.perturbedState);
            if (dist > this.baseParams.threshold) {
                sim.divergenceTime = sim.trail.length;
                diverged = true;
            }
        }
    }
    
    // Add to trail
    const x1 = baseState.l1 * Math.sin(sim.state.theta1);
    const y1 = baseState.l1 * Math.cos(sim.state.theta1);
    const x2 = x1 + baseState.l2 * Math.sin(sim.state.theta2);
    const y2 = y1 + baseState.l2 * Math.cos(sim.state.theta2);
    
    sim.trail.push({ x1, y1, x2, y2 });
    if (sim.trail.length > 400) {
        sim.trail.shift();
    }
    
    // Draw
    if (sim.gl && sim.program) {
        this.drawInWebGLContext(sim.gl, sim.program, sim.positionBuffer, sim.trailBuffer, sim.state, sim.perturbedState, sim.trail, baseState);
    }
    
    // Update status
    const statusEl = document.getElementById(`status-${sim.id}`);
    if (statusEl) {
        if (sim.divergenceTime !== null) {
            statusEl.textContent = `Diverged at t=${sim.divergenceTime}`;
            statusEl.style.color = '#f88';
        } else {
            const time = sim.trail.length;
            statusEl.textContent = `t=${time}`;
            statusEl.style.color = '#8f8';
        }
    }
};
