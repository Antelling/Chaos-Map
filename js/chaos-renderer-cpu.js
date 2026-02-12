// CPU-Based Chaos Map Renderer with 64-bit Double Precision
// Generates chaos maps using CPU computation instead of WebGL for maximum precision

class CPUChaosMapRenderer {
    constructor(resolution = 1024) {
        this.resolution = resolution;
        this.maxIter = 20000;
        this.threshold = 0.05;
        this.dt = 0.002;
        this.g = 9.81;
        this.integrator = 'rk4'; // 'rk4' or 'verlet'
        this.perturbMode = 'fixed'; // 'fixed' or 'random'
        this.colorMapping = 0; // 0=rainbow, 1=heatmap, 2=viridis, 3=grayscale, 4=cyclic
        this.cyclePeriod = 500;
        this.hueMapping = 0; // 0=none, 1=divergence, 2=cycle
        
        // Perturbation configuration
        this.perturbFixed = {
            theta1: 0.00001, theta2: 0.00001, omega1: 0.00001, omega2: 0.00001,
            l1: 0.00001, l2: 0.00001, m1: 0.00001, m2: 0.00001
        };
        
        // For progress tracking
        this.shouldStop = false;
        this.isRendering = false;
    }
    
    // Generate a chaos map tile using CPU double precision
    // Returns ImageData
    renderTile(offsetX, offsetY, width, height, shaderParams) {
        const imageData = new ImageData(width, height);
        const data = imageData.data;
        
        const res = this.resolution;
        const dim1 = shaderParams.layerDims ? shaderParams.layerDims[0] : 'theta1';
        const dim2 = shaderParams.layerDims ? shaderParams.layerDims[1] : 'theta2';
        
        // Dimension to index mapping
        const dimToIndex = { theta1: 0, theta2: 1, omega1: 2, omega2: 3, l1: 4, l2: 5, m1: 6, m2: 7 };
        const idx1 = dimToIndex[dim1] ?? 0;
        const idx2 = dimToIndex[dim2] ?? 1;
        
        // Get layer parameters
        const scaleX = shaderParams.scaleX ?? 3.14;
        const scaleY = shaderParams.scaleY ?? 3.14;
        const centerX = shaderParams.centerX ?? 0;
        const centerY = shaderParams.centerY ?? 0;
        const deltaMode = shaderParams.deltaMode ? 1 : 0;
        
        // Fixed state for basis
        const fixedState = shaderParams.fixedState || [0, 0, 0, 0];
        
        // Base parameters
        const l1 = shaderParams.l1 ?? 1.0;
        const l2 = shaderParams.l2 ?? 1.0;
        const m1 = shaderParams.m1 ?? 1.0;
        const m2 = shaderParams.m2 ?? 1.0;
        
        // Perturbation values
        const pTheta1 = this.perturbFixed.theta1;
        const pTheta2 = this.perturbFixed.theta2;
        const pOmega1 = this.perturbFixed.omega1;
        const pOmega2 = this.perturbFixed.omega2;
        
        // For each pixel in the tile
        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                if (this.shouldStop) {
                    return imageData;
                }
                
                // Normalized coordinates
                const nx = (offsetX + px) / res;
                const ny = (offsetY + py) / res;
                
                // Compute mapped values
                const valX = centerX + (nx - 0.5) * 2 * scaleX;
                const valY = centerY + (ny - 0.5) * 2 * scaleY;
                
                // Build state
                let state1, state2;
                
                if (deltaMode) {
                    // Delta mode: add to basis state
                    const base = {
                        theta1: fixedState[0],
                        theta2: fixedState[1],
                        omega1: fixedState[2],
                        omega2: fixedState[3],
                        l1, l2, m1, m2
                    };
                    
                    state1 = { ...base };
                    state2 = { ...base };
                    
                    // Apply delta based on mapped dimensions
                    this.applyDimension(state1, idx1, valX);
                    this.applyDimension(state1, idx2, valY);
                    
                    this.applyDimension(state2, idx1, valX);
                    this.applyDimension(state2, idx2, valY);
                } else {
                    // Standard mode: fixed basis with mapped dimensions
                    state1 = {
                        theta1: idx1 === 0 ? valX : fixedState[0],
                        theta2: idx1 === 1 ? valX : (idx2 === 1 ? valY : fixedState[1]),
                        omega1: idx1 === 2 ? valX : (idx2 === 2 ? valY : fixedState[2]),
                        omega2: idx1 === 3 ? valX : (idx2 === 3 ? valY : fixedState[3]),
                        l1: idx1 === 4 ? valX : (idx2 === 4 ? valY : l1),
                        l2: idx1 === 5 ? valX : (idx2 === 5 ? valY : l2),
                        m1: idx1 === 6 ? valX : (idx2 === 6 ? valY : m1),
                        m2: idx1 === 7 ? valX : (idx2 === 7 ? valY : m2),
                    };
                    
                    state2 = { ...state1 };
                }
                
                // Apply perturbation
                state2.theta1 += pTheta1;
                state2.theta2 += pTheta2;
                state2.omega1 += pOmega1;
                state2.omega2 += pOmega2;
                
                // Run simulation to divergence
                const result = this.simulateToDivergence(state1, state2);
                
                // Get color
                const [r, g, b] = this.getColor(result.iteration, result.diverged, result.divergenceTime);
                
                // Set pixel
                const idx = (py * width + px) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 255;
            }
        }
        
        return imageData;
    }
    
    // Apply a value to a specific dimension of state
    applyDimension(state, idx, value) {
        switch(idx) {
            case 0: state.theta1 = value; break;
            case 1: state.theta2 = value; break;
            case 2: state.omega1 = value; break;
            case 3: state.omega2 = value; break;
            case 4: state.l1 = value; break;
            case 5: state.l2 = value; break;
            case 6: state.m1 = value; break;
            case 7: state.m2 = value; break;
        }
    }
    
    // Simulate two pendulums until divergence or max iterations
    simulateToDivergence(s1, s2) {
        const maxIter = this.maxIter;
        const threshold = this.threshold;
        const dt = this.dt;
        const g = this.g;
        
        // Copy states to avoid modifying inputs
        let state1 = { ...s1 };
        let state2 = { ...s2 };
        
        let iter = 0;
        let diverged = false;
        let divergenceTime = 0;
        
        while (iter < maxIter && !diverged) {
            // Step both pendulums
            if (this.integrator === 'verlet') {
                this.stepVerlet(state1, dt, g);
                this.stepVerlet(state2, dt, g);
            } else {
                this.stepRK4(state1, dt, g);
                this.stepRK4(state2, dt, g);
            }
            
            iter++;
            
            // Check divergence
            const dist = this.measureDivergence(state1, state2);
            if (dist > threshold) {
                diverged = true;
                divergenceTime = iter;
            }
        }
        
        return {
            iteration: iter,
            diverged: diverged,
            divergenceTime: divergenceTime
        };
    }
    
    // Velocity Verlet integration (64-bit double precision)
    stepVerlet(s, dt, g) {
        const halfDt = 0.5 * dt;
        
        // Current accelerations
        const acc1 = this.computeAccelerations(s, g);
        
        // Half-step velocity
        const omega1Half = s.omega1 + halfDt * acc1.alpha1;
        const omega2Half = s.omega2 + halfDt * acc1.alpha2;
        
        // Full position update
        s.theta1 += dt * omega1Half;
        s.theta2 += dt * omega2Half;
        s.omega1 = omega1Half;
        s.omega2 = omega2Half;
        
        // New accelerations
        const acc2 = this.computeAccelerations(s, g);
        
        // Final half-step velocity
        s.omega1 += halfDt * acc2.alpha1;
        s.omega2 += halfDt * acc2.alpha2;
    }
    
    // RK4 integration (64-bit double precision)
    stepRK4(s, dt, g) {
        const k1 = this.computeDerivatives(s, g);
        
        const s2 = {
            theta1: s.theta1 + 0.5 * dt * k1.dtheta1,
            theta2: s.theta2 + 0.5 * dt * k1.dtheta2,
            omega1: s.omega1 + 0.5 * dt * k1.domega1,
            omega2: s.omega2 + 0.5 * dt * k1.domega2,
            l1: s.l1, l2: s.l2, m1: s.m1, m2: s.m2
        };
        const k2 = this.computeDerivatives(s2, g);
        
        const s3 = {
            theta1: s.theta1 + 0.5 * dt * k2.dtheta1,
            theta2: s.theta2 + 0.5 * dt * k2.dtheta2,
            omega1: s.omega1 + 0.5 * dt * k2.domega1,
            omega2: s.omega2 + 0.5 * dt * k2.domega2,
            l1: s.l1, l2: s.l2, m1: s.m1, m2: s.m2
        };
        const k3 = this.computeDerivatives(s3, g);
        
        const s4 = {
            theta1: s.theta1 + dt * k3.dtheta1,
            theta2: s.theta2 + dt * k3.dtheta2,
            omega1: s.omega1 + dt * k3.domega1,
            omega2: s.omega2 + dt * k3.domega2,
            l1: s.l1, l2: s.l2, m1: s.m1, m2: s.m2
        };
        const k4 = this.computeDerivatives(s4, g);
        
        s.theta1 += dt * (k1.dtheta1 + 2*k2.dtheta1 + 2*k3.dtheta1 + k4.dtheta1) / 6;
        s.theta2 += dt * (k1.dtheta2 + 2*k2.dtheta2 + 2*k3.dtheta2 + k4.dtheta2) / 6;
        s.omega1 += dt * (k1.domega1 + 2*k2.domega1 + 2*k3.domega1 + k4.domega1) / 6;
        s.omega2 += dt * (k1.domega2 + 2*k2.domega2 + 2*k3.domega2 + k4.domega2) / 6;
    }
    
    // Compute accelerations (same physics as shader)
    computeAccelerations(s, g) {
        const M = s.m1 + s.m2;
        const delta = s.theta1 - s.theta2;
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        
        const alphaDenom = s.m1 + s.m2 * sinDelta * sinDelta;
        
        const num1 = -s.m2 * s.l1 * s.omega1 * s.omega1 * sinDelta * cosDelta
                   - s.m2 * s.l2 * s.omega2 * s.omega2 * sinDelta
                   - M * g * Math.sin(s.theta1)
                   + s.m2 * g * Math.sin(s.theta2) * cosDelta;
        
        const num2 = M * s.l1 * s.omega1 * s.omega1 * sinDelta
                   + s.m2 * s.l2 * s.omega2 * s.omega2 * sinDelta * cosDelta
                   + M * g * Math.sin(s.theta1) * cosDelta
                   - M * g * Math.sin(s.theta2);
        
        return {
            alpha1: num1 / (s.l1 * alphaDenom),
            alpha2: num2 / (s.l2 * alphaDenom)
        };
    }
    
    // Compute derivatives for RK4
    computeDerivatives(s, g) {
        const acc = this.computeAccelerations(s, g);
        return {
            dtheta1: s.omega1,
            dtheta2: s.omega2,
            domega1: acc.alpha1,
            domega2: acc.alpha2
        };
    }
    
    // Measure divergence between two states
    measureDivergence(s1, s2) {
        let dTheta1 = s1.theta1 - s2.theta1;
        let dTheta2 = s1.theta2 - s2.theta2;
        
        // Normalize angle differences
        if (dTheta1 > Math.PI) dTheta1 -= 2 * Math.PI;
        else if (dTheta1 < -Math.PI) dTheta1 += 2 * Math.PI;
        
        if (dTheta2 > Math.PI) dTheta2 -= 2 * Math.PI;
        else if (dTheta2 < -Math.PI) dTheta2 += 2 * Math.PI;
        
        const dOmega1 = s1.omega1 - s2.omega1;
        const dOmega2 = s1.omega2 - s2.omega2;
        
        return Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2);
    }
    
    // Get color for a given iteration count
    getColor(iteration, diverged, divergenceTime) {
        if (!diverged) {
            // No divergence - black
            return [0, 0, 0];
        }
        
        const t = divergenceTime / this.maxIter;
        
        switch (this.colorMapping) {
            case 0: // Rainbow
                return this.hslToRgb(t * 360, 1.0, 0.5);
            case 1: // Heatmap
                return this.heatmapColor(t);
            case 2: // Viridis
                return this.viridisColor(t);
            case 3: // Grayscale
                const v = Math.floor(t * 255);
                return [v, v, v];
            case 4: // Cyclic
                return this.cyclicColor(divergenceTime);
            default:
                return this.hslToRgb(t * 360, 1.0, 0.5);
        }
    }
    
    // HSL to RGB conversion
    hslToRgb(h, s, l) {
        h = h % 360;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        
        let r, g, b;
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        return [
            Math.floor((r + m) * 255),
            Math.floor((g + m) * 255),
            Math.floor((b + m) * 255)
        ];
    }
    
    // Heatmap color (black -> red -> yellow -> white)
    heatmapColor(t) {
        const r = Math.min(255, Math.floor(t * 3 * 255));
        const g = t < 0.33 ? 0 : Math.min(255, Math.floor((t - 0.33) * 3 * 255));
        const b = t < 0.66 ? 0 : Math.floor((t - 0.66) * 3 * 255);
        return [r, g, b];
    }
    
    // Viridis-like color map
    viridisColor(t) {
        // Simplified viridis approximation
        const r = Math.floor(68 + 72 * t + 109 * t * t);
        const g = Math.floor(1 + 128 * t + 120 * t * t);
        const b = Math.floor(84 + 53 * t + 119 * t * t);
        return [
            Math.min(255, r),
            Math.min(255, g),
            Math.min(255, b)
        ];
    }
    
    // Cyclic color based on period
    cyclicColor(iteration) {
        const hue = (iteration % this.cyclePeriod) / this.cyclePeriod * 360;
        return this.hslToRgb(hue, 1.0, 0.5);
    }
    
    // Stop rendering
    stop() {
        this.shouldStop = true;
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUChaosMapRenderer };
}
