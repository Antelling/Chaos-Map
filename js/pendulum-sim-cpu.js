// CPU-Based Double Pendulum Simulation
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
        
        // Energy canvases (optional)
        this.energyCanvas = options.energyCanvas || null;
        this.energyTimeCanvas = options.energyTimeCanvas || null;
        this.energyCtx = this.energyCanvas ? this.energyCanvas.getContext('2d') : null;
        this.energyTimeCtx = this.energyTimeCanvas ? this.energyTimeCanvas.getContext('2d') : null;
        
        // Energy history
        this.energyHistory = []; // {pe, ke, total, time}
        
        // Current states for main and perturbed pendulums (quantized to 32-bit to match GPU)
        if (options.initialState1) {
            this.state1 = {
                theta1: Math.fround(options.initialState1.theta1),
                theta2: Math.fround(options.initialState1.theta2),
                omega1: Math.fround(options.initialState1.omega1),
                omega2: Math.fround(options.initialState1.omega2)
            };
        } else {
            this.state1 = { theta1: 1.0, theta2: 0.5, omega1: 0, omega2: 0 };
        }
        if (options.initialState2) {
            this.state2 = {
                theta1: Math.fround(options.initialState2.theta1),
                theta2: Math.fround(options.initialState2.theta2),
                omega1: Math.fround(options.initialState2.omega1),
                omega2: Math.fround(options.initialState2.omega2)
            };
        } else {
            this.state2 = { theta1: 1.00001, theta2: 0.50001, omega1: 0, omega2: 0 };
        }
        
        // Trail history - each point is { x, y, alpha }
        this.trail1 = []; // Main pendulum trail
        this.trail2 = []; // Perturbed pendulum trail
        
        // Simulation tracking
        this.frameCount = 0;
        this.divergenceTime = null;
        this.diverged = false;
        
        // Canvas display settings
        this.centerX = 0;
        this.centerY = 0;
        this.scale = 1;
        
        // Pre-calculate positions
        this.updatePositions();
    }
    
    // Compute accelerations given current state
    // Matches the computeAccelerations function from chaos-map.html shader
    computeAccelerations(s, l1, l2, m1, m2) {
        const M = m1 + m2;
        const delta = s.theta1 - s.theta2;
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        
        const alphaDenom = m1 + m2 * sinDelta * sinDelta;
        
        const num1 = -m2 * l1 * s.omega1 * s.omega1 * sinDelta * cosDelta
                   - m2 * l2 * s.omega2 * s.omega2 * sinDelta
                   - M * this.g * Math.sin(s.theta1)
                   + m2 * this.g * Math.sin(s.theta2) * cosDelta;
        
        const num2 = M * l1 * s.omega1 * s.omega1 * sinDelta
                   + m2 * l2 * s.omega2 * s.omega2 * sinDelta * cosDelta
                   + M * this.g * Math.sin(s.theta1) * cosDelta
                   - M * this.g * Math.sin(s.theta2);
        
        const alpha1 = num1 / (l1 * alphaDenom);
        const alpha2 = num2 / (l2 * alphaDenom);
        
        return { alpha1, alpha2 };
    }
    
    // Velocity Verlet integrator - symplectic, matches stepPhysicsVerlet from shader
    // Quantizes to 32-bit float to match GPU precision
    stepVerlet(s, l1, l2, m1, m2) {
        const dt = this.dt;
        const halfDt = 0.5 * dt;
        
        // Current accelerations
        const { alpha1, alpha2 } = this.computeAccelerations(s, l1, l2, m1, m2);
        
        // Half-step velocity
        const omega1Half = s.omega1 + halfDt * alpha1;
        const omega2Half = s.omega2 + halfDt * alpha2;
        
        // Full position update
        const next = {
            theta1: Math.fround(s.theta1 + dt * omega1Half),
            theta2: Math.fround(s.theta2 + dt * omega2Half),
            omega1: Math.fround(omega1Half),
            omega2: Math.fround(omega2Half)
        };
        
        // New accelerations
        const { alpha1: newAlpha1, alpha2: newAlpha2 } = this.computeAccelerations(next, l1, l2, m1, m2);
        
        // Final half-step velocity (quantized to 32-bit)
        next.omega1 = Math.fround(next.omega1 + halfDt * newAlpha1);
        next.omega2 = Math.fround(next.omega2 + halfDt * newAlpha2);
        
        return next;
    }
    
    // Circular difference for angle comparison
    circularDiff(a, b) {
        let d = a - b;
        const PI = Math.PI;
        if (d > PI) d -= 2 * PI;
        if (d < -PI) d += 2 * PI;
        return d;
    }
    
    // Measure divergence between two states
    measureDivergence(s1, s2) {
        const dTheta1 = this.circularDiff(s1.theta1, s2.theta1);
        const dTheta2 = this.circularDiff(s1.theta2, s2.theta2);
        const dOmega1 = s1.omega1 - s2.omega1;
        const dOmega2 = s1.omega2 - s2.omega2;
        
        return Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2);
    }
    
    // Convert state to Cartesian coordinates
    stateToPosition(s) {
        const x1 = this.l1 * Math.sin(s.theta1);
        const y1 = this.l1 * Math.cos(s.theta1);
        const x2 = x1 + this.l2 * Math.sin(s.theta2);
        const y2 = y1 + this.l2 * Math.cos(s.theta2);
        return { x1, y1, x2, y2 };
    }
    
    // Update cached positions
    updatePositions() {
        this.pos1 = this.stateToPosition(this.state1);
        this.pos2 = this.stateToPosition(this.state2);
    }
    
    // Step both pendulums forward
    step(steps = 1) {
        for (let i = 0; i < steps; i++) {
            // Step BOTH pendulums FIRST (must be at same time point for comparison)
            this.state1 = this.stepVerlet(this.state1, this.l1, this.l2, this.m1, this.m2);
            this.state2 = this.stepVerlet(this.state2, this.l1, this.l2, this.m1, this.m2);
            
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
    }
    
    // Compute energy of the system (main pendulum)
    computeEnergy(s) {
        // Heights (origin at pivot, y increases downward in physics coords)
        const y1 = -this.l1 * Math.cos(s.theta1);
        const y2 = y1 - this.l2 * Math.cos(s.theta2);
        
        // Potential energy (reference: pivot height)
        const pe = this.m1 * this.g * y1 + this.m2 * this.g * y2;
        
        // Velocities of masses
        // v1 = l1 * omega1 perpendicular to rod 1
        const vx1 = this.l1 * s.omega1 * Math.cos(s.theta1);
        const vy1 = -this.l1 * s.omega1 * Math.sin(s.theta1);
        
        // v2 = v1 + l2 * omega2 perpendicular to rod 2
        const vx2 = vx1 + this.l2 * s.omega2 * Math.cos(s.theta2);
        const vy2 = vy1 - this.l2 * s.omega2 * Math.sin(s.theta2);
        
        // Kinetic energy
        const ke = 0.5 * this.m1 * (vx1*vx1 + vy1*vy1) + 0.5 * this.m2 * (vx2*vx2 + vy2*vy2);
        
        return { pe, ke, total: pe + ke };
    }
    
    // Add current positions to trail history (forever)
    addToTrails() {
        // Main pendulum trail - add every frame
        this.trail1.push({
            x: this.pos1.x2,
            y: this.pos1.y2,
            alpha: 1.0
        });
        
        // Perturbed pendulum trail - add every frame
        this.trail2.push({
            x: this.pos2.x2,
            y: this.pos2.y2,
            alpha: 1.0
        });
        
        // All trail points have constant alpha (no fading)
        for (let i = 0; i < this.trail1.length; i++) {
            this.trail1[i].alpha = 0.5;
        }
        
        for (let i = 0; i < this.trail2.length; i++) {
            this.trail2[i].alpha = 0.5;
        }
        
        // Add energy history
        const energy = this.computeEnergy(this.state1);
        this.energyHistory.push({
            pe: energy.pe,
            ke: energy.ke,
            total: energy.total,
            time: this.frameCount * this.dt
        });
    }
    
    // Calculate display scale to fit pendulum in canvas
    calculateScale() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const maxReach = this.l1 + this.l2;
        const minDimension = Math.min(w, h);
        // Scale to fit with padding, ensuring pendulum never overflows
        this.scale = (minDimension * 0.4) / maxReach;
        this.centerX = w / 2;
        this.centerY = h / 2;
    }
    
    // Transform physics coordinates to canvas coordinates
    toCanvas(x, y) {
        return {
            x: this.centerX + x * this.scale,
            y: this.centerY + y * this.scale  // Y increases downward in canvas
        };
    }
    
    // Render the pendulum
    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Calculate scale
        this.calculateScale();
        
        // Clear canvas
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, w, h);
        
        // Draw permanent trails (all history)
        this.drawTrail(this.trail1, 'rgba(100, 200, 255, 0.3)');
        if (!this.diverged) {
            this.drawTrail(this.trail2, 'rgba(255, 150, 50, 0.3)');
        } else {
            // Draw remaining trail of perturbed pendulum after divergence
            this.drawTrail(this.trail2, 'rgba(255, 150, 50, 0.15)');
        }
        
        // Draw rods for main pendulum
        this.drawRods(this.pos1, 'rgb(100, 200, 255)');
        
        // Draw rods for perturbed pendulum (always, even after divergence)
        this.drawRods(this.pos2, 'rgb(255, 150, 50)');
        
        // Draw masses for main pendulum
        this.drawMasses(this.pos1, this.m1, this.m2, 'rgb(100, 200, 255)', 'rgb(150, 220, 255)');
        
        // Draw masses for perturbed pendulum (always, even after divergence)
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
    
    // Draw PE vs KE scatter plot
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
            minPE = Math.min(minPE, e.pe);
            maxPE = Math.max(maxPE, e.pe);
            minKE = Math.min(minKE, e.ke);
            maxKE = Math.max(maxKE, e.ke);
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
        ctx.lineTo(w - pad, h - pad); // PE axis (x)
        ctx.moveTo(pad, h - pad);
        ctx.lineTo(pad, pad); // KE axis (y)
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
        
        // Draw trajectory with color gradient (blue to purple based on time)
        const history = this.energyHistory;
        for (let i = 1; i < history.length; i++) {
            const t = i / history.length;
            const hue = 200 + t * 60; // Blue (200) to purple (260)
            ctx.strokeStyle = `hsla(${hue}, 80%, 60%, 0.4)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(mapX(history[i-1].pe), mapY(history[i-1].ke));
            ctx.lineTo(mapX(history[i].pe), mapY(history[i].ke));
            ctx.stroke();
        }
        
        // Draw current point
        const last = history[history.length - 1];
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(mapX(last.pe), mapY(last.ke), 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw total energy = constant line (if we have enough history)
        if (history.length > 10) {
            ctx.strokeStyle = 'rgba(100, 255, 100, 0.15)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            // PE + KE = E_total => KE = E_total - PE
            const eTotal = last.total;
            // Sample points along the constant energy line
            for (let i = 0; i <= 20; i++) {
                const pe = minPE + (i / 20) * peRange;
                const ke = eTotal - pe;
                if (ke >= minKE && ke <= maxKE) {
                    const x = mapX(pe);
                    const y = mapY(ke);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    
    // Draw total energy vs time
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
            minE = Math.min(minE, e.total);
            maxE = Math.max(maxE, e.total);
        }
        // Add some padding
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
        ctx.lineTo(w - pad, h - pad); // Time axis
        ctx.moveTo(pad, h - pad);
        ctx.lineTo(pad, pad); // Energy axis
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
        
        // Draw energy trajectory
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
    
    // Draw a trail path
    drawTrail(trail, color) {
        if (trail.length < 2) return;
        
        const ctx = this.ctx;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        
        // Draw segments with varying alpha
        for (let i = 1; i < trail.length; i++) {
            const p1 = this.toCanvas(trail[i - 1].x, trail[i - 1].y);
            const p2 = this.toCanvas(trail[i].x, trail[i].y);
            const alpha = trail[i].alpha;
            
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineWidth = 1;  // Thinner trail
            // Parse color and apply alpha (more translucent)
            ctx.strokeStyle = color.replace(/[\d.]+\)$/, `${alpha * 0.3})`);
            ctx.stroke();
        }
    }
    
    // Draw rods (arms) of pendulum
    drawRods(pos, color) {
        const ctx = this.ctx;
        const origin = this.toCanvas(0, 0);
        const p1 = this.toCanvas(pos.x1, pos.y1);
        const p2 = this.toCanvas(pos.x2, pos.y2);
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        // First rod (origin to mass 1)
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        
        // Second rod (mass 1 to mass 2)
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
    
    // Draw mass circles
    drawMasses(pos, m1, m2, color1, color2) {
        const ctx = this.ctx;
        const p1 = this.toCanvas(pos.x1, pos.y1);
        const p2 = this.toCanvas(pos.x2, pos.y2);
        
        // Mass 1 (scaled by mass, with minimum size)
        const r1 = Math.max(6, Math.sqrt(m1) * 10);
        ctx.beginPath();
        ctx.arc(p1.x, p1.y, r1, 0, Math.PI * 2);
        ctx.fillStyle = color1;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // Mass 2 (scaled by mass, with minimum size)
        const r2 = Math.max(6, Math.sqrt(m2) * 10);
        ctx.beginPath();
        ctx.arc(p2.x, p2.y, r2, 0, Math.PI * 2);
        ctx.fillStyle = color2;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
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
        // Quantize initial states to 32-bit to match GPU
        if (options.initialState1) {
            this.state1 = {
                theta1: Math.fround(options.initialState1.theta1),
                theta2: Math.fround(options.initialState1.theta2),
                omega1: Math.fround(options.initialState1.omega1),
                omega2: Math.fround(options.initialState1.omega2)
            };
        }
        if (options.initialState2) {
            this.state2 = {
                theta1: Math.fround(options.initialState2.theta1),
                theta2: Math.fround(options.initialState2.theta2),
                omega1: Math.fround(options.initialState2.omega1),
                omega2: Math.fround(options.initialState2.omega2)
            };
        }
        if (options.l1 !== undefined) this.l1 = options.l1;
        if (options.l2 !== undefined) this.l2 = options.l2;
        if (options.m1 !== undefined) this.m1 = options.m1;
        if (options.m2 !== undefined) this.m2 = options.m2;
        if (options.dt !== undefined) this.dt = options.dt;
        if (options.threshold !== undefined) this.threshold = options.threshold;
        
        this.frameCount = 0;
        this.divergenceTime = null;
        this.diverged = false;
        this.trail1 = [];
        this.trail2 = [];
        this.energyHistory = [];
        
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
        // Cancel any pending animation frames
        this.trail1 = [];
        this.trail2 = [];
        this.energyHistory = [];
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUPendulumSimulation };
}
