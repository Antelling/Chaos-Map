// Double Pendulum Chaos Map - Renderer UI Methods (Part 2)
// These methods extend ChaosMapRenderer

// Event Listeners setup
ChaosMapRenderer.prototype.setupEventListeners = function() {
    // Base parameter inputs
    const inputs = ['dt', 'maxIter', 'threshold'];
    inputs.forEach(id => {
        const el = document.getElementById(id + 'Input');
        if (el) {
            el.addEventListener('change', () => this.updateBaseParams());
        }
    });
    
    // Perturbation Mode
    const perturbModeSelect = document.getElementById('perturbModeSelect');
    if (perturbModeSelect) {
        perturbModeSelect.addEventListener('change', () => {
            this.updateBaseParams();
            this.updatePerturbConfigUI();
        });
    }
    
    // Integrator
    const integratorSelect = document.getElementById('integratorSelect');
    if (integratorSelect) {
        integratorSelect.addEventListener('change', () => {
            this.updateBaseParams();
            if (!this.isRendering) this.generateMap();
        });
    }
    
    // Resolution
    const resSelect = document.getElementById('resolutionSelect');
    if (resSelect) {
        resSelect.addEventListener('change', (e) => {
            this.baseParams.resolution = parseInt(e.target.value);
            // Update CPU renderer resolution if it exists
            if (this.cpuChaosRenderer) {
                this.cpuChaosRenderer.resolution = this.baseParams.resolution;
            }
            this.resizeCanvas();
        });
    }
    
    // Render mode (GPU vs CPU)
    const renderModeSelect = document.getElementById('renderModeSelect');
    if (renderModeSelect) {
        renderModeSelect.addEventListener('change', (e) => {
            this.renderMode = e.target.value;
            if (!this.isRendering) this.generateMap();
        });
    }
    
    // Color mapping
    const colorSelect = document.getElementById('colorMappingSelect');
    if (colorSelect) {
        colorSelect.addEventListener('change', (e) => {
            this.colorMapping = parseInt(e.target.value);
            const cycleGroup = document.getElementById('cyclePeriodGroup');
            if (cycleGroup) {
                cycleGroup.style.display = (this.colorMapping === 8) ? 'flex' : 'none';
            }
            if (!this.isRendering) this.generateMap();
        });
    }
    
    // Cycle period
    const cycleInput = document.getElementById('cyclePeriodInput');
    if (cycleInput) {
        cycleInput.addEventListener('change', (e) => {
            this.cyclePeriod = parseFloat(e.target.value) || 500;
            if (this.colorMapping === 8 && !this.isRendering) this.generateMap();
        });
    }
    
    // Hue mapping
    const hueSelect = document.getElementById('hueMappingSelect');
    if (hueSelect) {
        hueSelect.addEventListener('change', (e) => {
            this.hueMapping = parseInt(e.target.value);
            this.updateLegend();
            if (!this.isRendering) this.generateMap();
        });
    }
    
    // Generate button
    const genBtn = document.getElementById('generateBtn');
    if (genBtn) {
        genBtn.addEventListener('click', () => this.generateMap());
    }
    
    // Download button
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => this.downloadImage());
    }
    
    // Map interactions
    this.canvas.addEventListener('mousedown', (e) => this.handleMapMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.handleMapMouseMove(e));
    this.canvas.addEventListener('mouseup', (e) => this.handleMapMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.handleMapMouseLeave());
    this.canvas.addEventListener('click', (e) => this.handleMapClick(e));
    
    // Zoom control buttons
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => this.zoomOut());
    }
    
    // Right-click to zoom out
    this.canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.zoomOut();
    });
    
    // Stack editor
    this.setupStackEditorListeners();
    
    // Pin simulation button
    const pinSimBtn = document.getElementById('pinSimBtn');
    if (pinSimBtn) {
        pinSimBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePinMode();
        });
    }
    
    // Clear all pins button
    const clearPinsBtn = document.getElementById('clearPinsBtn');
    if (clearPinsBtn) {
        clearPinsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearAllPinnedSimulations();
        });
    }
    
    // Simulation speed control
    const speedSlider = document.getElementById('simSpeedSlider');
    if (speedSlider) {
        speedSlider.addEventListener('input', (e) => {
            this.pendulumSimSpeed = parseInt(e.target.value);
            const valEl = document.getElementById('speedValue');
            if (valEl) valEl.textContent = this.pendulumSimSpeed + 'x';
        });
    }
    
    window.addEventListener('resize', () => this.resizeCanvas());
};

ChaosMapRenderer.prototype.setupStackEditorListeners = function() {
    // Dimension dropdowns
    const xDimSelect = document.getElementById('xDimSelect');
    const yDimSelect = document.getElementById('yDimSelect');
    
    if (xDimSelect) {
        xDimSelect.addEventListener('change', (e) => {
            this.layerCreationState.xDim = e.target.value;
            if (this.layerCreationState.pinPosition) {
                this.renderPreviewAtPin();
            }
        });
    }
    
    if (yDimSelect) {
        yDimSelect.addEventListener('change', (e) => {
            this.layerCreationState.yDim = e.target.value;
            if (this.layerCreationState.pinPosition) {
                this.renderPreviewAtPin();
            }
        });
    }
    
    // Delta mode checkbox
    const deltaModeCheckbox = document.getElementById('deltaModeCheckbox');
    if (deltaModeCheckbox) {
        deltaModeCheckbox.addEventListener('change', (e) => {
            this.layerCreationState.deltaMode = e.target.checked;
            if (this.layerCreationState.pinPosition) {
                this.renderPreviewAtPin();
            }
        });
    }
    
    // Range inputs - update state and preview
    const rangeInputs = ['xMin', 'xMax', 'yMin', 'yMax'];
    rangeInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', () => {
                this.updateLayerCreationState();
                if (this.layerCreationState.pinPosition) {
                    this.renderPreviewAtPin();
                }
            });
        }
    });
    
    // Place Pin button
    const placePinBtn = document.getElementById('placePinBtn');
    if (placePinBtn) {
        placePinBtn.addEventListener('click', () => {
            this.startPinPlacement();
        });
    }
    
    // Save Layer button
    const saveLayerBtn = document.getElementById('saveLayerBtn');
    if (saveLayerBtn) {
        saveLayerBtn.addEventListener('click', () => {
            this.saveLayer();
        });
    }
    
    // Cancel button
    const cancelLayerBtn = document.getElementById('cancelLayerBtn');
    if (cancelLayerBtn) {
        cancelLayerBtn.addEventListener('click', () => {
            this.cancelLayerCreation();
        });
    }
};

// Layer creation methods
ChaosMapRenderer.prototype.updateDefaultRanges = function() {
    const xDefaults = DIM_DEFAULTS[this.layerCreationState.xDim];
    const yDefaults = DIM_DEFAULTS[this.layerCreationState.yDim];
    
    document.getElementById('xMin').value = xDefaults.min;
    document.getElementById('xMax').value = xDefaults.max;
    document.getElementById('yMin').value = yDefaults.min;
    document.getElementById('yMax').value = yDefaults.max;
    
    this.updateLayerCreationState();
};

ChaosMapRenderer.prototype.updateLayerCreationState = function() {
    const xMin = parseFloat(document.getElementById('xMin')?.value);
    const xMax = parseFloat(document.getElementById('xMax')?.value);
    const yMin = parseFloat(document.getElementById('yMin')?.value);
    const yMax = parseFloat(document.getElementById('yMax')?.value);
    
    this.layerCreationState.xMin = isNaN(xMin) ? -3.14 : xMin;
    this.layerCreationState.xMax = isNaN(xMax) ? 3.14 : xMax;
    this.layerCreationState.yMin = isNaN(yMin) ? -3.14 : yMin;
    this.layerCreationState.yMax = isNaN(yMax) ? 3.14 : yMax;
};

ChaosMapRenderer.prototype.startPinPlacement = function() {
    this.layerCreationState.isPlacingPin = true;
    this.layerCreationState.active = true;
    
    // Sync state from UI controls
    const xDimSelect = document.getElementById('xDimSelect');
    const yDimSelect = document.getElementById('yDimSelect');
    const deltaModeCheckbox = document.getElementById('deltaModeCheckbox');
    
    if (xDimSelect) this.layerCreationState.xDim = xDimSelect.value;
    if (yDimSelect) this.layerCreationState.yDim = yDimSelect.value;
    if (deltaModeCheckbox) this.layerCreationState.deltaMode = deltaModeCheckbox.checked;
    
    // Update ranges from inputs
    this.updateLayerCreationState();
    
    // Show preview panel
    const previewPanel = document.getElementById('previewPanel');
    if (previewPanel) previewPanel.style.display = 'block';
    
    // Update UI
    const placePinBtn = document.getElementById('placePinBtn');
    if (placePinBtn) {
        placePinBtn.textContent = 'Click map to place pin...';
        placePinBtn.style.background = 'rgba(255, 200, 100, 0.2)';
        placePinBtn.style.borderColor = 'rgba(255, 200, 100, 0.3)';
        placePinBtn.style.color = '#fc8';
    }
    
    this.canvas.style.cursor = 'crosshair';
    
    // Initial render at center so preview isn't blank
    this.schedulePreviewRender(0.5, 0.5);
};

ChaosMapRenderer.prototype.placePin = function(nx, ny) {
    this.layerCreationState.pinPosition = { nx, ny };
    this.layerCreationState.isPlacingPin = false;
    
    // Update UI
    const placePinBtn = document.getElementById('placePinBtn');
    if (placePinBtn) {
        placePinBtn.textContent = '📍 Move Pin';
        placePinBtn.style.background = '';
        placePinBtn.style.borderColor = '';
        placePinBtn.style.color = '';
    }
    
    const pinStatus = document.getElementById('pinStatus');
    if (pinStatus) {
        pinStatus.style.display = 'block';
        document.getElementById('pinPosX').textContent = nx.toFixed(2);
        document.getElementById('pinPosY').textContent = ny.toFixed(2);
    }
    
    this.canvas.style.cursor = 'default';
    
    // Render preview at the pinned position
    this.renderPreviewAtPin();
};

ChaosMapRenderer.prototype.renderPreviewAtPin = function() {
    const pos = this.layerCreationState.pinPosition;
    if (!pos) return;
    
    // This will render the preview at the pinned position using current settings
    this.renderPreview(pos.nx, pos.ny);
};

ChaosMapRenderer.prototype.saveLayer = function() {
    const state = this.layerCreationState;
    if (!state.pinPosition) {
        alert('Please place a pin first');
        return;
    }
    
    // Compute the basis state at the pin position (flip Y to match shader coordinate system)
    const basisState = this.stack.computeState(state.pinPosition.nx, 1 - state.pinPosition.ny);
    const sampledPoint = new SampledPoint(basisState);
    
    // Create layer with custom dimensions, ranges, and delta mode
    const newLayer = new TransformLayer(state.xDim, state.yDim, 
        state.xMin, state.xMax, state.yMin, state.yMax, state.deltaMode);
    
    // Add to stack
    this.stack.items.push(sampledPoint);
    this.stack.items.push(newLayer);
    
    this.selectedIndex = this.stack.items.length - 1;
    
    // Reset creation state
    this.cancelLayerCreation();
    
    // Update UI and regenerate map
    this.updateStackUI();
    this.generateMap();
};

ChaosMapRenderer.prototype.cancelLayerCreation = function() {
    this.layerCreationState = {
        active: false,
        xDim: 'theta1',
        yDim: 'theta2',
        xMin: -3.14,
        xMax: 3.14,
        yMin: -3.14,
        yMax: 3.14,
        deltaMode: false,
        pinPosition: null,
        isPlacingPin: false
    };
    
    // Reset UI
    document.getElementById('xDimSelect').value = 'theta1';
    document.getElementById('yDimSelect').value = 'theta2';
    const deltaModeCheckbox = document.getElementById('deltaModeCheckbox');
    if (deltaModeCheckbox) deltaModeCheckbox.checked = false;
    this.updateDefaultRanges();
    
    const placePinBtn = document.getElementById('placePinBtn');
    if (placePinBtn) {
        placePinBtn.textContent = '📍 Place Pin';
        placePinBtn.style.background = '';
        placePinBtn.style.borderColor = '';
        placePinBtn.style.color = '';
    }
    
    document.getElementById('pinStatus').style.display = 'none';
    document.getElementById('previewPanel').style.display = 'none';
    
    this.canvas.style.cursor = 'default';
};

// Parameter and config methods
ChaosMapRenderer.prototype.updateBaseParams = function() {
    this.baseParams.g = 9.81;
    this.baseParams.dt = parseFloat(document.getElementById('dtInput').value) || 0.01;
    this.baseParams.maxIter = parseInt(document.getElementById('maxIterInput').value) || 5000;
    this.baseParams.threshold = parseFloat(document.getElementById('thresholdInput').value) || 0.5;
    this.baseParams.perturbMode = document.getElementById('perturbModeSelect').value || 'fixed';
    this.baseParams.integrator = document.getElementById('integratorSelect').value || 'rk4';
    this.updatePerturbConfigFromUI();
};

ChaosMapRenderer.prototype.updatePerturbConfigUI = function() {
    const panel = document.getElementById('perturbConfigPanel');
    if (!panel) return;
    
    const mode = this.baseParams.perturbMode;
    const scale = this.baseParams.perturbScale;
    const dims = [
        { key: 'theta1', label: 'θ₁', unit: 'rad' },
        { key: 'theta2', label: 'θ₂', unit: 'rad' },
        { key: 'omega1', label: 'ω₁', unit: 'rad/s' },
        { key: 'omega2', label: 'ω₂', unit: 'rad/s' },
        { key: 'l1', label: 'L₁', unit: 'm' },
        { key: 'l2', label: 'L₂', unit: 'm' },
        { key: 'm1', label: 'm₁', unit: 'kg' },
        { key: 'm2', label: 'm₂', unit: 'kg' }
    ];
    
    let html = '';
    
    // Master scalar control
    html += '<div style="margin-bottom: 0.8rem; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.1);">';
    html += '<div style="font-size: 0.75rem; color: #aaa; margin-bottom: 0.3rem;">Scale All</div>';
    html += '<div style="display: flex; align-items: center; gap: 0.5rem;">';
    html += '<input type="range" id="perturbScaleSlider" min="0" max="10" step="0.1" value="' + scale + '" style="flex: 1;">';
    html += '<input type="number" id="perturbScaleInput" value="' + scale + '" step="0.1" style="width: 60px; padding: 0.2rem; font-size: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; color: #fff;">';
    html += '</div></div>';
    
    if (mode === 'random') {
        // Random mode: center + std dev for each dimension
        html += '<div style="font-size: 0.7rem; color: #888; margin-bottom: 0.5rem;">Random Gaussian (center ± std dev):</div>';
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem;">';
        dims.forEach(dim => {
            const cfg = this.baseParams.perturbRandom[dim.key];
            html += `
                <div style="background: rgba(0,0,0,0.2); padding: 0.4rem; border-radius: 4px;">
                    <div style="font-size: 0.7rem; color: #aaa; margin-bottom: 0.2rem;">${dim.label}</div>
                    <div style="display: flex; gap: 0.3rem; align-items: center;">
                        <input type="number" id="perturbCenter_${dim.key}" value="${cfg.center}" step="0.00001" 
                            style="width: 100%; padding: 0.2rem; font-size: 0.7rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; color: #fff;" title="Center">
                        <span style="color: #666; font-size: 0.7rem;">±</span>
                        <input type="number" id="perturbStd_${dim.key}" value="${cfg.std}" step="0.00001" 
                            style="width: 100%; padding: 0.2rem; font-size: 0.7rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; color: #fff;" title="Std Dev">
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } else {
        // Fixed mode: direct offsets
        html += '<div style="font-size: 0.7rem; color: #888; margin-bottom: 0.5rem;">Fixed offsets:</div>';
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.3rem;">';
        dims.forEach(dim => {
            const val = this.baseParams.perturbFixed[dim.key];
            html += `
                <div style="background: rgba(0,0,0,0.2); padding: 0.4rem; border-radius: 4px;">
                    <div style="font-size: 0.7rem; color: #aaa; margin-bottom: 0.2rem;">${dim.label}</div>
                    <input type="number" id="perturbFixed_${dim.key}" value="${val}" step="0.00001" 
                        style="width: 100%; padding: 0.2rem; font-size: 0.7rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 3px; color: #fff;">
                </div>
            `;
        });
        html += '</div>';
    }
    
    panel.innerHTML = html;
    
    // Add change listeners
    dims.forEach(dim => {
        if (mode === 'random') {
            const centerInput = document.getElementById(`perturbCenter_${dim.key}`);
            const stdInput = document.getElementById(`perturbStd_${dim.key}`);
            if (centerInput) centerInput.addEventListener('change', () => this.updatePerturbConfigFromUI());
            if (stdInput) stdInput.addEventListener('change', () => this.updatePerturbConfigFromUI());
        } else {
            const fixedInput = document.getElementById(`perturbFixed_${dim.key}`);
            if (fixedInput) fixedInput.addEventListener('change', () => this.updatePerturbConfigFromUI());
        }
    });
    
    // Master scalar listeners
    const scaleSlider = document.getElementById('perturbScaleSlider');
    const scaleInput = document.getElementById('perturbScaleInput');
    if (scaleSlider) {
        scaleSlider.addEventListener('input', () => {
            this.baseParams.perturbScale = parseFloat(scaleSlider.value) || 1.0;
            if (scaleInput) scaleInput.value = this.baseParams.perturbScale;
        });
    }
    if (scaleInput) {
        scaleInput.addEventListener('change', () => {
            this.baseParams.perturbScale = parseFloat(scaleInput.value) || 1.0;
            if (scaleSlider) scaleSlider.value = this.baseParams.perturbScale;
        });
    }
};

ChaosMapRenderer.prototype.updatePerturbConfigFromUI = function() {
    const mode = this.baseParams.perturbMode;
    const dims = ['theta1', 'theta2', 'omega1', 'omega2', 'l1', 'l2', 'm1', 'm2'];
    
    if (mode === 'random') {
        dims.forEach(dim => {
            const centerInput = document.getElementById(`perturbCenter_${dim}`);
            const stdInput = document.getElementById(`perturbStd_${dim}`);
            if (centerInput) this.baseParams.perturbRandom[dim].center = parseFloat(centerInput.value) || 0;
            if (stdInput) this.baseParams.perturbRandom[dim].std = parseFloat(stdInput.value) || 0;
        });
    } else {
        dims.forEach(dim => {
            const fixedInput = document.getElementById(`perturbFixed_${dim}`);
            if (fixedInput) this.baseParams.perturbFixed[dim] = parseFloat(fixedInput.value) || 0;
        });
    }
};

// Simple hash function for deterministic randomness
function hash32(x) {
    let h = x >>> 0;
    h = ((h >>> 16) ^ h) * 0x45d9f3b;
    h = ((h >>> 16) ^ h) * 0x45d9f3b;
    h = (h >>> 16) ^ h;
    return h >>> 0;
}

// Hash 2D coordinates to a seed
function hash2D(x, y, seed = 0) {
    let h = seed >>> 0;
    h = hash32(h + x);
    h = hash32(h + y);
    return h;
}

// LCG random number generator with a given seed
function seededRandom(seed) {
    let s = seed >>> 0;
    return function() {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

ChaosMapRenderer.prototype.computePerturbedState = function(baseState, normX, normY) {
    const mode = this.baseParams.perturbMode;
    
    // Determine if we should use deterministic (seeded) random
    const useSeeded = (normX !== undefined && normY !== undefined);
    const res = this.baseParams.resolution;
    
    // Generate pixel coordinates for seeding (matches GPU fragCoord)
    let rand;
    if (useSeeded) {
        const pixelX = Math.floor(normX * res);
        const pixelY = Math.floor(normY * res);
        const seed = hash2D(pixelX, pixelY);
        rand = seededRandom(seed);
    } else {
        rand = Math.random;
    }
    
    // Box-Muller for normal distribution
    const randn = () => {
        const u1 = rand();
        const u2 = rand();
        const r = Math.sqrt(-2 * Math.log(u1 + 0.0001));
        const theta = 2 * Math.PI * u2;
        return r * Math.cos(theta);
    };
    
    if (mode === 'random') {
        // Random mode: sample from Gaussian around baseState + center offset
        // This matches the chaos map shader: s2 = s1 + (center + random * std) * scale
        const pr = this.baseParams.perturbRandom;
        const s = this.baseParams.perturbScale;
        return {
            theta1: baseState.theta1 + (pr.theta1.center + randn() * pr.theta1.std) * s,
            theta2: baseState.theta2 + (pr.theta2.center + randn() * pr.theta2.std) * s,
            omega1: baseState.omega1 + (pr.omega1.center + randn() * pr.omega1.std) * s,
            omega2: baseState.omega2 + (pr.omega2.center + randn() * pr.omega2.std) * s,
            l1: Math.max(0.1, baseState.l1 + (pr.l1.center + randn() * pr.l1.std) * s),
            l2: Math.max(0.1, baseState.l2 + (pr.l2.center + randn() * pr.l2.std) * s),
            m1: Math.max(0.1, baseState.m1 + (pr.m1.center + randn() * pr.m1.std) * s),
            m2: Math.max(0.1, baseState.m2 + (pr.m2.center + randn() * pr.m2.std) * s)
        };
    } else {
        // Fixed mode: add fixed offsets scaled by master scalar
        const pf = this.baseParams.perturbFixed;
        const s = this.baseParams.perturbScale;
        return {
            theta1: baseState.theta1 + pf.theta1 * s,
            theta2: baseState.theta2 + pf.theta2 * s,
            omega1: baseState.omega1 + pf.omega1 * s,
            omega2: baseState.omega2 + pf.omega2 * s,
            l1: Math.max(0.1, baseState.l1 + pf.l1 * s),
            l2: Math.max(0.1, baseState.l2 + pf.l2 * s),
            m1: Math.max(0.1, baseState.m1 + pf.m1 * s),
            m2: Math.max(0.1, baseState.m2 + pf.m2 * s)
        };
    }
};

ChaosMapRenderer.prototype.resizeCanvas = function() {
    const container = document.getElementById('mapContainer');
    if (container) {
        this.canvas.width = this.baseParams.resolution;
        this.canvas.height = this.baseParams.resolution;
    }
};

ChaosMapRenderer.prototype.updateLegend = function() {
    const gradient = document.getElementById('legendGradient');
    const fastLabel = document.getElementById('legendFast');
    const slowLabel = document.getElementById('legendSlow');
    
    const palettes = {
        0: { gradient: 'linear-gradient(90deg, hsl(0, 80%, 50%), hsl(60, 80%, 50%), hsl(120, 80%, 50%), hsl(180, 80%, 50%), hsl(240, 80%, 50%), hsl(300, 80%, 50%))', fast: 'Fast', slow: 'Slow' },
        1: { gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(255,0,0), rgb(255,255,0), rgb(255,255,255))', fast: 'Fast', slow: 'Slow' },
        2: { gradient: 'linear-gradient(90deg, hsl(240, 80%, 50%), hsl(180, 80%, 50%), hsl(120, 80%, 50%), hsl(60, 80%, 50%))', fast: 'Fast', slow: 'Slow' },
        3: { gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(255,0,0), rgb(255,255,0))', fast: 'Fast', slow: 'Slow' },
        4: { gradient: 'linear-gradient(90deg, rgb(255,255,255), rgb(0,0,0))', fast: 'Fast', slow: 'Slow' },
        5: { gradient: 'linear-gradient(90deg, rgb(128,0,128), rgb(0,128,255), rgb(0,255,128), rgb(255,255,0))', fast: 'Fast', slow: 'Slow' },
        6: { gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(128,0,128), rgb(255,0,128), rgb(255,255,0))', fast: 'Fast', slow: 'Slow' },
        7: { gradient: 'linear-gradient(90deg, hsl(300, 80%, 50%), hsl(240, 80%, 50%), hsl(180, 80%, 50%), hsl(120, 80%, 50%), hsl(60, 80%, 50%), hsl(0, 80%, 50%))', fast: 'Fast', slow: 'Slow' }
    };
    
    const p = palettes[this.hueMapping] || palettes[0];
    if (gradient) gradient.style.background = p.gradient;
};
