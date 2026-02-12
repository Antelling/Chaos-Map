// Double Pendulum Chaos Map - Pendulum Simulation Methods (Part 5)
// Uses CPU-based simulation with 2D Canvas rendering
// Always uses Velocity Verlet symplectic integrator for accuracy

// Hover debounce timer - shared across all preview updates
ChaosMapRenderer.prototype.hoverDebounceTimer = null;
ChaosMapRenderer.prototype.hoverDebouncedPosition = null;
ChaosMapRenderer.prototype.hoverCPUSim = null;

// Update the hover preview pane with current hover state
ChaosMapRenderer.prototype.updateHoverPreview = function(nx, ny) {
    // Store the position for debounced processing
    this.hoverDebouncedPosition = { nx, ny };
    
    // Clear existing timer
    if (this.hoverDebounceTimer) {
        clearTimeout(this.hoverDebounceTimer);
    }
    
    // Update the title immediately
    const title = document.getElementById('hoverPaneTitle');
    if (title) {
        title.textContent = `Preview (${nx.toFixed(2)}, ${ny.toFixed(2)})`;
    }
    
    // Compute state and perturbed state ONCE for consistency
    // Pass normalized coordinates for deterministic perturbation (matches GPU)
    const state = this.stack.computeState(nx, 1 - ny);
    const perturbedState = this.computePerturbedState(state, nx, 1 - ny);
    
    // Show static preview immediately
    this.renderStaticHoverPreview(state, perturbedState);
    
    // Debounce: wait 500ms before starting animation
    this.hoverDebounceTimer = setTimeout(() => {
        if (this.hoverDebouncedPosition && 
            this.hoverDebouncedPosition.nx === nx && 
            this.hoverDebouncedPosition.ny === ny) {
            // Mouse has stopped for 500ms, start animation
            this.initHoverCPUSim(state, perturbedState);
        }
    }, 500);
};

// Render a static preview (one frame, no animation)
ChaosMapRenderer.prototype.renderStaticHoverPreview = function(state, perturbedState) {
    // If already animating, don't override
    if (this.hoverAnimationId) return;
    
    try {
        // Create a temporary simulation just for one frame
        const tempSim = new CPUPendulumSimulation(this.pendulumPreviewCanvas, {
            g: this.baseParams.g,
            dt: this.baseParams.dt,
            l1: state.l1,
            l2: state.l2,
            m1: state.m1,
            m2: state.m2,

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
        
        // Render one frame
        tempSim.render();
    } catch (e) {
        console.error('Failed to render static preview:', e);
    }
};

// Initialize CPU simulation for hover preview
ChaosMapRenderer.prototype.initHoverCPUSim = function(state, perturbedState) {
    try {
        // Clean up existing simulation
        if (this.hoverCPUSim) {
            this.hoverCPUSim.destroy();
            this.hoverCPUSim = null;
        }
        
        // Cancel any existing animation frame
        if (this.hoverAnimationId) {
            cancelAnimationFrame(this.hoverAnimationId);
            this.hoverAnimationId = null;
        }
        
        // Get energy canvases and clear them
        const energyCanvas = document.getElementById('energyCanvas');
        const energyTimeCanvas = document.getElementById('energyTimeCanvas');
        if (energyCanvas) {
            const ctx = energyCanvas.getContext('2d');
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, energyCanvas.width, energyCanvas.height);
        }
        if (energyTimeCanvas) {
            const ctx = energyTimeCanvas.getContext('2d');
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, energyTimeCanvas.width, energyTimeCanvas.height);
        }
        
        // Create CPU-based simulation (using pre-computed states)
        this.hoverCPUSim = new CPUPendulumSimulation(this.pendulumPreviewCanvas, {
            g: this.baseParams.g,
            dt: this.baseParams.dt,
            l1: state.l1,
            l2: state.l2,
            m1: state.m1,
            m2: state.m2,
            energyCanvas: energyCanvas,
            energyTimeCanvas: energyTimeCanvas,
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
        
        // Initial render before starting animation
        this.hoverCPUSim.render();
        
        // Start animation loop
        this.animateHoverCPUSim();
    } catch (e) {
        console.error('Failed to initialize hover simulation:', e);
    }
};

// Animation loop for hover simulation
ChaosMapRenderer.prototype.animateHoverCPUSim = function() {
    if (!this.hoverCPUSim) {
        this.hoverAnimationId = null;
        return;
    }
    
    // Step and render
    try {
        this.hoverCPUSim.step(this.pendulumSimSpeed);
        this.hoverCPUSim.render();
    } catch (e) {
        console.error('Error in hover simulation:', e);
        this.hoverCPUSim = null;
        this.hoverAnimationId = null;
        return;
    }
    
    // Continue animation
    this.hoverAnimationId = requestAnimationFrame(() => this.animateHoverCPUSim());
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
        animationId: null,
        canvas: null,
        element: null,
        cpuSim: null
    };
    
    // Create DOM element for this simulation
    sim.element = this.createPinnedSimulationElement(sim);
    
    // Add to container (after the hover pane)
    const container = document.getElementById('simulationContainer');
    if (container) {
        container.appendChild(sim.element);
    }
    
    // Get canvas and create CPU simulation
    sim.canvas = sim.element.querySelector('canvas');
    
    try {
        // Create CPU-based simulation
        sim.cpuSim = new CPUPendulumSimulation(sim.canvas, {
            g: this.baseParams.g,
            dt: this.baseParams.dt,
            l1: state.l1,
            l2: state.l2,
            m1: state.m1,
            m2: state.m2,

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
        
        // Initial render
        sim.cpuSim.render();
    } catch (e) {
        console.error('Failed to create CPU simulation:', e);
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
    
    // Clean up CPU simulation
    if (sim.cpuSim) {
        sim.cpuSim.destroy();
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
    if (sim.cpuSim) {
        try {
            // Step simulation
            sim.cpuSim.step(steps);
            
            // Render
            sim.cpuSim.render();
            
            // Update status
            const statusEl = document.getElementById(`status-${sim.id}`);
            if (statusEl) {
                if (sim.cpuSim.diverged) {
                    statusEl.textContent = `Diverged at t=${sim.cpuSim.divergenceTime}`;
                    statusEl.style.color = '#f88';
                } else {
                    statusEl.textContent = `t=${sim.cpuSim.frameCount}`;
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

// Stop hover simulation when mouse leaves
ChaosMapRenderer.prototype.stopHoverSimulation = function() {
    // Clear debounce timer
    if (this.hoverDebounceTimer) {
        clearTimeout(this.hoverDebounceTimer);
        this.hoverDebounceTimer = null;
    }
    this.hoverDebouncedPosition = null;
    
    // Stop animation
    if (this.hoverAnimationId) {
        cancelAnimationFrame(this.hoverAnimationId);
        this.hoverAnimationId = null;
    }
    
    // Clean up simulation
    if (this.hoverCPUSim) {
        this.hoverCPUSim.destroy();
        this.hoverCPUSim = null;
    }
};
