// Double Pendulum Chaos Map - Pendulum Simulation Methods (Part 5)
// These methods extend ChaosMapRenderer

// Update the hover preview pane (top one) with current hover state
ChaosMapRenderer.prototype.updateHoverPreview = function(nx, ny) {
    // Compute the state at this position
    // Flip Y to match shader coordinate system (shader uses flipped Y for noise sampling)
    const state = this.stack.computeState(nx, 1 - ny);
    
    // Update hover preview state
    this.hoverPreviewState = { ...state };
    this.hoverPerturbedState = this.computePerturbedState(state);
    
    // Update the title
    const title = document.getElementById('hoverPaneTitle');
    if (title) {
        title.textContent = `Preview (${nx.toFixed(2)}, ${ny.toFixed(2)})`;
    }
    
    // Only reinitialize simulation if state has actually changed significantly
    // This prevents constant reset during mouse hover
    if (!this.hoverGPUSim || this.hasStateChangedSignificantly(state, this.lastHoverSimState)) {
        this.initHoverGPUSim(state);
        this.lastHoverSimState = { ...state };
    }
};

// Check if state has changed enough to warrant simulation reinitialization
ChaosMapRenderer.prototype.hasStateChangedSignificantly = function(newState, oldState) {
    if (!oldState) return true;
    
    // Use a smaller threshold for more responsive hover updates
    // Angle threshold: ~0.006 degrees (very sensitive)
    // Length/mass threshold: 0.1% change
    const angleThreshold = 0.0001;
    const paramThreshold = 0.001;
    
    return (
        Math.abs(newState.theta1 - oldState.theta1) > angleThreshold ||
        Math.abs(newState.theta2 - oldState.theta2) > angleThreshold ||
        Math.abs(newState.omega1 - oldState.omega1) > angleThreshold ||
        Math.abs(newState.omega2 - oldState.omega2) > angleThreshold ||
        Math.abs(newState.l1 - oldState.l1) > paramThreshold ||
        Math.abs(newState.l2 - oldState.l2) > paramThreshold ||
        Math.abs(newState.m1 - oldState.m1) > paramThreshold ||
        Math.abs(newState.m2 - oldState.m2) > paramThreshold
    );
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
        
        // Debug: verify states are different
        console.log('Creating sim:', {
            s1: {t1: state.theta1.toFixed(6), t2: state.theta2.toFixed(6)},
            s2: {t1: perturbedState.theta1.toFixed(6), t2: perturbedState.theta2.toFixed(6)},
            diff: (perturbedState.theta1 - state.theta1).toExponential(2)
        });
        
        // Use GPUPendulumSimulation (CPU physics + WebGL rendering)
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
            }
        });
        
        // Start animation loop
        this.animateHoverGPUSim();
    } catch (e) {
        console.error('Failed to initialize simulation:', e);
    }
};

// Animation loop for hover simulation
ChaosMapRenderer.prototype.animateHoverGPUSim = function() {
    if (!this.hoverGPUSim) {
        this.hoverAnimationId = null;
        return;
    }
    
    // Check if WebGL context is valid
    if (this.hoverGPUSim.gl.isContextLost()) {
        this.hoverAnimationId = null;
        return;
    }
    
    // Step and render
    try {
        this.hoverGPUSim.step(this.pendulumSimSpeed);
        this.hoverGPUSim.render();
    } catch (e) {
        console.error('Error in hover simulation:', e);
        this.hoverGPUSim = null;
        this.hoverAnimationId = null;
        return;
    }
    
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
    
    // Compute state (flip Y to match shader coordinate system)
    const state = this.stack.computeState(nx, 1 - ny);
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
        // Create simulation (CPU physics + WebGL rendering)
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
            }
        });
        
        // Store in map
        this.pinnedGPUSims.set(sim.id, sim.gpuSim);
    } catch (e) {
        console.error('Failed to create simulation:', e);
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
    // Check if simulation still exists
    const stillExists = this.pinnedSimulations.find(s => s.id === sim.id);
    if (!stillExists) {
        sim.animationId = null;
        return;
    }
    
    const steps = this.pendulumSimSpeed;
    
    // Use CPU-based simulation
    if (sim.gpuSim) {
        try {
            // Step simulation
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
        } catch (e) {
            console.error(`Error in pinned simulation ${sim.id}:`, e);
            // Stop animation on error
            return;
        }
    }
    
    // Continue animation
    sim.animationId = requestAnimationFrame(() => this.animatePinnedSimulation(sim));
};


