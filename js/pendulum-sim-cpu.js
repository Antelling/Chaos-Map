// CPU-Based Double Pendulum Simulation (OPTIMIZED)
// Uses standard 2D Canvas for rendering and CPU-based numerical integration
// Velocity Verlet symplectic integrator for maximum accuracy

class CPUPendulumSimulation {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        
        // Ensure canvas has proper dimensions
        if (!canvas.width) canvas.width = 256;
        if (!canvas.height) canvas.height = 256;
        
        this.ctx = canvas.getContext('2d');
        
        if (!this.ctx) {
            throw new Error('Canvas 2D context not supported');
        }
        
        // Physics parameters
        this.g = options.g || 9.81;
        this.dt = options.dt || 0.002;
        this.l1 = options.l1 || 1.0;
        this.l2 = options.l2 || 1.0;
        this.m1 = options.m1 || 1.0;
        this.m2 = options.m2 || 1.0;
        this.threshold = options.threshold || 0.05;
        this.maxTrailLength = options.maxTrailLength || 2000;
        
        // Pre-compute mass sum for acceleration calculations
        this.M = this.m1 + this.m2;
        
        // Energy canvases (optional)
        this.energyCanvas = options.energyCanvas || null;
        this.energyTimeCanvas = options.energyTimeCanvas || null;
        this.energyCtx = this.energyCanvas ? this.energyCanvas.getContext('2d') : null;
        this.energyTimeCtx = this.energyTimeCanvas ? this.energyTimeCanvas.getContext('2d') : null;
        
        // Energy history - use less frequent sampling
        this.energyHistory = [];
        this.energySampleInterval = 5; // Compute energy every 5 frames
        this.energyFrameCounter = 0;
        
        // Current states for main and perturbed pendulums
        // Use Float32Array for better performance and automatic 32-bit precision
        if (options.initialState1) {
            this.state1 = new Float32Array([
                options.initialState1.theta1,
                options.initialState1.theta2,
                options.initialState1.omega1,
                options.initialState1.omega2
            ]);
        } else {
            this.state1 = new Float32Array([1.0, 0.5, 0, 0]);
        }
        if (options.initialState2) {
            this.state2 = new Float32Array([
                options.initialState2.theta1,
                options.initialState2.theta2,
                options.initialState2.omega1,
                options.initialState2.omega2
            ]);
        } else {
            this.state2 = new Float32Array([1.00001, 0.50001, 0, 0]);
        }
        
        // Trail history - use typed arrays for better memory layout
        // Each trail point: x, y (alpha is constant, don't store)
        this.trail1 = [];
        this.trail2 = [];
        this.maxTrailPoints = 5000; // Limit trail length to prevent unbounded growth
        
        // Simulation tracking
        this.frameCount = 0;
        this.divergenceTime = null;
        this.diverged = false;
        
        // Canvas display settings
        this.centerX = canvas.width / 2;
        this.centerY = canvas.height / 2;
        this.scale = 1;
        this._updateScale();
        
        // Pre-calculate positions
        this.pos1 = { x1: 0, y1: 0, x2: 0, y2: 0 };
        this.pos2 = { x1: 0, y1: 0, x2: 0, y2: 0 };
        this.updatePositions();
        
        // Pre-allocate arrays for acceleration calculations to avoid GC
        this._accelTemp = new Float32Array(2);
    }
    
    // Pre-compute scale based on pendulum lengths
    _updateScale() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const maxReach = this.l1 + this.l2;
        const minDimension = Math.min(w, h);
        this.scale = (minDimension * 0.4) / maxReach;
    }
    
    // Compute accelerations given current state
    // Uses object pooling to avoid allocations
    computeAccelerations(s, l1, l2, m1, m2, out) {
        const M = this.M;
        const delta = s[0] - s[1]; // theta1 - theta2
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        
        const alphaDenom = m1 + m2 * sinDelta * sinDelta;
        
        const sinTheta1 = Math.sin(s[0]);
        const sinTheta2 = Math.sin(s[1]);
        
        const num1 = -m2 * l1 * s[2] * s[2] * sinDelta * cosDelta
                   - m2 * l2 * s[3] * s[3] * sinDelta
                   - M * this.g * sinTheta1
                   + m2 * this.g * sinTheta2 * cosDelta;
        
        const num2 = M * l1 * s[2] * s[2] * sinDelta
                   + m2 * l2 * s[3] * s[3] * sinDelta * cosDelta
                   + M * this.g * sinTheta1 * cosDelta
                   - M * this.g * sinTheta2;
        
        out[0] = num1 / (l1 * alphaDenom);
        out[1] = num2 / (l2 * alphaDenom);
    }
    
    // Velocity Verlet integrator - symplectic, matches stepPhysicsVerlet from shader
    // Uses Float32Array for automatic 32-bit precision without Math.fround overhead
    stepVerlet(s, l1, l2, m1, m2) {
        const dt = this.dt;
        const halfDt = 0.5 * dt;
        
        // Current accelerations (re-use temp array)
        this.computeAccelerations(s, l1, l2, m1, m2, this._accelTemp);
        const alpha1 = this._accelTemp[0];
        const alpha2 = this._accelTemp[1];
        
        // Half-step velocity
        const omega1Half = s[2] + halfDt * alpha1;
        const omega2Half = s[3] + halfDt * alpha2;
        
        // Full position update
        s[0] += dt * omega1Half;
        s[1] += dt * omega2Half;
        s[2] = omega1Half;
        s[3] = omega2Half;
        
        // New accelerations
        this.computeAccelerations(s, l1, l2, m1, m2, this._accelTemp);
        
        // Final half-step velocity
        s[2] += halfDt * this._accelTemp[0];
        s[3] += halfDt * this._accelTemp[1];
    }
    
    // Measure divergence between two states using Float32Arrays
    measureDivergence(s1, s2) {
        // Circular difference for angles
        let dTheta1 = s1[0] - s2[0];
        let dTheta2 = s1[1] - s2[1];
        
        // Normalize angle differences
        if (dTheta1 > Math.PI) dTheta1 -= 2 * Math.PI;
        else if (dTheta1 < -Math.PI) dTheta1 += 2 * Math.PI;
        
        if (dTheta2 > Math.PI) dTheta2 -= 2 * Math.PI;
        else if (dTheta2 < -Math.PI) dTheta2 += 2 * Math.PI;
        
        const dOmega1 = s1[2] - s2[2];
        const dOmega2 = s1[3] - s2[3];
        
        return Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2);
    }
    
    // Convert state to Cartesian coordinates - inline for speed
    stateToPosition(s, out) {
        const sinT1 = Math.sin(s[0]);
        const cosT1 = Math.cos(s[0]);
        const sinT2 = Math.sin(s[1]);
        const cosT2 = Math.cos(s[1]);
        
        out.x1 = this.l1 * sinT1;
        out.y1 = this.l1 * cosT1;
        out.x2 = out.x1 + this.l2 * sinT2;
        out.y2 = out.y1 + this.l2 * cosT2;
    }
    
    // Update cached positions
    updatePositions() {
        this.stateToPosition(this.state1, this.pos1);
        this.stateToPosition(this.state2, this.pos2);
    }
    
    // Step both pendulums forward
    step(steps = 1) {
        for (let i = 0; i < steps; i++) {
            // Step BOTH pendulums FIRST (must be at same time point for comparison)
            this.stepVerlet(this.state1, this.l1, this.l2, this.m1, this.m2);
            this.stepVerlet(this.state2, this.l1, this.l2, this.m1, this.m2);
            
            this.frameCount++;
            
            // Check divergence AFTER both have stepped (matches GPU behavior)
            if (!this.diverged) {
                const dist = this.measureDivergence(this.state1, this.state2);
                if (dist > this.threshold) {
                    this.diverged = true;
                    this.divergenceTime = this.frameCount;
                }
            }
        }
        
        // Update positions after stepping
        this.updatePositions();
        
        // Add to trails
        this.addToTrails();
        
        // Compute energy periodically (not every frame)
        this.energyFrameCounter++;
        if (this.energyFrameCounter >= this.energySampleInterval) {
            this.energyFrameCounter = 0;
            this.computeAndStoreEnergy();
        }
    }
    
    // Compute and store energy (called periodically, not every frame)
    computeAndStoreEnergy() {
        const s = this.state1;
        const sinT1 = Math.sin(s[0]);
        const cosT1 = Math.cos(s[0]);
        const sinT2 = Math.sin(s[1]);
        const cosT2 = Math.cos(s[1]);
        
        // Heights (origin at pivot, y increases downward in physics coords)
        const y1 = -this.l1 * cosT1;
        const y2 = y1 - this.l2 * cosT2;
        
        // Potential energy
        const pe = this.m1 * this.g * y1 + this.m2 * this.g * y2;
        
        // Velocities
        const vx1 = this.l1 * s[2] * cosT1;
        const vy1 = -this.l1 * s[2] * sinT1;
        const vx2 = vx1 + this.l2 * s[3] * cosT2;
        const vy2 = vy1 - this.l2 * s[3] * sinT2;
        
        // Kinetic energy
        const ke = 0.5 * this.m1 * (vx1*vx1 + vy1*vy1) + 0.5 * this.m2 * (vx2*vx2 + vy2*vy2);
        
        this.energyHistory.push({
            pe: pe,
            ke: ke,
            total: pe + ke,
            time: this.frameCount * this.dt
        });
        
        // Limit energy history size
        if (this.energyHistory.length > 1000) {
            this.energyHistory.shift();
        }
    }
    
    // Add current positions to trail history
    addToTrails() {
        // Push new points
        this.trail1.push(this.pos1.x2, this.pos1.y2);
        this.trail2.push(this.pos2.x2, this.pos2.y2);
        
        // Limit trail length (circular buffer would be better but this is simpler)
        if (this.trail1.length > this.maxTrailPoints * 2) {
            this.trail1 = this.trail1.slice(-this.maxTrailPoints * 2);
            this.trail2 = this.trail2.slice(-this.maxTrailPoints * 2);
        }
    }
    
    // Transform physics coordinates to canvas coordinates (inline)
    toCanvas(x, y) {
        return {
            x: this.centerX + x * this.scale,
            y: this.centerY + y * this.scale
        };
    }
    
    // Render the pendulum
    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);
        
        // Draw trails using optimized batch rendering
        this.drawTrailOptimized(this.trail1, 'rgba(100, 200, 255, 0.3)');
        if (!this.diverged) {
            this.drawTrailOptimized(this.trail2, 'rgba(255, 150, 50, 0.3)');
        } else {
            this.drawTrailOptimized(this.trail2, 'rgba(255, 150, 50, 0.15)');
        }
        
        // Draw rods for main pendulum
        this.drawRods(this.pos1, 'rgb(100, 200, 255)');
        
        // Draw rods for perturbed pendulum
        this.drawRods(this.pos2, 'rgb(255, 150, 50)');
        
        // Draw masses for main pendulum
        this.drawMasses(this.pos1, this.m1, this.m2, 'rgb(100, 200, 255)', 'rgb(150, 220, 255)');
        
        // Draw masses for perturbed pendulum
        this.drawMasses(this.pos2, this.m1, this.m2, 'rgb(255, 150, 50)', 'rgb(255, 180, 100)');
        
        // Draw divergence label if diverged
        if (this.diverged) {
            this.drawDivergenceLabel();
        }
        
        // Draw info text
        this.drawInfo();
        
        // Draw energy visualizations
        this.drawEnergyViz();
    }
    
    // Optimized trail drawing using path batching
    drawTrailOptimized(trail, color) {
        if (trail.length < 4) return;
        
        const ctx = this.ctx;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 1;
        ctx.strokeStyle = color;
        
        // Batch draw segments using a single path
        ctx.beginPath();
        let first = true;
        
        for (let i = 0; i < trail.length; i += 2) {
            const x = this.centerX + trail[i] * this.scale;
            const y = this.centerY + trail[i + 1] * this.scale;
            
            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
    }
    
    // Draw energy visualizations
    drawEnergyViz() {
        if (!this.energyHistory.length) return;
        
        // PE vs KE scatter plot
        if (this.energyCtx && this.energyCanvas) {
            this.drawEnergyScatter(this.energyCtx, this.energyCanvas);
        }
        
        // Total energy vs time
        if (this.energyTimeCtx && this.energyTimeCanvas) {
            this.drawEnergyTime(this.energyTimeCtx, this.energyTimeCanvas);
        }
    }
    
    // Draw PE vs KE scatter plot (optimized)
    drawEnergyScatter(ctx, canvas) {
        const w = canvas.width;
        const h = canvas.height;
        
        // Clear with fade
        ctx.fillStyle = 'rgba(10, 10, 10, 0.05)';
        ctx.fillRect(0, 0, w, h);
        
        // Find energy ranges
        let minPE = Infinity, maxPE = -Infinity;
        let minKE = Infinity, maxKE = -Infinity;
        for (const e of this.energyHistory) {
            if (e.pe < minPE) minPE = e.pe;
            if (e.pe > maxPE) maxPE = e.pe;
            if (e.ke < minKE) minKE = e.ke;
            if (e.ke > maxKE) maxKE = e.ke;
        }
        const peRange = maxPE - minPE || 1;
        const keRange = maxKE - minKE || 1;
        
        // Padding
        const pad = 20;
        const plotW = w - 2 * pad;
        const plotH = h - 2 * pad;
        
        // Draw axes
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, h - pad);
        ctx.lineTo(w - pad, h - pad);
        ctx.moveTo(pad, h - pad);
        ctx.lineTo(pad, pad);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PE', w / 2, h - 5);
        ctx.save();
        ctx.translate(10, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('KE', 0, 0);
        ctx.restore();
        
        // Map energy to canvas
        const mapX = (pe) => pad + (pe - minPE) / peRange * plotW;
        const mapY = (ke) => h - pad - (ke - minKE) / keRange * plotH;
        
        // Draw trajectory with color gradient - batch into single path per color
        const history = this.energyHistory;
        const segmentCount = history.length - 1;
        
        for (let i = 0; i < segmentCount; i++) {
            const t = i / segmentCount;
            const hue = 200 + t * 60;
            ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.4)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(mapX(history[i].pe), mapY(history[i].ke));
            ctx.lineTo(mapX(history[i + 1].pe), mapY(history[i + 1].ke));
            ctx.stroke();
        }
        
        // Draw current point
        const last = history[history.length - 1];
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(mapX(last.pe), mapY(last.ke), 4, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw total energy vs time (optimized)
    drawEnergyTime(ctx, canvas) {
        const w = canvas.width;
        const h = canvas.height;
        
        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);
        
        const history = this.energyHistory;
        if (history.length < 2) return;
        
        // Find ranges
        let minE = Infinity, maxE = -Infinity;
        let maxTime = history[history.length - 1].time;
        for (const e of history) {
            if (e.total < minE) minE = e.total;
            if (e.total > maxE) maxE = e.total;
        }
        const ePadding = (maxE - minE) * 0.1 || 1;
        minE -= ePadding;
        maxE += ePadding;
        const eRange = maxE - minE || 1;
        
        // Padding
        const pad = 20;
        const plotW = w - 2 * pad;
        const plotH = h - 2 * pad;
        
        // Draw axes
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, h - pad);
        ctx.lineTo(w - pad, h - pad);
        ctx.moveTo(pad, h - pad);
        ctx.lineTo(pad, pad);
        ctx.stroke();
        
        // Labels
        ctx.fillStyle = 'rgba(150, 150, 150, 0.5)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Time', w / 2, h - 5);
        ctx.save();
        ctx.translate(10, h / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText('Total Energy', 0, 0);
        ctx.restore();
        
        // Map to canvas
        const mapX = (t) => pad + (t / maxTime) * plotW;
        const mapY = (e) => h - pad - (e - minE) / eRange * plotH;
        
        // Draw energy trajectory as single path
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
            const x = mapX(history[i].time);
            const y = mapY(history[i].total);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        
        // Draw current point
        const last = history[history.length - 1];
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(mapX(last.time), mapY(last.total), 3, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Draw rods (arms) of pendulum
    drawRods(pos, color) {
        const ctx = this.ctx;
        const originX = this.centerX;
        const originY = this.centerY;
        const p1x = this.centerX + pos.x1 * this.scale;
        const p1y = this.centerY + pos.y1 * this.scale;
        const p2x = this.centerX + pos.x2 * this.scale;
        const p2y = this.centerY + pos.y2 * this.scale;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        // First rod
        ctx.beginPath();
        ctx.moveTo(originX, originY);
        ctx.lineTo(p1x, p1y);
        ctx.stroke();
        
        // Second rod
        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.stroke();
    }
    
    // Draw mass circles
    drawMasses(pos, m1, m2, color1, color2) {
        const ctx = this.ctx;
        const p1x = this.centerX + pos.x1 * this.scale;
        const p1y = this.centerY + pos.y1 * this.scale;
        const p2x = this.centerX + pos.x2 * this.scale;
        const p2y = this.centerY + pos.y2 * this.scale;
        
        // Mass 1
        const r1 = Math.max(6, Math.sqrt(m1) * 10);
        ctx.beginPath();
        ctx.arc(p1x, p1y, r1, 0, Math.PI * 2);
        ctx.fillStyle = color1;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Mass 2
        const r2 = Math.max(6, Math.sqrt(m2) * 10);
        ctx.beginPath();
        ctx.arc(p2x, p2y, r2, 0, Math.PI * 2);
        ctx.fillStyle = color2;
        ctx.fill();
        ctx.stroke();
    }
    
    // Draw divergence label
    drawDivergenceLabel() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        
        ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`DIVERGED at t=${this.divergenceTime}`, w - 8, 16);
    }
    
    // Draw info text
    drawInfo() {
        const ctx = this.ctx;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`t=${this.frameCount}`, 8, 16);
        
        if (this.diverged) {
            ctx.fillStyle = 'rgba(255, 150, 50, 0.7)';
            ctx.fillText('Perturbed stopped', 8, 30);
        }
    }
    
    // Reset simulation with new parameters
    reset(options = {}) {
        // Update mass sum if masses changed
        if (options.m1 !== undefined || options.m2 !== undefined) {
            this.m1 = options.m1 !== undefined ? options.m1 : this.m1;
            this.m2 = options.m2 !== undefined ? options.m2 : this.m2;
            this.M = this.m1 + this.m2;
            this._updateScale();
        }
        
        // Reset states with Float32Array
        if (options.initialState1) {
            this.state1[0] = options.initialState1.theta1;
            this.state1[1] = options.initialState1.theta2;
            this.state1[2] = options.initialState1.omega1;
            this.state1[3] = options.initialState1.omega2;
        }
        if (options.initialState2) {
            this.state2[0] = options.initialState2.theta1;
            this.state2[1] = options.initialState2.theta2;
            this.state2[2] = options.initialState2.omega1;
            this.state2[3] = options.initialState2.omega2;
        }
        if (options.l1 !== undefined) this.l1 = options.l1;
        if (options.l2 !== undefined) this.l2 = options.l2;
        if (options.dt !== undefined) this.dt = options.dt;
        if (options.threshold !== undefined) this.threshold = options.threshold;
        
        // Recompute scale if lengths changed
        if (options.l1 !== undefined || options.l2 !== undefined) {
            this._updateScale();
        }
        
        this.frameCount = 0;
        this.divergenceTime = null;
        this.diverged = false;
        this.trail1 = [];
        this.trail2 = [];
        this.energyHistory = [];
        this.energyFrameCounter = 0;
        
        // Clear energy canvases
        if (this.energyCtx && this.energyCanvas) {
            this.energyCtx.fillStyle = '#0a0a0a';
            this.energyCtx.fillRect(0, 0, this.energyCanvas.width, this.energyCanvas.height);
        }
        if (this.energyTimeCtx && this.energyTimeCanvas) {
            this.energyTimeCtx.fillStyle = '#0a0a0a';
            this.energyTimeCtx.fillRect(0, 0, this.energyTimeCanvas.width, this.energyTimeCanvas.height);
        }
        
        this.updatePositions();
    }
    
    // Destroy and cleanup
    destroy() {
        this.trail1 = [];
        this.trail2 = [];
        this.energyHistory = [];
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUPendulumSimulation };
}
