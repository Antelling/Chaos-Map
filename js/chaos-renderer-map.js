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
    
    // Compute state through stack (flip Y to match shader coordinate system)
    const state = this.stack.computeState(nx, 1 - ny);
    
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
    // Render if we're in layer creation mode or placing a pin
    const state = this.layerCreationState;
    if (!state.active && !state.isPlacingPin && !state.pinPosition) return;
    
    const gl = this.previewGl;
    const program = this.previewProgram;
    const width = 256;
    const height = 256;
    
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    
    const xDim = state.xDim;
    const yDim = state.yDim;
    
    // Compute the basis state at this position (for fixed values)
    // Flip Y to match shader coordinate system
    const basisState = this.stack.computeState(nx, 1 - ny);
    
    // Determine mode and fixed state based on which dimensions are being mapped
    // fixedState always contains the FULL basis state - the shader uses it as base values
    // Index 0=theta1, 1=theta2, 2=omega1, 3=omega2
    let mode = 0;
    let fixedState = [basisState.theta1, basisState.theta2, basisState.omega1, basisState.omega2];
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
    
    // Determine mode - this affects the shader's logic but fixedState always has full basis
    if (xIsTheta || yIsTheta) {
        mode = 0; // Position mode
    } else if (xIsOmega || yIsOmega) {
        mode = 1; // Velocity mode
    } else if (xIsL || yIsL) {
        mode = 2; // Length mode
        if (xDim === 'l1' || yDim === 'l1') outL1 = basisState.l1;
        if (xDim === 'l2' || yDim === 'l2') outL2 = basisState.l2;
    } else if (xIsM || yIsM) {
        mode = 3; // Mass mode
        if (xDim === 'm1' || yDim === 'm1') outM1 = basisState.m1;
        if (xDim === 'm2' || yDim === 'm2') outM2 = basisState.m2;
    }
    
    // Calculate scale and center from ranges
    const scaleX = (state.xMax - state.xMin) / 2;
    const scaleY = (state.yMax - state.yMin) / 2;
    const centerX = (state.xMin + state.xMax) / 2;
    const centerY = (state.yMin + state.yMax) / 2;
    
    // Helper to safely set uniforms
    const setUniform = (name, setter, ...values) => {
        const loc = gl.getUniformLocation(program, name);
        if (loc !== null) {
            setter.call(gl, loc, ...values);
        }
    };
    
    // Set uniforms
    setUniform('u_resolution', gl.uniform2f, width, height);
    setUniform('u_tileOffset', gl.uniform2f, 0, 0);
    setUniform('u_tileSize', gl.uniform2f, width, height);
    setUniform('u_l1', gl.uniform1f, outL1 ?? 1.0);
    setUniform('u_l2', gl.uniform1f, outL2 ?? 1.0);
    setUniform('u_m1', gl.uniform1f, outM1 ?? 1.0);
    setUniform('u_m2', gl.uniform1f, outM2 ?? 1.0);
    setUniform('u_g', gl.uniform1f, this.baseParams.g);
    setUniform('u_dt', gl.uniform1f, this.baseParams.dt);
    setUniform('u_maxIter', gl.uniform1i, this.baseParams.maxIter);
    setUniform('u_threshold', gl.uniform1f, this.baseParams.threshold);
    
    // Perturbation uniforms - scaled by master scalar
    const pFixed = this.baseParams.perturbFixed;
    const pRand = this.baseParams.perturbRandom;
    const s = this.baseParams.perturbScale;
    setUniform('u_perturbFixedAB', gl.uniform4f, 
        pFixed.theta1 * s, pFixed.theta2 * s, pFixed.omega1 * s, pFixed.omega2 * s);
    setUniform('u_perturbFixedCD', gl.uniform4f, 
        pFixed.l1 * s, pFixed.l2 * s, pFixed.m1 * s, pFixed.m2 * s);
    setUniform('u_perturbCenterAB', gl.uniform4f, 
        pRand.theta1.center * s, pRand.theta2.center * s, pRand.omega1.center * s, pRand.omega2.center * s);
    setUniform('u_perturbCenterCD', gl.uniform4f, 
        pRand.l1.center * s, pRand.l2.center * s, pRand.m1.center * s, pRand.m2.center * s);
    setUniform('u_perturbStdAB', gl.uniform4f, 
        pRand.theta1.std * s, pRand.theta2.std * s, pRand.omega1.std * s, pRand.omega2.std * s);
    setUniform('u_perturbStdCD', gl.uniform4f, 
        pRand.l1.std * s, pRand.l2.std * s, pRand.m1.std * s, pRand.m2.std * s);
    setUniform('u_perturbMode', gl.uniform1i, this.baseParams.perturbMode === 'random' ? 1 : 0);
    setUniform('u_integrator', gl.uniform1i, this.baseParams.integrator === 'verlet' ? 1 : 0);
    setUniform('u_seed', gl.uniform1f, 0);
    setUniform('u_colorMapping', gl.uniform1i, this.colorMapping);
    setUniform('u_cyclePeriod', gl.uniform1f, this.cyclePeriod);
    setUniform('u_hueMapping', gl.uniform1i, this.hueMapping);
    
    // Generate and bind per-render noise texture for truly independent random perturbations
    // Preview is always 256x256
    const noiseTex = this.updateNoiseTexture(gl, width, height);
    if (noiseTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, noiseTex);
        setUniform('u_noiseTexture', gl.uniform1i, 0);
    }
    
    // Layer-based uniforms
    setUniform('u_layerMode', gl.uniform1i, mode);
    setUniform('u_fixedState', gl.uniform4f, 
        fixedState[0] ?? 0, fixedState[1] ?? 0, fixedState[2] ?? 0, fixedState[3] ?? 0);
    setUniform('u_scaleX', gl.uniform1f, scaleX);
    setUniform('u_scaleY', gl.uniform1f, scaleY);
    setUniform('u_centerX', gl.uniform1f, centerX);
    setUniform('u_centerY', gl.uniform1f, centerY);
    
    // Which dimensions are being mapped
    const dimToIndex = { theta1: 0, theta2: 1, omega1: 2, omega2: 3, l1: 4, l2: 5, m1: 6, m2: 7 };
    setUniform('u_mappedDims', gl.uniform2i, dimToIndex[xDim] ?? 0, dimToIndex[yDim] ?? 1);
    
    // Delta mode: add to basis state instead of replacing
    setUniform('u_deltaMode', gl.uniform1i, state.deltaMode ? 1 : 0);
    
    // Ensure vertex buffer is bound and attribute is enabled before drawing
    if (this.previewPositionBuffer) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.previewPositionBuffer);
    }
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    
    // Update preview info text
    const previewInfo = document.getElementById('previewInfo');
    if (previewInfo) {
        const xDimInfo = DIM_INFO[xDim];
        const yDimInfo = DIM_INFO[yDim];
        const deltaBadge = state.deltaMode ? '<span style="color: #fc8;"> [Δ mode]</span>' : '';
        previewInfo.innerHTML = `
            <span>Pin at (${nx.toFixed(2)}, ${ny.toFixed(2)})</span>
            <span style="color: #8af;">${xDimInfo.label}: [${state.xMin.toFixed(1)}, ${state.xMax.toFixed(1)}] ${yDimInfo.label}: [${state.yMin.toFixed(1)}, ${state.yMax.toFixed(1)}]${deltaBadge}</span>
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
    
    // If in layer creation mode (placing pin or already placed), trigger preview debounce
    if (this.layerCreationState.active) {
        this.schedulePreviewRender(nx, ny);
    }
    
    // Compute state through stack (flip Y to match shader coordinate system)
    const state = this.stack.computeState(nx, 1 - ny);
    
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
    
    // Stop hover simulation when mouse leaves
    this.stopHoverSimulation();
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
