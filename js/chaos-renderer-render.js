// Double Pendulum Chaos Map - Rendering and Drawing Methods (Part 6)
// These methods extend ChaosMapRenderer

// Draw pendulum in a preview pane canvas (for hover preview - no trail, just static)
ChaosMapRenderer.prototype.drawInPreviewPane = function(canvas, state1, state2) {
    if (!this.pendulumPreviewGl || !this.pendulumPreviewProgram) return;
    
    const gl = this.pendulumPreviewGl;
    const w = canvas.width || 256;
    const h = canvas.height || 256;
    
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.04, 0.04, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    gl.useProgram(this.pendulumPreviewProgram);
    
    // Set resolution uniform
    gl.uniform2f(gl.getUniformLocation(this.pendulumPreviewProgram, 'u_resolution'), w, h);
    
    // Get base state from hover position (flip Y to match shader coordinate system)
    const baseState = this.hoverPosition ? 
        this.stack.computeState(this.hoverPosition.nx, 1 - this.hoverPosition.ny) :
        this.stack.computeState(0.5, 0.5);
    
    // Calculate auto-scale
    const maxExtent = baseState.l1 + baseState.l2;
    const minDimension = Math.min(w, h);
    const targetSize = minDimension * 0.75;
    const scale = targetSize / Math.max(maxExtent, 1.0);
    
    const cx = w / 2;
    const cy = h * 0.15;
    
    // Calculate positions
    const calcPositions = (state) => {
        const x1 = cx + scale * baseState.l1 * Math.sin(state.theta1);
        const y1 = cy + scale * baseState.l1 * Math.cos(state.theta1);
        const x2 = x1 + scale * baseState.l2 * Math.sin(state.theta2);
        const y2 = y1 + scale * baseState.l2 * Math.cos(state.theta2);
        return { x1, y1, x2, y2 };
    };
    
    const pos1 = calcPositions(state1);
    
    // Draw first pendulum
    this.drawPendulumInGL(gl, this.pendulumPreviewProgram, this.pendulumPositionBuffer, cx, cy, pos1.x1, pos1.y1, pos1.x2, pos1.y2, baseState.m1, baseState.m2, [0.4, 0.9, 1.0, 1.0]);
    
    // Draw second pendulum if provided
    if (state2) {
        const pos2 = calcPositions(state2);
        this.drawPendulumInGL(gl, this.pendulumPreviewProgram, this.pendulumPositionBuffer, cx, cy, pos2.x1, pos2.y1, pos2.x2, pos2.y2, baseState.m1, baseState.m2, [1.0, 0.5, 0.2, 0.85]);
    }
};

// Draw pendulum in a WebGL context (for pinned simulations)
ChaosMapRenderer.prototype.drawInWebGLContext = function(gl, program, positionBuffer, trailBuffer, state1, state2, trail, baseState) {
    const w = gl.canvas.width || 256;
    const h = gl.canvas.height || 256;
    
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.04, 0.04, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    gl.useProgram(program);
    
    // Set resolution uniform
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), w, h);
    
    // Calculate auto-scale
    const maxExtent = baseState.l1 + baseState.l2;
    const minDimension = Math.min(w, h);
    const targetSize = minDimension * 0.75;
    const scale = targetSize / Math.max(maxExtent, 1.0);
    
    const cx = w / 2;
    const cy = h * 0.15;
    
    // Draw trail
    if (trail && trail.length > 1) {
        const trailData = [];
        const maxTrail = trail.length;
        for (let i = 0; i < maxTrail; i++) {
            const pt = trail[i];
            const alpha = i / maxTrail;
            trailData.push(cx + scale * pt.x2, cy - scale * pt.y2, alpha);
        }
        
        gl.bindBuffer(gl.ARRAY_BUFFER, trailBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trailData), gl.DYNAMIC_DRAW);
        
        const posLoc = gl.getAttribLocation(program, 'a_position');
        const alphaLoc = gl.getAttribLocation(program, 'a_alpha');
        gl.enableVertexAttribArray(posLoc);
        gl.enableVertexAttribArray(alphaLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 12, 0);
        gl.vertexAttribPointer(alphaLoc, 1, gl.FLOAT, false, 12, 8);
        
        gl.uniform4f(gl.getUniformLocation(program, 'u_color'), 0.4, 0.7, 1.0, 0.6);
        gl.drawArrays(gl.LINE_STRIP, 0, maxTrail);
        
        gl.disableVertexAttribArray(alphaLoc);
    }
    
    // Calculate positions
    const calcPositions = (state) => {
        const x1 = cx + scale * baseState.l1 * Math.sin(state.theta1);
        const y1 = cy + scale * baseState.l1 * Math.cos(state.theta1);
        const x2 = x1 + scale * baseState.l2 * Math.sin(state.theta2);
        const y2 = y1 + scale * baseState.l2 * Math.cos(state.theta2);
        return { x1, y1, x2, y2 };
    };
    
    const pos1 = calcPositions(state1);
    
    // Draw first pendulum
    this.drawPendulumInGL(gl, program, positionBuffer, cx, cy, pos1.x1, pos1.y1, pos1.x2, pos1.y2, baseState.m1, baseState.m2, [0.4, 0.9, 1.0, 1.0]);
    
    // Draw second pendulum if provided
    if (state2) {
        const pos2 = calcPositions(state2);
        this.drawPendulumInGL(gl, program, positionBuffer, cx, cy, pos2.x1, pos2.y1, pos2.x2, pos2.y2, baseState.m1, baseState.m2, [1.0, 0.5, 0.2, 0.85]);
    }
};

// Draw pendulum components in WebGL
ChaosMapRenderer.prototype.drawPendulumInGL = function(gl, program, positionBuffer, cx, cy, x1, y1, x2, y2, m1, m2, color) {
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const alphaLoc = gl.getAttribLocation(program, 'a_alpha');
    
    // Disable alpha attribute (used for trail) - pendulum uses uniform color
    if (alphaLoc >= 0) {
        gl.disableVertexAttribArray(alphaLoc);
    }
    
    gl.enableVertexAttribArray(posLoc);
    
    // Draw rod 1
    const rod1Data = new Float32Array([cx, cy, x1, y1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, rod1Data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4f(gl.getUniformLocation(program, 'u_color'), color[0] * 0.7, color[1] * 0.7, color[2] * 0.7, color[3]);
    gl.drawArrays(gl.LINES, 0, 2);
    
    // Draw rod 2
    const rod2Data = new Float32Array([x1, y1, x2, y2]);
    gl.bufferData(gl.ARRAY_BUFFER, rod2Data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.LINES, 0, 2);
    
    // Draw first bob
    const bob1Radius = Math.max(3, Math.min(8, 4 + m1 * 1.5));
    this.drawCircleInGL(gl, program, positionBuffer, x1, y1, bob1Radius, [color[0] * 0.8, color[1] * 0.8, color[2] * 0.8, color[3]]);
    
    // Draw second bob
    const bob2Radius = Math.max(4, Math.min(12, 5 + m2 * 1.5));
    this.drawCircleInGL(gl, program, positionBuffer, x2, y2, bob2Radius, color);
    
    // Draw pivot
    this.drawCircleInGL(gl, program, positionBuffer, cx, cy, 3, [0.8, 0.8, 0.8, 1.0]);
};

// Draw circle in WebGL
ChaosMapRenderer.prototype.drawCircleInGL = function(gl, program, positionBuffer, cx, cy, radius, color) {
    const segments = 16;
    const positions = [];
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        positions.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
    
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    const posLoc = gl.getAttribLocation(program, 'a_position');
    const alphaLoc = gl.getAttribLocation(program, 'a_alpha');
    
    // Make sure alpha is disabled and position is set correctly
    if (alphaLoc >= 0) {
        gl.disableVertexAttribArray(alphaLoc);
    }
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform4f(gl.getUniformLocation(program, 'u_color'), color[0], color[1], color[2], color[3]);
    gl.drawArrays(gl.LINE_LOOP, 0, segments + 1);
    
    // Fill circle
    gl.uniform4f(gl.getUniformLocation(program, 'u_color'), color[0] * 0.5, color[1] * 0.5, color[2] * 0.5, color[3] * 0.5);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, segments + 1);
};

// Clean up all pinned simulations when leaving page
ChaosMapRenderer.prototype.cleanup = function() {
    // Stop hover simulation
    this.stopHoverSimulation();
    
    // Clean up all pinned simulations
    this.pinnedSimulations.forEach(sim => {
        if (sim.animationId) {
            cancelAnimationFrame(sim.animationId);
        }
        if (sim.cpuSim) {
            sim.cpuSim.destroy();
        }
    });
    this.pinnedSimulations = [];
};

// Main map generation
ChaosMapRenderer.prototype.generateMap = async function() {
    if (this.isRendering) {
        this.shouldStop = true;
        await new Promise(r => setTimeout(r, 50));
    }
    
    this.isRendering = true;
    this.shouldStop = false;
    
    const loading = document.getElementById('loadingIndicator');
    const progressFill = document.getElementById('progressFill');
    if (loading) loading.style.display = 'flex';
    
    const res = this.baseParams.resolution;
    
    // Use CPU or GPU rendering based on renderMode
    if (this.renderMode === 'cpu') {
        await this.generateMapCPU(res, loading, progressFill);
    } else {
        await this.generateMapGPU(res, loading, progressFill);
    }
    
    if (loading) loading.style.display = 'none';
    if (progressFill) progressFill.style.width = '0%';
    
    this.isRendering = false;
};

// GPU-based map generation (original WebGL implementation)
ChaosMapRenderer.prototype.generateMapGPU = async function(res, loading, progressFill) {
    const tileSize = this.baseParams.tileSize;
    const tilesX = Math.ceil(res / tileSize);
    const tilesY = Math.ceil(res / tileSize);
    const totalTiles = tilesX * tilesY;
    
    // Create offscreen canvas for compositing
    const offCanvas = document.createElement('canvas');
    offCanvas.width = res;
    offCanvas.height = res;
    const offCtx = offCanvas.getContext('2d');
    
    // Generate tiles
    let tileCount = 0;
    
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            if (this.shouldStop) break;
            
            const tileOffsetX = tx * tileSize;
            const tileOffsetY = ty * tileSize;
            const actualTileW = Math.min(tileSize, res - tileOffsetX);
            const actualTileH = Math.min(tileSize, res - tileOffsetY);
            
            await this.renderTile(tileOffsetX, tileOffsetY, actualTileW, actualTileH);
            
            // Copy tile to offscreen canvas
            offCtx.drawImage(this.tileCanvas, tileOffsetX, tileOffsetY);
            
            tileCount++;
            const progress = (tileCount / totalTiles) * 100;
            if (progressFill) progressFill.style.width = progress + '%';
            
            // Yield to UI
            if (tileCount % 4 === 0) {
                await new Promise(r => requestAnimationFrame(r));
            }
        }
    }
    
    // Copy to main canvas
    this.mainCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.mainCtx.drawImage(offCanvas, 0, 0);
};

// CPU-based map generation (64-bit double precision)
ChaosMapRenderer.prototype.generateMapCPU = async function(res, loading, progressFill) {
    const tileSize = this.baseParams.tileSize;
    const tilesX = Math.ceil(res / tileSize);
    const tilesY = Math.ceil(res / tileSize);
    const totalTiles = tilesX * tilesY;
    
    // Update CPU renderer settings
    if (this.cpuChaosRenderer) {
        this.cpuChaosRenderer.resolution = res;
        this.cpuChaosRenderer.maxIter = this.baseParams.maxIter;
        this.cpuChaosRenderer.threshold = this.baseParams.threshold;
        this.cpuChaosRenderer.dt = this.baseParams.dt;
        this.cpuChaosRenderer.g = this.baseParams.g;
        this.cpuChaosRenderer.integrator = this.baseParams.integrator;
        this.cpuChaosRenderer.colorMapping = this.colorMapping;
        this.cpuChaosRenderer.cyclePeriod = this.cyclePeriod;
        this.cpuChaosRenderer.hueMapping = this.hueMapping;
        this.cpuChaosRenderer.perturbFixed = this.baseParams.perturbFixed;
    }
    
    // Create offscreen canvas for compositing
    const offCanvas = document.createElement('canvas');
    offCanvas.width = res;
    offCanvas.height = res;
    const offCtx = offCanvas.getContext('2d');
    
    // Get shader parameters from stack
    const shaderParams = this.stack.getShaderParams();
    
    // Generate tiles
    let tileCount = 0;
    
    for (let ty = 0; ty < tilesY; ty++) {
        for (let tx = 0; tx < tilesX; tx++) {
            if (this.shouldStop) break;
            
            const tileOffsetX = tx * tileSize;
            const tileOffsetY = ty * tileSize;
            const actualTileW = Math.min(tileSize, res - tileOffsetX);
            const actualTileH = Math.min(tileSize, res - tileOffsetY);
            
            // Render tile using CPU
            const imageData = this.cpuChaosRenderer.renderTile(
                tileOffsetX, tileOffsetY, actualTileW, actualTileH, shaderParams
            );
            
            // Put image data to a temp canvas
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = actualTileW;
            tempCanvas.height = actualTileH;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            
            // Copy to offscreen canvas
            offCtx.drawImage(tempCanvas, tileOffsetX, tileOffsetY);
            
            tileCount++;
            const progress = (tileCount / totalTiles) * 100;
            if (progressFill) progressFill.style.width = progress + '%';
            
            // Yield to UI more frequently for CPU mode (slower)
            if (tileCount % 2 === 0) {
                await new Promise(r => requestAnimationFrame(r));
            }
        }
    }
    
    // Copy to main canvas
    this.mainCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.mainCtx.drawImage(offCanvas, 0, 0);
};

// Download the current chaos map as an image
ChaosMapRenderer.prototype.downloadImage = function() {
    const canvas = document.getElementById('chaosMapCanvas');
    if (!canvas) return;
    
    // Create a temporary link element
    const link = document.createElement('a');
    
    // Generate filename with timestamp
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-');
    const layer = this.stack.getLastLayer();
    const layerName = layer ? `${layer.dim1}_${layer.dim2}` : 'map';
    
    link.download = `chaos-map_${layerName}_${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

ChaosMapRenderer.prototype.renderTile = function(offsetX, offsetY, width, height) {
    const gl = this.tileGl;
    const program = this.tileProgram;
    if (!gl || !program) return;
    
    // Check for context loss
    if (gl.isContextLost()) {
        console.warn('WebGL context lost, skipping tile render');
        return;
    }
    
    // Helper to safely set uniforms
    const setUniform = (name, setter, ...values) => {
        const loc = gl.getUniformLocation(program, name);
        if (loc !== null) {
            setter.call(gl, loc, ...values);
        }
    };
    
    // Resize tile canvas if needed
    if (this.tileCanvas.width !== width || this.tileCanvas.height !== height) {
        this.tileCanvas.width = width;
        this.tileCanvas.height = height;
        gl.viewport(0, 0, width, height);
    }
    
    gl.useProgram(program);
    
    // Get shader parameters from stack
    const shaderParams = this.stack.getShaderParams();
    const res = this.baseParams.resolution;
    
    // Set uniforms using helper
    setUniform('u_resolution', gl.uniform2f, res, res);
    setUniform('u_tileOffset', gl.uniform2f, offsetX, offsetY);
    setUniform('u_tileSize', gl.uniform2f, width, height);
    setUniform('u_l1', gl.uniform1f, shaderParams.l1 ?? 1.0);
    setUniform('u_l2', gl.uniform1f, shaderParams.l2 ?? 1.0);
    setUniform('u_m1', gl.uniform1f, shaderParams.m1 ?? 1.0);
    setUniform('u_m2', gl.uniform1f, shaderParams.m2 ?? 1.0);
    setUniform('u_g', gl.uniform1f, this.baseParams.g);
    setUniform('u_dt', gl.uniform1f, this.baseParams.dt);
    setUniform('u_maxIter', gl.uniform1i, this.baseParams.maxIter);
    setUniform('u_threshold', gl.uniform1f, this.baseParams.threshold);
    
    // Perturbation uniforms
    const pFixed = this.baseParams.perturbFixed;
    const pRand = this.baseParams.perturbRandom;
    setUniform('u_perturbFixedAB', gl.uniform4f, 
        pFixed.theta1, pFixed.theta2, pFixed.omega1, pFixed.omega2);
    setUniform('u_perturbFixedCD', gl.uniform4f, 
        pFixed.l1, pFixed.l2, pFixed.m1, pFixed.m2);
    setUniform('u_perturbCenterAB', gl.uniform4f, 
        pRand.theta1.center, pRand.theta2.center, pRand.omega1.center, pRand.omega2.center);
    setUniform('u_perturbCenterCD', gl.uniform4f, 
        pRand.l1.center, pRand.l2.center, pRand.m1.center, pRand.m2.center);
    setUniform('u_perturbStdAB', gl.uniform4f, 
        pRand.theta1.std, pRand.theta2.std, pRand.omega1.std, pRand.omega2.std);
    setUniform('u_perturbStdCD', gl.uniform4f, 
        pRand.l1.std, pRand.l2.std, pRand.m1.std, pRand.m2.std);
    setUniform('u_perturbMode', gl.uniform1i, this.baseParams.perturbMode === 'random' ? 1 : 0);
    setUniform('u_integrator', gl.uniform1i, this.baseParams.integrator === 'verlet' ? 1 : 0);
    setUniform('u_seed', gl.uniform1f, 0);
    setUniform('u_colorMapping', gl.uniform1i, this.colorMapping);
    setUniform('u_cyclePeriod', gl.uniform1f, this.cyclePeriod);
    setUniform('u_hueMapping', gl.uniform1i, this.hueMapping);
    
    // Generate and bind per-tile noise texture for truly independent random perturbations
    const noiseTex = this.updateNoiseTexture(gl, width, height);
    if (noiseTex) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, noiseTex);
        setUniform('u_noiseTexture', gl.uniform1i, 0);
    }
    
    // Layer-based uniforms
    setUniform('u_layerMode', gl.uniform1i, shaderParams.mode ?? 0);
    setUniform('u_fixedState', gl.uniform4f, 
        shaderParams.fixedState?.[0] ?? 0, shaderParams.fixedState?.[1] ?? 0,
        shaderParams.fixedState?.[2] ?? 0, shaderParams.fixedState?.[3] ?? 0);
    setUniform('u_scaleX', gl.uniform1f, shaderParams.scaleX ?? 3.14);
    setUniform('u_scaleY', gl.uniform1f, shaderParams.scaleY ?? 3.14);
    setUniform('u_centerX', gl.uniform1f, shaderParams.centerX ?? 0);
    setUniform('u_centerY', gl.uniform1f, shaderParams.centerY ?? 0);
    
    // Which dimensions are being mapped
    const dim1 = shaderParams.layerDims ? shaderParams.layerDims[0] : 'theta1';
    const dim2 = shaderParams.layerDims ? shaderParams.layerDims[1] : 'theta2';
    const dimToIndex = { theta1: 0, theta2: 1, omega1: 2, omega2: 3, l1: 4, l2: 5, m1: 6, m2: 7 };
    setUniform('u_mappedDims', gl.uniform2i, dimToIndex[dim1] ?? 0, dimToIndex[dim2] ?? 1);
    
    // Delta mode: add to basis state instead of replacing
    setUniform('u_deltaMode', gl.uniform1i, shaderParams.deltaMode ? 1 : 0);
    
    gl.drawArrays(gl.TRIANGLES, 0, 6);
};

// GPU-consistent RK4 integration - uses SAME physics as the shader
ChaosMapRenderer.prototype.stepPhysicsRK4OnGPU = function(state, l1, l2, m1, m2) {
    const dt = this.baseParams.dt;
    const g = this.baseParams.g;
    
    // RK4 integration matching the shader's stepPhysicsRK4 exactly
    const k1 = this.computeDerivativesGPU(state, l1, l2, m1, m2, g);
    
    const s2 = {
        theta1: state.theta1 + 0.5 * dt * k1.dtheta1,
        theta2: state.theta2 + 0.5 * dt * k1.dtheta2,
        omega1: state.omega1 + 0.5 * dt * k1.domega1,
        omega2: state.omega2 + 0.5 * dt * k1.domega2
    };
    const k2 = this.computeDerivativesGPU(s2, l1, l2, m1, m2, g);
    
    const s3 = {
        theta1: state.theta1 + 0.5 * dt * k2.dtheta1,
        theta2: state.theta2 + 0.5 * dt * k2.dtheta2,
        omega1: state.omega1 + 0.5 * dt * k2.domega1,
        omega2: state.omega2 + 0.5 * dt * k2.domega2
    };
    const k3 = this.computeDerivativesGPU(s3, l1, l2, m1, m2, g);
    
    const s4 = {
        theta1: state.theta1 + dt * k3.dtheta1,
        theta2: state.theta2 + dt * k3.dtheta2,
        omega1: state.omega1 + dt * k3.domega1,
        omega2: state.omega2 + dt * k3.domega2
    };
    const k4 = this.computeDerivativesGPU(s4, l1, l2, m1, m2, g);
    
    return {
        theta1: state.theta1 + dt * (k1.dtheta1 + 2*k2.dtheta1 + 2*k3.dtheta1 + k4.dtheta1) / 6,
        theta2: state.theta2 + dt * (k1.dtheta2 + 2*k2.dtheta2 + 2*k3.dtheta2 + k4.dtheta2) / 6,
        omega1: state.omega1 + dt * (k1.domega1 + 2*k2.domega1 + 2*k3.domega1 + k4.domega1) / 6,
        omega2: state.omega2 + dt * (k1.domega2 + 2*k2.domega2 + 2*k3.domega2 + k4.domega2) / 6
    };
};

// GPU-consistent derivative computation - matches shader's computeAccelerations
ChaosMapRenderer.prototype.computeDerivativesGPU = function(s, l1, l2, m1, m2, g) {
    const delta = s.theta1 - s.theta2;
    const sinDelta = Math.sin(delta);
    const cosDelta = Math.cos(delta);
    
    const M = m1 + m2;
    const alphaDenom = m1 + m2 * sinDelta * sinDelta;
    
    // These match the shader's computeAccelerations exactly
    const num1 = -m2 * l1 * s.omega1 * s.omega1 * sinDelta * cosDelta
               - m2 * l2 * s.omega2 * s.omega2 * sinDelta
               - M * g * Math.sin(s.theta1)
               + m2 * g * Math.sin(s.theta2) * cosDelta;
    
    const num2 = M * l1 * s.omega1 * s.omega1 * sinDelta
               + m2 * l2 * s.omega2 * s.omega2 * sinDelta * cosDelta
               + M * g * Math.sin(s.theta1) * cosDelta
               - M * g * Math.sin(s.theta2);
    
    const alpha1 = num1 / (l1 * alphaDenom);
    const alpha2 = num2 / (l2 * alphaDenom);
    
    return {
        dtheta1: s.omega1,
        dtheta2: s.omega2,
        domega1: alpha1,
        domega2: alpha2
    };
};

// Legacy RK4 - kept for compatibility, uses computeDerivatives
ChaosMapRenderer.prototype.stepPhysicsRK4 = function(state) {
    return this.stepPhysicsRK4OnGPU(
        state,
        this.stack.computeState(0.5, 0.5).l1,
        this.stack.computeState(0.5, 0.5).l2,
        this.stack.computeState(0.5, 0.5).m1,
        this.stack.computeState(0.5, 0.5).m2
    );
};

// Measure divergence between two pendulum states
ChaosMapRenderer.prototype.measureDivergence = function(s1, s2) {
    const PI = Math.PI;
    
    // Circular difference for angles
    let dTheta1 = s1.theta1 - s2.theta1;
    if (dTheta1 > PI) dTheta1 -= 2 * PI;
    if (dTheta1 < -PI) dTheta1 += 2 * PI;
    
    let dTheta2 = s1.theta2 - s2.theta2;
    if (dTheta2 > PI) dTheta2 -= 2 * PI;
    if (dTheta2 < -PI) dTheta2 += 2 * PI;
    
    const dOmega1 = s1.omega1 - s2.omega1;
    const dOmega2 = s1.omega2 - s2.omega2;
    
    return Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2);
};
