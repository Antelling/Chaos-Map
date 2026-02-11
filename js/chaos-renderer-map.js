// Double Pendulum Chaos Map - Map Interaction Methods (Part 4)
// These methods extend ChaosMapRenderer

// Map interaction handlers
ChaosMapRenderer.prototype.getMapCoordinates = function(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const nx = Math.max(0, Math.min(1, x / this.canvas.width));
    // Y axis: WebGL has y=0 at bottom, but we want ny=0 at bottom too for consistency
    // The shader flips y for rendering, so we keep ny as is (0 at top, 1 at bottom of screen)
    const ny = Math.max(0, Math.min(1, y / this.canvas.height));
    return { nx, ny };
};

ChaosMapRenderer.prototype.handleMapHover = function(e) {
    const { nx, ny } = this.getMapCoordinates(e);
    this.hoverPosition = { nx, ny };
    
    // If in pin placement mode, update preview following mouse
    if (this.layerCreationState.isPlacingPin) {
        this.schedulePreviewRender(nx, ny);
    }
    
    // Compute state through stack
    const state = this.stack.computeState(nx, ny);
    
    // Update hover info
    this.updateHoverInfo(state);
    
    // Always show hover preview in the preview pane
    this.updateHoverPreview(nx, ny);
};

ChaosMapRenderer.prototype.schedulePreviewRender = function(nx, ny) {
    // Clear existing timer
    if (this.previewDebounceTimer) {
        clearTimeout(this.previewDebounceTimer);
    }
    
    // Schedule new render after 100ms
    this.previewDebounceTimer = setTimeout(() => {
        this.renderPreview(nx, ny);
    }, 100);
};

ChaosMapRenderer.prototype.renderPreview = function(nx, ny) {
    if (!this.previewGl || !this.previewProgram) return;
    if (!this.layerCreationState.active && !this.layerCreationState.isPlacingPin) return;
    
    const gl = this.previewGl;
    const program = this.previewProgram;
    const width = 256;
    const height = 256;
    
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    
    const state = this.layerCreationState;
    const xDim = state.xDim;
    const yDim = state.yDim;
    
    // Compute the basis state at this position (for fixed values)
    const basisState = this.stack.computeState(nx, ny);
    
    // Determine mode and fixed state based on which dimensions are being mapped
    let mode = 0;
    let fixedState = [0, 0, 0, 0];
    let outL1 = basisState.l1;
    let outL2 = basisState.l2;
    let outM1 = basisState.m1;
    let outM2 = basisState.m2;
    
    // Check which dimensions are being mapped
    const xIsTheta = xDim === 'theta1' || xDim === 'theta2';
    const xIsOmega = xDim === 'omega1' || xDim === 'omega2';
    const xIsL = xDim === 'l1' || xDim === 'l2';
    const xIsM = xDim === 'm1' || xDim === 'm2';
    
    const yIsTheta = yDim === 'theta1' || yDim === 'theta2';
    const yIsOmega = yDim === 'omega1' || yDim === 'omega2';
    const yIsL = yDim === 'l1' || yDim === 'l2';
    const yIsM = yDim === 'm1' || yDim === 'm2';
    
    // Determine mode
    if (xIsTheta || yIsTheta) {
        mode = 0; // Position mode
        fixedState[0] = (xDim === 'theta1') ? basisState.theta1 : (yDim === 'theta1') ? basisState.theta1 : 0;
        fixedState[1] = (xDim === 'theta2') ? basisState.theta2 : (yDim === 'theta2') ? basisState.theta2 : 0;
    } else if (xIsOmega || yIsOmega) {
        mode = 1; // Velocity mode
        fixedState[0] = basisState.theta1;
        fixedState[1] = basisState.theta2;
        fixedState[2] = (xDim === 'omega1') ? basisState.omega1 : (yDim === 'omega1') ? basisState.omega1 : basisState.omega1;
        fixedState[3] = (xDim === 'omega2') ? basisState.omega2 : (yDim === 'omega2') ? basisState.omega2 : basisState.omega2;
    } else if (xIsL || yIsL) {
        mode = 2; // Length mode
        fixedState[0] = basisState.theta1;
        fixedState[1] = basisState.theta2;
        fixedState[2] = basisState.omega1;
        fixedState[3] = basisState.omega2;
        if (xDim === 'l1' || yDim === 'l1') outL1 = basisState.l1;
        if (xDim === 'l2' || yDim === 'l2') outL2 = basisState.l2;
    } else if (xIsM || yIsM) {
        mode = 3; // Mass mode
        fixedState[0] = basisState.theta1;
        fixedState[1] = basisState.theta2;
        fixedState[2] = basisState.omega1;
        fixedState[3] = basisState.omega2;
        if (xDim === 'm1' || yDim === 'm1') outM1 = basisState.m1;
        if (xDim === 'm2' || yDim === 'm2') outM2 = basisState.m2;
    }
    
    // Calculate scale and center from ranges
    const scaleX = (state.xMax - state.xMin) / 2;
    const scaleY = (state.yMax - state.yMin) / 2;
    const centerX = (state.xMin + state.xMax) / 2;
    const centerY = (state.yMin + state.yMax) / 2;
    
    // Set uniforms
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), width, height);
    gl.uniform2f(gl.getUniformLocation(program, 'u_tileOffset'), 0, 0);
    gl.uniform2f(gl.getUniformLocation(program, 'u_tileSize'), width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_l1'), outL1);
    gl.uniform1f(gl.getUniformLocation(program, 'u_l2'), outL2);
    gl.uniform1f(gl.getUniformLocation(program, 'u_m1'), outM1);
    gl.uniform1f(gl.getUniformLocation(program, 'u_m2'), outM2);
    gl.uniform1f(gl.getUniformLocation(program, 'u_g'), this.baseParams.g);
    gl.uniform1f(gl.getUniformLocation(program, 'u_dt'), this.baseParams.dt);
    gl.uniform1i(gl.getUniformLocation(program, 'u_maxIter'), this.baseParams.maxIter);
    gl.uniform1f(gl.getUniformLocation(program, 'u_threshold'), this.baseParams.threshold);
    // Perturbation uniforms
    const pFixed = this.baseParams.perturbFixed;
    const pRand = this.baseParams.perturbRandom;
    gl.uniform4f(gl.getUniformLocation(program, 'u_perturbFixedAB'), 
        pFixed.theta1, pFixed.theta2, pFixed.omega1, pFixed.omega2);
    gl.uniform4f(gl.getUniformLocation(program, 'u_perturbFixedCD'), 
        pFixed.l1, pFixed.l2, pFixed.m1, pFixed.m2);
    gl.uniform4f(gl.getUniformLocation(program, 'u_perturbCenterAB'), 
        pRand.theta1.center, pRand.theta2.center, pRand.omega1.center, pRand.omega2.center);
    gl.uniform4f(gl.getUniformLocation(program, 'u_perturbCenterCD'), 
        pRand.l1.center, pRand.l2.center, pRand.m1.center, pRand.m2.center);
    gl.uniform4f(gl.getUniformLocation(program, 'u_perturbStdAB'), 
        pRand.theta1.std, pRand.theta2.std, pRand.omega1.std, pRand.omega2.std);
    gl.uniform4f(gl.getUniformLocation(program, 'u_perturbStdCD'), 
        pRand.l1.std, pRand.l2.std, pRand.m1.std, pRand.m2.std);
    gl.uniform1i(gl.getUniformLocation(program, 'u_perturbMode'), this.baseParams.perturbMode === 'random' ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_integrator'), this.baseParams.integrator === 'verlet' ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(program, 'u_seed'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_colorMapping'), this.colorMapping);
    gl.uniform1f(gl.getUniformLocation(program, 'u_cyclePeriod'), this.cyclePeriod);
    gl.uniform1i(gl.getUniformLocation(program, 'u_hueMapping'), this.hueMapping);
    
    // Generate and bind per-render noise texture for truly independent random perturbations
    // Preview is always 256x256
    const noiseTex = this.updateNoiseTexture(gl, width, height);
    if (noiseTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, noiseTex);
        gl.uniform1i(gl.getUniformLocation(program, 'u_noiseTexture'), 0);
    }
    
    // Layer-based uniforms
    gl.uniform1i(gl.getUniformLocation(program, 'u_layerMode'), mode);
    gl.uniform4f(gl.getUniformLocation(program, 'u_fixedState'), 
        fixedState[0], fixedState[1], fixedState[2], fixedState[3]);
    gl.uniform1f(gl.getUniformLocation(program, 'u_scaleX'), scaleX);
    gl.uniform1f(gl.getUniformLocation(program, 'u_scaleY'), scaleY);
    gl.uniform1f(gl.getUniformLocation(program, 'u_centerX'), centerX);
    gl.uniform1f(gl.getUniformLocation(program, 'u_centerY'), centerY);
    
    // Which dimensions are being mapped
    const dimToIndex = { theta1: 0, theta2: 1, omega1: 2, omega2: 3, l1: 4, l2: 5, m1: 6, m2: 7 };
    gl.uniform2i(gl.getUniformLocation(program, 'u_mappedDims'), dimToIndex[xDim], dimToIndex[yDim]);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    // Update preview info text
    const previewInfo = document.getElementById('previewInfo');
    if (previewInfo) {
        const xDimInfo = DIM_INFO[xDim];
        const yDimInfo = DIM_INFO[yDim];
        previewInfo.innerHTML = `
            <span>Pin at (${nx.toFixed(2)}, ${ny.toFixed(2)})</span>
            <span style="color: #8af;">${xDimInfo.label}: [${state.xMin.toFixed(1)}, ${state.xMax.toFixed(1)}] ${yDimInfo.label}: [${state.yMin.toFixed(1)}, ${state.yMax.toFixed(1)}]</span>
        `;
    }
};

ChaosMapRenderer.prototype.handleMapLeave = function() {
    this.hoverPosition = null;
    const info = document.getElementById('hoverInfo');
    if (info) info.innerHTML = 'Hover over map to see pendulum state';
    
    // Clear the hover debounce timer
    if (this.hoverDebounceTimer) {
        clearTimeout(this.hoverDebounceTimer);
        this.hoverDebounceTimer = null;
    }
    this.hoverDebouncedPosition = null;
};

ChaosMapRenderer.prototype.handleMapClick = function(e) {
    // Ignore clicks that were part of a drag operation
    if (this.zoomState.isDragging && this.zoomState.dragStart && this.zoomState.dragCurrent) {
        const dx = this.zoomState.dragCurrent.x - this.zoomState.dragStart.x;
        const dy = this.zoomState.dragCurrent.y - this.zoomState.dragStart.y;
        const dragDistance = Math.sqrt(dx * dx + dy * dy);
        if (dragDistance > 5) {
            // This was a drag, not a click
            return;
        }
    }
    
    const { nx, ny } = this.getMapCoordinates(e);
    
    // If placing pin for layer creation
    if (this.layerCreationState.isPlacingPin) {
        this.placePin(nx, ny);
        return;
    }
    
    // If in pin mode for simulations, create a pinned simulation
    if (this.pinMode) {
        this.createPinnedSimulation(nx, ny);
        this.togglePinMode(false); // Exit pin mode after placing
        return;
    }
};

// Zoom/Pan handling - independent of layer transformation stack
ChaosMapRenderer.prototype.handleMapMouseDown = function(e) {
    // Only left mouse button for zoom rectangle
    if (e.button !== 0) return;
    
    // Don't start zoom drag if placing pin
    if (this.layerCreationState.isPlacingPin) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    
    this.zoomState.isDragging = true;
    this.zoomState.dragStart = { x, y };
    this.zoomState.dragCurrent = { x, y };
    
    this.createZoomOverlay();
};

ChaosMapRenderer.prototype.handleMapMouseMove = function(e) {
    const { nx, ny } = this.getMapCoordinates(e);
    this.hoverPosition = { nx, ny };
    
    // Handle zoom rectangle dragging
    if (this.zoomState.isDragging) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        this.zoomState.dragCurrent = { x, y };
        this.updateZoomOverlay();
        return;
    }
    
    // If in pin placement mode, trigger preview debounce
    if (this.layerCreationState.isPlacingPin) {
        this.schedulePreviewRender(nx, ny);
    }
    
    // Compute state through stack
    const state = this.stack.computeState(nx, ny);
    
    // Update hover info
    this.updateHoverInfo(state);
    
    // Always show hover preview in the preview pane
    this.updateHoverPreview(nx, ny);
};

ChaosMapRenderer.prototype.handleMapMouseUp = function(e) {
    if (!this.zoomState.isDragging) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    this.zoomState.dragCurrent = { x, y };
    
    // Check if this was a real drag (not just a click)
    const dx = this.zoomState.dragCurrent.x - this.zoomState.dragStart.x;
    const dy = this.zoomState.dragCurrent.y - this.zoomState.dragStart.y;
    const dragDistance = Math.sqrt(dx * dx + dy * dy);
    
    if (dragDistance > 5) {
        // Apply zoom to the current layer
        this.applyZoomRectangle();
    }
    
    this.zoomState.isDragging = false;
    this.zoomState.dragStart = null;
    this.zoomState.dragCurrent = null;
    this.removeZoomOverlay();
};

ChaosMapRenderer.prototype.handleMapMouseLeave = function() {
    this.hoverPosition = null;
    
    if (this.zoomState.isDragging) {
        // Cancel the zoom operation
        this.zoomState.isDragging = false;
        this.zoomState.dragStart = null;
        this.zoomState.dragCurrent = null;
        this.removeZoomOverlay();
    }
    
    const info = document.getElementById('hoverInfo');
    if (info) info.innerHTML = 'Hover over map to see pendulum state';
};

ChaosMapRenderer.prototype.createZoomOverlay = function() {
    // Remove existing overlay if any
    this.removeZoomOverlay();
    
    // Create overlay canvas for zoom rectangle
    const container = document.getElementById('mapContainer');
    if (!container) return;
    
    this.zoomOverlay = document.createElement('div');
    this.zoomOverlay.id = 'zoomOverlay';
    this.zoomOverlay.style.position = 'absolute';
    this.zoomOverlay.style.top = '0';
    this.zoomOverlay.style.left = '0';
    this.zoomOverlay.style.width = '100%';
    this.zoomOverlay.style.height = '100%';
    this.zoomOverlay.style.pointerEvents = 'none';
    this.zoomOverlay.style.zIndex = '20';
    this.zoomOverlay.style.border = '2px dashed rgba(100, 200, 255, 0.8)';
    this.zoomOverlay.style.background = 'rgba(100, 200, 255, 0.1)';
    this.zoomOverlay.style.display = 'none';
    
    container.appendChild(this.zoomOverlay);
};

ChaosMapRenderer.prototype.updateZoomOverlay = function() {
    if (!this.zoomOverlay || !this.zoomState.dragStart || !this.zoomState.dragCurrent) return;
    
    const container = document.getElementById('mapContainer');
    const rect = this.canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    
    // Calculate rectangle in CSS pixels relative to container
    const scaleX = containerRect.width / this.canvas.width;
    const scaleY = containerRect.height / this.canvas.height;
    
    const x1 = Math.min(this.zoomState.dragStart.x, this.zoomState.dragCurrent.x) * scaleX;
    const y1 = Math.min(this.zoomState.dragStart.y, this.zoomState.dragCurrent.y) * scaleY;
    const x2 = Math.max(this.zoomState.dragStart.x, this.zoomState.dragCurrent.x) * scaleX;
    const y2 = Math.max(this.zoomState.dragStart.y, this.zoomState.dragCurrent.y) * scaleY;
    
    const width = x2 - x1;
    const height = y2 - y1;
    
    this.zoomOverlay.style.display = 'block';
    this.zoomOverlay.style.left = x1 + 'px';
    this.zoomOverlay.style.top = y1 + 'px';
    this.zoomOverlay.style.width = width + 'px';
    this.zoomOverlay.style.height = height + 'px';
};

ChaosMapRenderer.prototype.removeZoomOverlay = function() {
    if (this.zoomOverlay) {
        this.zoomOverlay.remove();
        this.zoomOverlay = null;
    }
};

ChaosMapRenderer.prototype.applyZoomRectangle = function() {
    const layer = this.stack.getLastLayer();
    if (!layer) return;
    
    // Get drag rectangle in normalized coordinates [0, 1]
    const nx1 = Math.max(0, Math.min(1, Math.min(this.zoomState.dragStart.x, this.zoomState.dragCurrent.x) / this.canvas.width));
    const nx2 = Math.max(0, Math.min(1, Math.max(this.zoomState.dragStart.x, this.zoomState.dragCurrent.x) / this.canvas.width));
    const ny1 = Math.max(0, Math.min(1, Math.min(this.zoomState.dragStart.y, this.zoomState.dragCurrent.y) / this.canvas.height));
    const ny2 = Math.max(0, Math.min(1, Math.max(this.zoomState.dragStart.y, this.zoomState.dragCurrent.y) / this.canvas.height));
    
    // Calculate data values at the rectangle corners
    const dataX1 = layer.min1 + nx1 * (layer.max1 - layer.min1);
    const dataX2 = layer.min1 + nx2 * (layer.max1 - layer.min1);
    const dataY1 = layer.min2 + ny1 * (layer.max2 - layer.min2);
    const dataY2 = layer.min2 + ny2 * (layer.max2 - layer.min2);
    
    // Save current view to history for zoom out
    this.zoomState.zoomHistory.push({
        min1: layer.min1,
        max1: layer.max1,
        min2: layer.min2,
        max2: layer.max2
    });
    
    // Apply new bounds
    layer.min1 = Math.min(dataX1, dataX2);
    layer.max1 = Math.max(dataX1, dataX2);
    layer.min2 = Math.min(dataY1, dataY2);
    layer.max2 = Math.max(dataY1, dataY2);
    
    // Update UI and regenerate
    this.updateStackUI();
    this.generateMap();
};

ChaosMapRenderer.prototype.zoomOut = function() {
    const layer = this.stack.getLastLayer();
    if (!layer) return;
    
    if (this.zoomState.zoomHistory.length > 0) {
        // Restore previous view
        const prev = this.zoomState.zoomHistory.pop();
        layer.min1 = prev.min1;
        layer.max1 = prev.max1;
        layer.min2 = prev.min2;
        layer.max2 = prev.max2;
    } else {
        // Reset to default based on dimension types
        layer.min1 = DIM_DEFAULTS[layer.dim1]?.min ?? -3.14;
        layer.max1 = DIM_DEFAULTS[layer.dim1]?.max ?? 3.14;
        layer.min2 = DIM_DEFAULTS[layer.dim2]?.min ?? -3.14;
        layer.max2 = DIM_DEFAULTS[layer.dim2]?.max ?? 3.14;
    }
    
    this.updateStackUI();
    this.generateMap();
};

ChaosMapRenderer.prototype.updateHoverInfo = function(state) {
    const info = document.getElementById('hoverInfo');
    if (!info || !state) return;
    
    info.innerHTML = `
        <span>θ₁=${state.theta1.toFixed(2)}</span>
        <span>θ₂=${state.theta2.toFixed(2)}</span>
        <span>ω₁=${state.omega1.toFixed(2)}</span>
        <span>ω₂=${state.omega2.toFixed(2)}</span>
        <span>L₁=${state.l1.toFixed(2)}</span>
        <span>L₂=${state.l2.toFixed(2)}</span>
        <span>m₁=${state.m1.toFixed(2)}</span>
        <span>m₂=${state.m2.toFixed(2)}</span>
    `;
};
