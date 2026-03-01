// Chaos Map CPU Renderer WebWorker
// Runs 64-bit double precision physics in a separate thread
// Uses shared cpu-physics.js engine

importScripts('cpu-physics.js');

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
    
    const s = config.perturbScale ?? 1.0;
    const pTheta1 = perturbFixed.theta1 * s;
    const pTheta2 = perturbFixed.theta2 * s;
    const pOmega1 = perturbFixed.omega1 * s;
    const pOmega2 = perturbFixed.omega2 * s;
    
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
            
            // Use shared physics engine
            const result = self.CPUPhysics.simulateToDivergence(
                state1, state2, maxIter, threshold, dt, g, integrator
            );
            
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
