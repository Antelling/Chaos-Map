// Chaos Map CPU Renderer WebWorker
// Runs 64-bit double precision physics in a separate thread

self.onmessage = function(e) {
    const { action, params } = e.data;
    
    if (action === 'renderTile') {
        const { offsetX, offsetY, width, height, resolution, shaderParams, config } = params;
        
        const imageData = renderTile(offsetX, offsetY, width, height, resolution, shaderParams, config);
        
        self.postMessage({
            action: 'tileComplete',
            params: { offsetX, offsetY, width, height, imageData }
        }, [imageData.data.buffer]);
    } else if (action === 'stop') {
        self.shouldStop = true;
    }
};

// Generate a chaos map tile using CPU double precision
function renderTile(offsetX, offsetY, width, height, resolution, shaderParams, config) {
    const imageData = new ImageData(width, height);
    const data = imageData.data;
    
    const res = resolution;
    const maxIter = config.maxIter;
    const threshold = config.threshold;
    const dt = config.dt;
    const g = config.g;
    const integrator = config.integrator;
    const colorMapping = config.colorMapping;
    const cyclePeriod = config.cyclePeriod;
    const perturbFixed = config.perturbFixed;
    
    const dim1 = shaderParams.layerDims ? shaderParams.layerDims[0] : 'theta1';
    const dim2 = shaderParams.layerDims ? shaderParams.layerDims[1] : 'theta2';
    
    const dimToIndex = { theta1: 0, theta2: 1, omega1: 2, omega2: 3, l1: 4, l2: 5, m1: 6, m2: 7 };
    const idx1 = dimToIndex[dim1] ?? 0;
    const idx2 = dimToIndex[dim2] ?? 1;
    
    const scaleX = shaderParams.scaleX ?? 3.14;
    const scaleY = shaderParams.scaleY ?? 3.14;
    const centerX = shaderParams.centerX ?? 0;
    const centerY = shaderParams.centerY ?? 0;
    const deltaMode = shaderParams.deltaMode ? 1 : 0;
    const fixedState = shaderParams.fixedState || [0, 0, 0, 0];
    
    const l1 = shaderParams.l1 ?? 1.0;
    const l2 = shaderParams.l2 ?? 1.0;
    const m1 = shaderParams.m1 ?? 1.0;
    const m2 = shaderParams.m2 ?? 1.0;
    
    const pTheta1 = perturbFixed.theta1;
    const pTheta2 = perturbFixed.theta2;
    const pOmega1 = perturbFixed.omega1;
    const pOmega2 = perturbFixed.omega2;
    
    for (let py = 0; py < height; py++) {
        for (let px = 0; px < width; px++) {
            if (self.shouldStop) {
                return imageData;
            }
            
            const nx = (offsetX + px) / res;
            const ny = (offsetY + py) / res;
            
            const valX = centerX + (nx - 0.5) * 2 * scaleX;
            const valY = centerY + (ny - 0.5) * 2 * scaleY;
            
            let state1, state2;
            
            if (deltaMode) {
                const base = {
                    theta1: fixedState[0],
                    theta2: fixedState[1],
                    omega1: fixedState[2],
                    omega2: fixedState[3],
                    l1, l2, m1, m2
                };
                
                state1 = { ...base };
                state2 = { ...base };
                
                applyDimension(state1, idx1, valX);
                applyDimension(state1, idx2, valY);
                applyDimension(state2, idx1, valX);
                applyDimension(state2, idx2, valY);
            } else {
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
            
            state2.theta1 += pTheta1;
            state2.theta2 += pTheta2;
            state2.omega1 += pOmega1;
            state2.omega2 += pOmega2;
            
            const result = simulateToDivergence(state1, state2, maxIter, threshold, dt, g, integrator);
            const [r, gVal, b] = getColor(result.iteration, result.diverged, result.divergenceTime, maxIter, colorMapping, cyclePeriod);
            
            const idx = (py * width + px) * 4;
            data[idx] = r;
            data[idx + 1] = gVal;
            data[idx + 2] = b;
            data[idx + 3] = 255;
        }
    }
    
    return imageData;
}

function applyDimension(state, idx, value) {
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

function simulateToDivergence(s1, s2, maxIter, threshold, dt, g, integrator) {
    let state1 = { ...s1 };
    let state2 = { ...s2 };
    
    let iter = 0;
    let diverged = false;
    let divergenceTime = 0;
    
    while (iter < maxIter && !diverged) {
        if (integrator === 'verlet') {
            stepVerlet(state1, dt, g);
            stepVerlet(state2, dt, g);
        } else {
            stepRK4(state1, dt, g);
            stepRK4(state2, dt, g);
        }
        
        iter++;
        
        const dist = measureDivergence(state1, state2);
        if (dist > threshold) {
            diverged = true;
            divergenceTime = iter;
        }
    }
    
    return { iteration: iter, diverged, divergenceTime };
}

function stepVerlet(s, dt, g) {
    const halfDt = 0.5 * dt;
    
    const acc1 = computeAccelerations(s, g);
    
    const omega1Half = s.omega1 + halfDt * acc1.alpha1;
    const omega2Half = s.omega2 + halfDt * acc1.alpha2;
    
    s.theta1 += dt * omega1Half;
    s.theta2 += dt * omega2Half;
    s.omega1 = omega1Half;
    s.omega2 = omega2Half;
    
    const acc2 = computeAccelerations(s, g);
    
    s.omega1 += halfDt * acc2.alpha1;
    s.omega2 += halfDt * acc2.alpha2;
}

function stepRK4(s, dt, g) {
    const k1 = computeDerivatives(s, g);
    
    const s2 = {
        theta1: s.theta1 + 0.5 * dt * k1.dtheta1,
        theta2: s.theta2 + 0.5 * dt * k1.dtheta2,
        omega1: s.omega1 + 0.5 * dt * k1.domega1,
        omega2: s.omega2 + 0.5 * dt * k1.domega2,
        l1: s.l1, l2: s.l2, m1: s.m1, m2: s.m2
    };
    const k2 = computeDerivatives(s2, g);
    
    const s3 = {
        theta1: s.theta1 + 0.5 * dt * k2.dtheta1,
        theta2: s.theta2 + 0.5 * dt * k2.dtheta2,
        omega1: s.omega1 + 0.5 * dt * k2.domega1,
        omega2: s.omega2 + 0.5 * dt * k2.domega2,
        l1: s.l1, l2: s.l2, m1: s.m1, m2: s.m2
    };
    const k3 = computeDerivatives(s3, g);
    
    const s4 = {
        theta1: s.theta1 + dt * k3.dtheta1,
        theta2: s.theta2 + dt * k3.dtheta2,
        omega1: s.omega1 + dt * k3.domega1,
        omega2: s.omega2 + dt * k3.domega2,
        l1: s.l1, l2: s.l2, m1: s.m1, m2: s.m2
    };
    const k4 = computeDerivatives(s4, g);
    
    s.theta1 += dt * (k1.dtheta1 + 2*k2.dtheta1 + 2*k3.dtheta1 + k4.dtheta1) / 6;
    s.theta2 += dt * (k1.dtheta2 + 2*k2.dtheta2 + 2*k3.dtheta2 + k4.dtheta2) / 6;
    s.omega1 += dt * (k1.domega1 + 2*k2.domega1 + 2*k3.domega1 + k4.domega1) / 6;
    s.omega2 += dt * (k1.domega2 + 2*k2.domega2 + 2*k3.domega2 + k4.domega2) / 6;
}

function computeAccelerations(s, g) {
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

function computeDerivatives(s, g) {
    const acc = computeAccelerations(s, g);
    return {
        dtheta1: s.omega1,
        dtheta2: s.omega2,
        domega1: acc.alpha1,
        domega2: acc.alpha2
    };
}

function measureDivergence(s1, s2) {
    let dTheta1 = s1.theta1 - s2.theta1;
    let dTheta2 = s1.theta2 - s2.theta2;
    
    if (dTheta1 > Math.PI) dTheta1 -= 2 * Math.PI;
    else if (dTheta1 < -Math.PI) dTheta1 += 2 * Math.PI;
    
    if (dTheta2 > Math.PI) dTheta2 -= 2 * Math.PI;
    else if (dTheta2 < -Math.PI) dTheta2 += 2 * Math.PI;
    
    const dOmega1 = s1.omega1 - s2.omega1;
    const dOmega2 = s1.omega2 - s2.omega2;
    
    return Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2);
}

function getColor(iteration, diverged, divergenceTime, maxIter, colorMapping, cyclePeriod) {
    if (!diverged) {
        return [0, 0, 0];
    }
    
    const t = divergenceTime / maxIter;
    
    switch (colorMapping) {
        case 0: return hslToRgb(t * 360, 1.0, 0.5);
        case 1: return heatmapColor(t);
        case 2: return viridisColor(t);
        case 3: return [Math.floor(t * 255), Math.floor(t * 255), Math.floor(t * 255)];
        case 4: return hslToRgb((divergenceTime % cyclePeriod) / cyclePeriod * 360, 1.0, 0.5);
        default: return hslToRgb(t * 360, 1.0, 0.5);
    }
}

function hslToRgb(h, s, l) {
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

function heatmapColor(t) {
    const r = Math.min(255, Math.floor(t * 3 * 255));
    const g = t < 0.33 ? 0 : Math.min(255, Math.floor((t - 0.33) * 3 * 255));
    const b = t < 0.66 ? 0 : Math.floor((t - 0.66) * 3 * 255);
    return [r, g, b];
}

function viridisColor(t) {
    const r = Math.floor(68 + 72 * t + 109 * t * t);
    const g = Math.floor(1 + 128 * t + 120 * t * t);
    const b = Math.floor(84 + 53 * t + 119 * t * t);
    return [
        Math.min(255, r),
        Math.min(255, g),
        Math.min(255, b)
    ];
}
