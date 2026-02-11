// Double Pendulum Chaos Map - Layer-based Transformation Pipeline
// Each layer maps viewport (x,y) to outputs on two dimensions of pendulum state
// Sampled points are stored between layers as basis states

// Simplified dimension pairs - only 4 options
const DIMENSION_PAIRS = [
    { id: 'theta1_theta2', name: 'Angles (θ₁, θ₂)', dims: ['theta1', 'theta2'], defaults: { min1: -3.14, max1: 3.14, min2: -3.14, max2: 3.14 } },
    { id: 'omega1_omega2', name: 'Angular Velocities (ω₁, ω₂)', dims: ['omega1', 'omega2'], defaults: { min1: -10, max1: 10, min2: -10, max2: 10 } },
    { id: 'l1_l2', name: 'Lengths (L₁, L₂)', dims: ['l1', 'l2'], defaults: { min1: 0.1, max1: 3, min2: 0.1, max2: 3 } },
    { id: 'm1_m2', name: 'Masses (m₁, m₂)', dims: ['m1', 'm2'], defaults: { min1: 0.1, max1: 5, min2: 0.1, max2: 5 } }
];

// Dimension info for display
const DIM_INFO = {
    theta1: { label: 'θ₁', unit: 'rad' },
    theta2: { label: 'θ₂', unit: 'rad' },
    omega1: { label: 'ω₁', unit: 'rad/s' },
    omega2: { label: 'ω₂', unit: 'rad/s' },
    l1: { label: 'L₁', unit: 'm' },
    l2: { label: 'L₂', unit: 'm' },
    m1: { label: 'm₁', unit: 'kg' },
    m2: { label: 'm₂', unit: 'kg' }
};

// Default/null pendulum state
const NULL_STATE = {
    theta1: 0,
    theta2: 0,
    omega1: 0,
    omega2: 0,
    l1: 1,
    l2: 1,
    m1: 1,
    m2: 1
};

// A Layer maps (x,y) to output values on two dimensions
class TransformLayer {
    constructor(dim1, dim2, min1, max1, min2, max2) {
        this.id = Date.now() + Math.random().toString(36).substr(2, 9);
        this.type = 'layer';
        
        // Support both old format (typeId string) and new format (individual dims)
        if (arguments.length === 1 && typeof dim1 === 'string' && dim1.includes('_')) {
            // Old format: 'theta1_theta2'
            this.layerType = dim1;
            const pairDef = DIMENSION_PAIRS.find(p => p.id === dim1);
            this.dim1 = pairDef ? pairDef.dims[0] : 'theta1';
            this.dim2 = pairDef ? pairDef.dims[1] : 'theta2';
            const defaults = pairDef ? pairDef.defaults : { min1: -3.14, max1: 3.14, min2: -3.14, max2: 3.14 };
            this.min1 = arguments[1] !== undefined ? arguments[1] : defaults.min1;
            this.max1 = arguments[2] !== undefined ? arguments[2] : defaults.max1;
            this.min2 = arguments[3] !== undefined ? arguments[3] : defaults.min2;
            this.max2 = arguments[4] !== undefined ? arguments[4] : defaults.max2;
        } else {
            // New format: individual dimensions
            this.dim1 = dim1 || 'theta1';
            this.dim2 = dim2 || 'theta2';
            this.layerType = this.dim1 + '_' + this.dim2;
            this.min1 = min1 !== undefined ? min1 : -3.14;
            this.max1 = max1 !== undefined ? max1 : 3.14;
            this.min2 = min2 !== undefined ? min2 : -3.14;
            this.max2 = max2 !== undefined ? max2 : 3.14;
        }
    }
    
    get name() {
        const dim1Info = DIM_INFO[this.dim1];
        const dim2Info = DIM_INFO[this.dim2];
        return `${dim1Info?.label || this.dim1} × ${dim2Info?.label || this.dim2}`;
    }
    
    // Compute output for a given viewport position (nx, ny in [0,1])
    // Linear transform: viewport [0,1] maps to [min, max]
    computeOutput(nx, ny) {
        // Linear interpolation from viewport [0,1] to [min, max]
        const val1 = this.min1 + nx * (this.max1 - this.min1);
        const val2 = this.min2 + ny * (this.max2 - this.min2);
        
        return {
            [this.dim1]: val1,
            [this.dim2]: val2,
            dim1: this.dim1,
            dim2: this.dim2
        };
    }
    
    serialize() {
        return {
            type: 'layer',
            dim1: this.dim1,
            dim2: this.dim2,
            min1: this.min1,
            max1: this.max1,
            min2: this.min2,
            max2: this.max2
        };
    }
    
    static deserialize(data) {
        if (data.dim1 && data.dim2) {
            return new TransformLayer(data.dim1, data.dim2, data.min1, data.max1, data.min2, data.max2);
        }
        // Legacy support
        return new TransformLayer(data.layerType, data.min1, data.max1, data.min2, data.max2);
    }
}

// A SampledPoint stores a full pendulum state (result of previous layer)
class SampledPoint {
    constructor(state) {
        this.id = Date.now() + Math.random().toString(36).substr(2, 9);
        this.type = 'sampled';
        this.state = { ...state }; // Full pendulum state
    }
    
    get name() {
        return `📍 Sampled State`;
    }
    
    // Format state for display
    getStateDisplay() {
        const s = this.state;
        return `θ₁=${s.theta1.toFixed(2)} θ₂=${s.theta2.toFixed(2)} ω₁=${s.omega1.toFixed(2)} ω₂=${s.omega2.toFixed(2)} L₁=${s.l1.toFixed(2)} L₂=${s.l2.toFixed(2)} m₁=${s.m1.toFixed(2)} m₂=${s.m2.toFixed(2)}`;
    }
    
    serialize() {
        return {
            type: 'sampled',
            state: { ...this.state }
        };
    }
    
    static deserialize(data) {
        return new SampledPoint(data.state);
    }
}

// The transformation stack manages layers and sampled points
// Structure: [Sampled, Layer, Sampled, Layer, ...] always ends with Layer
class TransformationStack {
    constructor() {
        // Stack always starts with a sampled point at null state
        // followed by the default theta mapping layer
        this.items = [
            new SampledPoint(NULL_STATE),
            new TransformLayer('theta1_theta2')
        ];
    }
    
    // Get all items
    getItems() {
        return [...this.items];
    }
    
    // Get the last layer (most recent transformation)
    getLastLayer() {
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (this.items[i].type === 'layer') {
                return this.items[i];
            }
        }
        return null;
    }
    
    // Get the last sampled point (basis for current transformation)
    getLastSampledPoint() {
        for (let i = this.items.length - 1; i >= 0; i--) {
            if (this.items[i].type === 'sampled') {
                return this.items[i];
            }
        }
        return this.items[0]; // Should always have at least the initial one
    }
    
    // Add a new layer with a sampled point at the specified viewport position
    // This is the new workflow: select layer type, click map, creates both layer + sampled point
    addLayerWithSampledPoint(layerType, nx, ny) {
        // First, compute the state at the clicked position using the CURRENT top layer
        // This becomes the new sampled point
        const state = this.computeState(nx, ny);
        const sampledPoint = new SampledPoint(state);
        
        // Create the new layer with defaults
        const newLayer = new TransformLayer(layerType);
        
        // Add both to stack
        this.items.push(sampledPoint);
        this.items.push(newLayer);
        
        return { sampledPoint, newLayer };
    }
    
    // Remove item at index
    removeItem(index) {
        // Don't allow removing the initial sampled point
        if (index === 0) return false;
        
        this.items.splice(index, 1);
        
        // Ensure stack always alternates: sampled, layer, sampled, layer...
        // and starts with sampled, ends with layer
        this.rebalanceStack();
        return true;
    }
    
    // Rebalance stack to maintain alternating pattern
    rebalanceStack() {
        // Remove consecutive items of same type, keeping the later one
        for (let i = this.items.length - 1; i > 0; i--) {
            if (this.items[i].type === this.items[i-1].type) {
                this.items.splice(i-1, 1);
            }
        }
        
        // Ensure starts with sampled
        if (this.items.length > 0 && this.items[0].type !== 'sampled') {
            this.items.unshift(new SampledPoint(NULL_STATE));
        }
        
        // Ensure ends with layer
        if (this.items.length > 0 && this.items[this.items.length - 1].type !== 'layer') {
            // Remove trailing sampled point if no layer after it
            this.items.pop();
        }
        
        // If stack is now empty or only has sampled point, add default layer
        if (this.items.length === 0 || 
            (this.items.length === 1 && this.items[0].type === 'sampled')) {
            this.items.push(new TransformLayer('theta1_theta2'));
        }
    }
    
    // Compute pendulum state at viewport position (nx, ny)
    // Uses last sampled point as basis + last layer's output
    computeState(nx, ny) {
        const basis = this.getLastSampledPoint().state;
        const layer = this.getLastLayer();
        
        if (!layer) return { ...basis };
        
        const output = layer.computeOutput(nx, ny);
        if (!output) return { ...basis };
        
        const result = { ...basis };
        result[output.dim1] = output[output.dim1];
        result[output.dim2] = output[output.dim2];
        
        // Clamp physical values
        if (result.l1 < 0.1) result.l1 = 0.1;
        if (result.l2 < 0.1) result.l2 = 0.1;
        if (result.m1 < 0.1) result.m1 = 0.1;
        if (result.m2 < 0.1) result.m2 = 0.1;
        
        return result;
    }
    
    // Compute what the state would be if we added a new layer at position (nx, ny)
    // Used for preview before actually adding
    computePreviewState(layerType, nx, ny) {
        // First compute state at position using current top layer (this would be the new sampled point)
        const basisState = this.computeState(nx, ny);
        
        // Create a temporary layer to see what values it would output at center (0.5, 0.5)
        const tempLayer = new TransformLayer(layerType);
        const output = tempLayer.computeOutput(0.5, 0.5);
        
        const result = { ...basisState };
        if (output) {
            result[output.dim1] = output[output.dim1];
            result[output.dim2] = output[output.dim2];
        }
        
        return result;
    }
    
    // Get shader parameters for rendering
    getShaderParams() {
        const layer = this.getLastLayer();
        const basis = this.getLastSampledPoint().state;
        
        if (!layer || !layer.dim1) {
            // Default to position map
            return {
                mode: 0,
                fixedState: [0, 0, 0, 0],
                l1: basis.l1,
                l2: basis.l2,
                m1: basis.m1,
                m2: basis.m2
            };
        }
        
        const dim1 = layer.dim1;
        const dim2 = layer.dim2;
        
        // Determine mode and parameters based on which dimensions are being mapped
        let mode = 0; // 0 = position (theta), 1 = velocity, 2 = length, 3 = mass
        let fixedState = [0, 0, 0, 0];
        let outL1 = basis.l1;
        let outL2 = basis.l2;
        let outM1 = basis.m1;
        let outM2 = basis.m2;
        
        // Check if we're mapping angles
        const hasTheta1 = dim1 === 'theta1' || dim2 === 'theta1';
        const hasTheta2 = dim1 === 'theta2' || dim2 === 'theta2';
        const hasOmega1 = dim1 === 'omega1' || dim2 === 'omega1';
        const hasOmega2 = dim1 === 'omega2' || dim2 === 'omega2';
        const hasL1 = dim1 === 'l1' || dim2 === 'l1';
        const hasL2 = dim1 === 'l2' || dim2 === 'l2';
        const hasM1 = dim1 === 'm1' || dim2 === 'm1';
        const hasM2 = dim1 === 'm2' || dim2 === 'm2';
        
        // Calculate scale factors based on min/max ranges
        // The shader expects scaleX/Y as half-ranges (delta from center)
        const scaleX = (layer.max1 - layer.min1) / 2;
        const scaleY = (layer.max2 - layer.min2) / 2;
        
        if (hasTheta1 || hasTheta2) {
            mode = 0; // Position mode
            fixedState[0] = basis.theta1;
            fixedState[1] = basis.theta2;
        } else if (hasOmega1 || hasOmega2) {
            mode = 1; // Velocity mode
            fixedState[0] = basis.theta1;
            fixedState[1] = basis.theta2;
            fixedState[2] = basis.omega1;
            fixedState[3] = basis.omega2;
        } else if (hasL1 || hasL2) {
            mode = 2; // Length mode
            fixedState[0] = basis.theta1;
            fixedState[1] = basis.theta2;
            fixedState[2] = basis.omega1;
            fixedState[3] = basis.omega2;
            if (hasL1) outL1 = basis.l1;
            if (hasL2) outL2 = basis.l2;
        } else if (hasM1 || hasM2) {
            mode = 3; // Mass mode
            fixedState[0] = basis.theta1;
            fixedState[1] = basis.theta2;
            fixedState[2] = basis.omega1;
            fixedState[3] = basis.omega2;
            if (hasM1) outM1 = basis.m1;
            if (hasM2) outM2 = basis.m2;
        }
        
        return {
            mode,
            fixedState,
            scaleX,
            scaleY,
            centerX: (layer.min1 + layer.max1) / 2,
            centerY: (layer.min2 + layer.max2) / 2,
            l1: outL1,
            l2: outL2,
            m1: outM1,
            m2: outM2,
            layerDims: [dim1, dim2]
        };
    }
    
    serialize() {
        return this.items.map(item => item.serialize());
    }
    
    static deserialize(data) {
        const stack = new TransformationStack();
        stack.items = data.map(item => {
            if (item.type === 'layer') return TransformLayer.deserialize(item);
            if (item.type === 'sampled') return SampledPoint.deserialize(item);
            return null;
        }).filter(x => x);
        stack.rebalanceStack();
        return stack;
    }
}


// GPU-Based Double Pendulum Simulation
// Simulates two pendulums simultaneously on the GPU using transform feedback or ping-pong FBOs
// Simplified GPU-Rendering Pendulum Simulation with Verlet Integrator
// Uses CPU for physics (Verlet integrator) and GPU for rendering
class GPUPendulumSimulation {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', {
            antialias: true,
            preserveDrawingBuffer: true
        });
        
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }
        
        // Physics parameters
        this.g = options.g || 9.81;
        this.dt = options.dt || 0.01;
        this.l1 = options.l1 || 1.0;
        this.l2 = options.l2 || 1.0;
        this.m1 = options.m1 || 1.0;
        this.m2 = options.m2 || 1.0;
        this.integrator = options.integrator || 'verlet'; // 'rk4' or 'verlet'
        
        // Initial states for both pendulums
        this.initialState1 = options.initialState1 || { theta1: 1.0, theta2: 0.5, omega1: 0, omega2: 0 };
        this.initialState2 = options.initialState2 || { 
            theta1: 1.0 + (options.perturb?.theta1 || 0.0001), 
            theta2: 0.5 + (options.perturb?.theta2 || 0.0001), 
            omega1: (options.perturb?.omega1 || 0), 
            omega2: (options.perturb?.omega2 || 0) 
        };
        
        // Current states (CPU-side)
        this.state1 = { ...this.initialState1 };
        this.state2 = { ...this.initialState2 };
        
        // Simulation state
        this.frameCount = 0;
        this.divergenceTime = null;
        this.threshold = options.threshold || 0.5;
        this.diverged = false;
        
        // Trail buffers for each pendulum
        this.maxTrailLength = 400;
        this.trail1 = [];
        this.trail2 = [];
        
        // Initialize WebGL resources
        this.init();
    }
    
    init() {
        const gl = this.gl;
        
        // Create trail VBOs
        this.trailBuffer1 = gl.createBuffer();
        this.trailBuffer2 = gl.createBuffer();
        this.lineBuffer = gl.createBuffer();
        
        // Initialize state
        this.reset();
    }
    
    reset() {
        this.frameCount = 0;
        this.divergenceTime = null;
        this.diverged = false;
        this.trail1 = [];
        this.trail2 = [];
        this.state1 = { ...this.initialState1 };
        this.state2 = { ...this.initialState2 };
    }
    
    // Compute accelerations (same as shader)
    computeAccelerations(s) {
        const { l1, l2, m1, m2, g } = this;
        const delta = s.theta1 - s.theta2;
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        
        const M = m1 + m2;
        const alphaDenom = m1 + m2 * sinDelta * sinDelta;
        
        const num1 = -m2 * l1 * s.omega1 * s.omega1 * sinDelta * cosDelta
                   - m2 * l2 * s.omega2 * s.omega2 * sinDelta
                   - M * g * Math.sin(s.theta1)
                   + m2 * g * Math.sin(s.theta2) * cosDelta;
        
        const num2 = M * l1 * s.omega1 * s.omega1 * sinDelta
                   + m2 * l2 * s.omega2 * s.omega2 * sinDelta * cosDelta
                   + M * g * Math.sin(s.theta1) * cosDelta
                   - M * g * Math.sin(s.theta2);
        
        return {
            alpha1: num1 / (l1 * alphaDenom),
            alpha2: num2 / (l2 * alphaDenom)
        };
    }
    
    // Velocity Verlet integrator - symplectic, preserves energy
    stepVerlet(s) {
        const dt = this.dt;
        const halfDt = 0.5 * dt;
        
        // Current accelerations
        const a = this.computeAccelerations(s);
        
        // Half-step velocity
        const omega1_half = s.omega1 + halfDt * a.alpha1;
        const omega2_half = s.omega2 + halfDt * a.alpha2;
        
        // Full position update
        const next = {
            theta1: s.theta1 + dt * omega1_half,
            theta2: s.theta2 + dt * omega2_half,
            omega1: omega1_half,
            omega2: omega2_half
        };
        
        // New accelerations at updated positions
        const a2 = this.computeAccelerations(next);
        
        // Final half-step velocity update
        next.omega1 += halfDt * a2.alpha1;
        next.omega2 += halfDt * a2.alpha2;
        
        return next;
    }
    
    // RK4 integrator
    stepRK4(s) {
        const dt = this.dt;
        
        const computeDerivs = (state) => {
            const a = this.computeAccelerations(state);
            return {
                dtheta1: state.omega1,
                dtheta2: state.omega2,
                domega1: a.alpha1,
                domega2: a.alpha2
            };
        };
        
        const k1 = computeDerivs(s);
        
        const s2 = {
            theta1: s.theta1 + 0.5 * dt * k1.dtheta1,
            theta2: s.theta2 + 0.5 * dt * k1.dtheta2,
            omega1: s.omega1 + 0.5 * dt * k1.domega1,
            omega2: s.omega2 + 0.5 * dt * k1.domega2
        };
        const k2 = computeDerivs(s2);
        
        const s3 = {
            theta1: s.theta1 + 0.5 * dt * k2.dtheta1,
            theta2: s.theta2 + 0.5 * dt * k2.dtheta2,
            omega1: s.omega1 + 0.5 * dt * k2.domega1,
            omega2: s.omega2 + 0.5 * dt * k2.domega2
        };
        const k3 = computeDerivs(s3);
        
        const s4 = {
            theta1: s.theta1 + dt * k3.dtheta1,
            theta2: s.theta2 + dt * k3.dtheta2,
            omega1: s.omega1 + dt * k3.domega1,
            omega2: s.omega2 + dt * k3.domega2
        };
        const k4 = computeDerivs(s4);
        
        return {
            theta1: s.theta1 + dt * (k1.dtheta1 + 2*k2.dtheta1 + 2*k3.dtheta1 + k4.dtheta1) / 6,
            theta2: s.theta2 + dt * (k1.dtheta2 + 2*k2.dtheta2 + 2*k3.dtheta2 + k4.dtheta2) / 6,
            omega1: s.omega1 + dt * (k1.domega1 + 2*k2.domega1 + 2*k3.domega1 + k4.domega1) / 6,
            omega2: s.omega2 + dt * (k1.domega2 + 2*k2.domega2 + 2*k3.domega2 + k4.domega2) / 6
        };
    }
    
    // Step physics based on selected integrator
    stepPhysics(s) {
        if (this.integrator === 'verlet') {
            return this.stepVerlet(s);
        }
        return this.stepRK4(s);
    }
    
    // Check divergence between the two pendulums
    checkDivergence() {
        if (this.diverged) return;
        
        const s1 = this.state1;
        const s2 = this.state2;
        
        // Calculate divergence with angle normalization
        let dTheta1 = s1.theta1 - s2.theta1;
        let dTheta2 = s1.theta2 - s2.theta2;
        
        while (dTheta1 > Math.PI) dTheta1 -= 2 * Math.PI;
        while (dTheta1 < -Math.PI) dTheta1 += 2 * Math.PI;
        while (dTheta2 > Math.PI) dTheta2 -= 2 * Math.PI;
        while (dTheta2 < -Math.PI) dTheta2 += 2 * Math.PI;
        
        const dOmega1 = s1.omega1 - s2.omega1;
        const dOmega2 = s1.omega2 - s2.omega2;
        
        const dist = Math.sqrt(dTheta1*dTheta1 + dTheta2*dTheta2 + dOmega1*dOmega1 + dOmega2*dOmega2);
        
        if (dist > this.threshold) {
            this.diverged = true;
            this.divergenceTime = this.frameCount;
        }
    }
    
    // Update trail positions
    updateTrails() {
        const calcPos = (s) => {
            const x1 = this.l1 * Math.sin(s.theta1);
            const y1 = this.l1 * Math.cos(s.theta1);
            const x2 = x1 + this.l2 * Math.sin(s.theta2);
            const y2 = y1 + this.l2 * Math.cos(s.theta2);
            return { x2, y2 };
        };
        
        this.trail1.push(calcPos(this.state1));
        this.trail2.push(calcPos(this.state2));
        
        if (this.trail1.length > this.maxTrailLength) {
            this.trail1.shift();
            this.trail2.shift();
        }
    }
    
    // Step the simulation
    step(steps = 1) {
        for (let i = 0; i < steps; i++) {
            this.state1 = this.stepPhysics(this.state1);
            this.state2 = this.stepPhysics(this.state2);
            this.frameCount++;
        }
        
        // Check divergence every 10 frames
        if (this.frameCount % 10 === 0) {
            this.checkDivergence();
        }
        
        this.updateTrails();
    }
    
    // Render using WebGL
    render() {
        const gl = this.gl;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        gl.viewport(0, 0, w, h);
        gl.clearColor(0.04, 0.04, 0.04, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Calculate scale to fit pendulum in view
        const maxExtent = this.l1 + this.l2;
        const minDimension = Math.min(w, h);
        const scale = (minDimension * 0.6) / Math.max(maxExtent, 1.0);
        const centerX = w / 2;
        const centerY = h / 2 - (maxExtent * scale) / 4; // Center vertically with slight offset
        
        // Render trails
        this.renderTrails(scale, centerX, centerY);
        
        // Render pendulums
        this.renderPendulums(scale, centerX, centerY);
    }
    
    renderTrails(scale, centerX, centerY) {
        const gl = this.gl;
        if (this.trail1.length < 2) return;
        
        // Create shader - matches pendulum shader coordinate system
        const vsSource = `
            attribute vec2 a_position;
            uniform vec2 u_resolution;
            uniform vec2 u_center;
            uniform float u_scale;
            void main() {
                // Flip y so pendulum hangs downward (matching renderPendulums)
                vec2 pos = u_center + vec2(a_position.x, -a_position.y) * u_scale;
                vec2 clipPos = (pos / u_resolution) * 2.0 - 1.0;
                gl_Position = vec4(clipPos.x, -clipPos.y, 0.0, 1.0);
            }
        `;
        const fsSource = `
            precision mediump float;
            uniform vec3 u_color;
            uniform float u_alpha;
            void main() {
                gl_FragColor = vec4(u_color, u_alpha);
            }
        `;
        
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        };
        
        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);
        
        gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_center'), centerX, centerY);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_scale'), scale);
        
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        
        // Trail 1 - use physics coords directly (y positive = down)
        const t1 = [];
        for (let i = 0; i < this.trail1.length; i++) {
            t1.push(this.trail1[i].x2, this.trail1[i].y2);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuffer1);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(t1), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), 0.4, 0.7, 1.0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_alpha'), 0.6);
        gl.drawArrays(gl.LINE_STRIP, 0, this.trail1.length);
        
        // Trail 2
        const t2 = [];
        for (let i = 0; i < this.trail2.length; i++) {
            t2.push(this.trail2[i].x2, this.trail2[i].y2);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.trailBuffer2);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(t2), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), 1.0, 0.5, 0.2);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_alpha'), 0.6);
        gl.drawArrays(gl.LINE_STRIP, 0, this.trail2.length);
        
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteProgram(prog);
    }
    
    renderPendulums(scale, centerX, centerY) {
        const gl = this.gl;
        
        // Calculate positions in physics space
        // Physics: y increases downward (gravity direction), but we flip for display
        const calcPos = (s) => {
            const x1 = this.l1 * Math.sin(s.theta1);
            const y1 = this.l1 * Math.cos(s.theta1);
            const x2 = x1 + this.l2 * Math.sin(s.theta2);
            const y2 = y1 + this.l2 * Math.cos(s.theta2);
            return { x1, y1, x2, y2 };
        };
        
        const p1 = calcPos(this.state1);
        const p2 = calcPos(this.state2);
        
        // Shader - converts physics coordinates to clip space
        const vsSource = `
            attribute vec2 a_position;
            uniform vec2 u_resolution;
            uniform vec2 u_center;
            uniform float u_scale;
            void main() {
                // a_position is in physics coords (x right, y down)
                // We flip y here so pendulum hangs downward
                vec2 pos = u_center + vec2(a_position.x, -a_position.y) * u_scale;
                vec2 clipPos = (pos / u_resolution) * 2.0 - 1.0;
                gl_Position = vec4(clipPos.x, -clipPos.y, 0.0, 1.0);
            }
        `;
        const fsSource = `
            precision mediump float;
            uniform vec3 u_color;
            uniform float u_alpha;
            void main() {
                gl_FragColor = vec4(u_color, u_alpha);
            }
        `;
        
        const compile = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            return s;
        };
        
        const vs = compile(gl.VERTEX_SHADER, vsSource);
        const fs = compile(gl.FRAGMENT_SHADER, fsSource);
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        gl.useProgram(prog);
        
        gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), this.canvas.width, this.canvas.height);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_center'), centerX, centerY);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_scale'), scale);
        
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
        
        // Pendulum 1 rods (cyan)
        gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), 0.4, 0.9, 1.0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_alpha'), 1.0);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 0, p1.x1, p1.y1,
            p1.x1, p1.y1, p1.x2, p1.y2
        ]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, 4);
        
        // Pendulum 2 rods (orange)
        gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), 1.0, 0.5, 0.2);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_alpha'), 0.85);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 0, p2.x1, p2.y1,
            p2.x1, p2.y1, p2.x2, p2.y2
        ]), gl.STATIC_DRAW);
        gl.drawArrays(gl.LINES, 0, 4);
        
        // Draw mass circles for pendulum 1
        this.drawCircle(gl, prog, p1.x1, p1.y1, Math.max(4, 3 + this.m1 * 1.5), [0.3, 0.8, 1.0, 1.0]);
        this.drawCircle(gl, prog, p1.x2, p1.y2, Math.max(5, 4 + this.m2 * 1.5), [0.3, 0.8, 1.0, 1.0]);
        
        // Draw mass circles for pendulum 2
        this.drawCircle(gl, prog, p2.x1, p2.y1, Math.max(4, 3 + this.m1 * 1.5), [1.0, 0.4, 0.1, 0.85]);
        this.drawCircle(gl, prog, p2.x2, p2.y2, Math.max(5, 4 + this.m2 * 1.5), [1.0, 0.4, 0.1, 0.85]);
        
        // Draw pivot point
        this.drawCircle(gl, prog, 0, 0, 4, [0.9, 0.9, 0.9, 1.0]);
        
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        gl.deleteProgram(prog);
    }
    
    // Draw a circle for mass visualization
    drawCircle(gl, prog, cx, cy, radius, color) {
        const segments = 20;
        const positions = [];
        
        // Create triangle fan for filled circle
        positions.push(cx, cy); // Center
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            positions.push(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
        }
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        // Fill
        gl.uniform4f(gl.getUniformLocation(prog, 'u_color'), color[0], color[1], color[2], color[3] * 0.7);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, segments + 2);
        
        // Outline
        gl.uniform4f(gl.getUniformLocation(prog, 'u_color'), color[0], color[1], color[2], color[3]);
        gl.drawArrays(gl.LINE_LOOP, 1, segments + 1);
    }
    
    destroy() {
        const gl = this.gl;
        if (this.trailBuffer1) gl.deleteBuffer(this.trailBuffer1);
        if (this.trailBuffer2) gl.deleteBuffer(this.trailBuffer2);
        if (this.lineBuffer) gl.deleteBuffer(this.lineBuffer);
    }
}

class ChaosMapRenderer {
    constructor() {
        this.canvas = document.getElementById('chaosMapCanvas');
        this.gl = null;
        this.program = null;
        this.tileCanvas = document.createElement('canvas');
        this.tileGl = null;
        this.tileProgram = null;
        // Note: noise textures are created per-render, not stored, to avoid context issues
        
        // Layer preview canvas (256x256)
        this.previewCanvas = document.getElementById('layerPreviewCanvas');
        this.previewGl = null;
        this.previewProgram = null;
        this.previewDebounceTimer = null;
        
        // Pendulum simulation panel
        this.pendulumPreviewCanvas = document.getElementById('pendulumPreviewCanvas');
        this.pendulumPreviewGl = null;
        this.pendulumPreviewProgram = null;
        this.pendulumPreviewState = null;
        this.pendulumPreviewTrail = [];
        this.pendulumPreviewTrailBuffer = null;
        
        // GPU-based pendulum simulation
        this.hoverGPUSim = null;
        this.pinnedGPUSims = new Map(); // Map simId -> GPUPendulumSimulation
        
        // Transformation stack
        this.stack = new TransformationStack();
        this.selectedIndex = -1; // Selected item in stack
        this.hoverPosition = null;
        
        // New workflow: layer creation state
        this.layerCreationState = {
            active: false,
            xDim: 'theta1',
            yDim: 'theta2',
            xMin: -3.14,
            xMax: 3.14,
            yMin: -3.14,
            yMax: 3.14,
            pinPosition: null,  // {nx, ny} when placed
            isPlacingPin: false
        };
        
        // Base parameters (not part of transformation)
        this.baseParams = {
            g: 9.81,
            dt: 0.002,
            maxIter: 20000,
            threshold: 0.05,
            perturbMode: 'random',
            integrator: 'verlet',
            resolution: 1024,
            tileSize: 64,
            // Perturbation configuration
            perturbFixed: {
                theta1: 0.00001, theta2: 0.00001, omega1: 0.00001, omega2: 0.00001,
                l1: 0.00001, l2: 0.00001, m1: 0.00001, m2: 0.00001
            },
            perturbRandom: {
                theta1: { center: 0.0, std: 0.00001 },
                theta2: { center: 0.0, std: 0.00001 },
                omega1: { center: 0.0, std: 0.00001 },
                omega2: { center: 0.0, std: 0.00001 },
                l1: { center: 0.0, std: 0.00001 },
                l2: { center: 0.0, std: 0.00001 },
                m1: { center: 0.0, std: 0.00001 },
                m2: { center: 0.0, std: 0.00001 }
            }
        };
        
        // Rendering state
        this.isRendering = false;
        this.shouldStop = false;
        this.colorMapping = 0;
        this.hueMapping = 0;
        this.cyclePeriod = 500;
        
        // Pendulum simulation
        this.pendulumSimSpeed = 1;
        
        // Multiple permanent simulations (max 3)
        this.pinnedSimulations = []; // Array of {id, nx, ny, state, perturbedState, trail, divergenceTime, animationId, element}
        this.maxPinnedSimulations = 3;
        
        // Pin mode - when active, clicking on map creates a pinned simulation
        this.pinMode = false;
        this.pendingPinPosition = null; // Position selected in pin mode but not yet placed
        
        // Hover preview state
        this.hoverPreviewState = null;
        this.hoverPerturbedState = null;
        this.hoverTrail = [];
        this.hoverDivergenceTime = null;
        this.hoverAnimationId = null;
        
        // Zoom/pan state - independent of layer transformation stack
        this.zoomState = {
            isDragging: false,
            dragStart: null, // {x, y} in canvas pixels
            dragCurrent: null, // {x, y} in canvas pixels
            zoomHistory: [] // Stack of zoomed views for zoom out
        };
        
        this.init();
    }
    
    init() {
        this.setupWebGL();
        this.setupTileWebGL();
        this.setupPreviewWebGL();
        this.setupPendulumPreviewWebGL();
        this.setupEventListeners();
        this.resizeCanvas();
        this.updateLegend();
        this.updateStackUI();
        this.updatePinnedSimulationTitle();
        this.updatePerturbConfigUI();
        
        // Initial render
        this.generateMap();
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => this.cleanup());
    }
    
    setupWebGL() {
        this.mainCtx = this.canvas.getContext('2d');
        if (!this.mainCtx) {
            alert('Canvas 2D context not supported');
        }
    }
    
    setupTileWebGL() {
        this.tileCanvas.width = this.baseParams.tileSize;
        this.tileCanvas.height = this.baseParams.tileSize;
        
        this.tileGl = this.tileCanvas.getContext('webgl', {
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        
        if (!this.tileGl) {
            console.error('WebGL not supported');
            return;
        }
        
        const gl = this.tileGl;
        
        this.tileCanvas.addEventListener('webglcontextlost', (e) => {
            console.warn('Tile WebGL context lost');
            e.preventDefault();
        });
        
        this.tileCanvas.addEventListener('webglcontextrestored', () => {
            console.log('Tile WebGL context restored');
            this.setupTileWebGL();
        });
        
        this.compileTileShaders();
    }
    
    setupPreviewWebGL() {
        if (!this.previewCanvas) return;
        
        this.previewCanvas.width = 256;
        this.previewCanvas.height = 256;
        
        this.previewGl = this.previewCanvas.getContext('webgl', {
            antialias: false,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        
        if (!this.previewGl) {
            console.error('WebGL not supported for preview');
            return;
        }
        
        this.compilePreviewShaders();
    }
    
    compileTileShaders() {
        const gl = this.tileGl;
        if (!gl) return;
        
        const vsEl = document.getElementById('chaos-vertex-shader');
        const fsEl = document.getElementById('chaos-fragment-shader');
        const vsSource = vsEl ? vsEl.textContent : null;
        const fsSource = fsEl ? fsEl.textContent : null;
        
        if (!vsSource || !fsSource) {
            console.error('Shader sources not available');
            return;
        }
        
        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vertexShader || !fragmentShader) {
            console.error('Failed to compile shaders');
            return;
        }
        
        this.tileProgram = this.createProgram(gl, vertexShader, fragmentShader);
        
        if (!this.tileProgram) {
            console.error('Failed to create shader program');
            return;
        }
        
        const positions = new Float32Array([
            -1, -1,  1, -1,  -1,  1,
            -1,  1,  1, -1,   1,  1
        ]);
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        const positionLocation = gl.getAttribLocation(this.tileProgram, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Generate random noise data for a given size
    // Returns a Uint8Array of random RGBA values
    generateNoiseData(width, height) {
        const size = width * height * 4; // RGBA
        const noiseData = new Uint8Array(size);
        
        // crypto.getRandomValues has a limit of 65536 bytes per call
        const MAX_CRYPTO_BYTES = 65536;
        
        if (window.crypto && window.crypto.getRandomValues) {
            // Fill in chunks
            for (let offset = 0; offset < size; offset += MAX_CRYPTO_BYTES) {
                const chunkSize = Math.min(MAX_CRYPTO_BYTES, size - offset);
                const chunk = new Uint8Array(noiseData.buffer, offset, chunkSize);
                window.crypto.getRandomValues(chunk);
            }
        } else {
            // Fallback to Math.random
            for (let i = 0; i < size; i++) {
                noiseData[i] = Math.floor(Math.random() * 256);
            }
        }
        
        return noiseData;
    }
    
    // Create a fresh noise texture with random values for given dimensions
    // Returns the created texture, or null if gl is not available
    // Note: Textures are created fresh each render to avoid context issues
    updateNoiseTexture(gl, width, height) {
        if (!gl) return null;
        
        const noiseData = this.generateNoiseData(width, height);
        
        // Always create a new texture - don't cache to avoid cross-context issues
        const texture = gl.createTexture();
        if (!texture) return null;
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, noiseData);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        
        return texture;
    }
    
    compilePreviewShaders() {
        const gl = this.previewGl;
        if (!gl) return;
        
        const vsEl = document.getElementById('chaos-vertex-shader');
        const fsEl = document.getElementById('chaos-fragment-shader');
        const vsSource = vsEl ? vsEl.textContent : null;
        const fsSource = fsEl ? fsEl.textContent : null;
        
        if (!vsSource || !fsSource) {
            console.error('Shader sources not available for preview');
            return;
        }
        
        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vertexShader || !fragmentShader) {
            console.error('Failed to compile preview shaders');
            return;
        }
        
        this.previewProgram = this.createProgram(gl, vertexShader, fragmentShader);
        
        if (!this.previewProgram) {
            console.error('Failed to create preview shader program');
            return;
        }
        
        const positions = new Float32Array([
            -1, -1,  1, -1,  -1,  1,
            -1,  1,  1, -1,   1,  1
        ]);
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        const positionLocation = gl.getAttribLocation(this.previewProgram, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }
    
    setupPendulumPreviewWebGL() {
        if (!this.pendulumPreviewCanvas) return;
        
        this.pendulumPreviewGl = this.pendulumPreviewCanvas.getContext('webgl', {
            antialias: true,
            preserveDrawingBuffer: true
        });
        
        if (!this.pendulumPreviewGl) {
            console.error('WebGL not supported for pendulum preview');
            return;
        }
        
        const gl = this.pendulumPreviewGl;
        
        // Use the shader scripts from HTML
        const vsEl = document.getElementById('pendulum-preview-vertex-shader');
        const fsEl = document.getElementById('pendulum-preview-fragment-shader');
        const vsSource = vsEl ? vsEl.textContent : null;
        const fsSource = fsEl ? fsEl.textContent : null;
        
        if (!vsSource || !fsSource) {
            console.error('Pendulum preview shader sources not found');
            return;
        }
        
        const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vs || !fs) return;
        
        this.pendulumPreviewProgram = this.createProgram(gl, vs, fs);
        this.pendulumPreviewTrailBuffer = gl.createBuffer();
        this.pendulumPositionBuffer = gl.createBuffer();
    }
    
    createShader(gl, type, source) {
        if (!gl || gl.isContextLost()) return null;
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }
    
    createProgram(gl, vs, fs) {
        if (!gl || gl.isContextLost() || !vs || !fs) return null;
        const program = gl.createProgram();
        if (!program) return null;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            gl.deleteProgram(program);
            return null;
        }
        return program;
    }
    
    setupEventListeners() {
        // Base parameter inputs
        const inputs = ['g', 'dt', 'maxIter', 'threshold'];
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
                this.resizeCanvas();
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
    }
    
    setupStackEditorListeners() {
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
    }
    
    updateDefaultRanges() {
        const dimDefaults = {
            theta1: { min: -3.14, max: 3.14 },
            theta2: { min: -3.14, max: 3.14 },
            omega1: { min: -10, max: 10 },
            omega2: { min: -10, max: 10 },
            l1: { min: 0.1, max: 3 },
            l2: { min: 0.1, max: 3 },
            m1: { min: 0.1, max: 5 },
            m2: { min: 0.1, max: 5 }
        };
        
        const xDefaults = dimDefaults[this.layerCreationState.xDim];
        const yDefaults = dimDefaults[this.layerCreationState.yDim];
        
        document.getElementById('xMin').value = xDefaults.min;
        document.getElementById('xMax').value = xDefaults.max;
        document.getElementById('yMin').value = yDefaults.min;
        document.getElementById('yMax').value = yDefaults.max;
        
        this.updateLayerCreationState();
    }
    
    updateLayerCreationState() {
        const xMin = parseFloat(document.getElementById('xMin')?.value);
        const xMax = parseFloat(document.getElementById('xMax')?.value);
        const yMin = parseFloat(document.getElementById('yMin')?.value);
        const yMax = parseFloat(document.getElementById('yMax')?.value);
        
        this.layerCreationState.xMin = isNaN(xMin) ? -3.14 : xMin;
        this.layerCreationState.xMax = isNaN(xMax) ? 3.14 : xMax;
        this.layerCreationState.yMin = isNaN(yMin) ? -3.14 : yMin;
        this.layerCreationState.yMax = isNaN(yMax) ? 3.14 : yMax;
    }
    
    startPinPlacement() {
        this.layerCreationState.isPlacingPin = true;
        this.layerCreationState.active = true;
        
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
    }
    
    placePin(nx, ny) {
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
    }
    
    renderPreviewAtPin() {
        const pos = this.layerCreationState.pinPosition;
        if (!pos) return;
        
        // This will render the preview at the pinned position using current settings
        this.renderPreview(pos.nx, pos.ny);
    }
    
    saveLayer() {
        const state = this.layerCreationState;
        if (!state.pinPosition) {
            alert('Please place a pin first');
            return;
        }
        
        // Compute the basis state at the pin position
        const basisState = this.stack.computeState(state.pinPosition.nx, state.pinPosition.ny);
        const sampledPoint = new SampledPoint(basisState);
        
        // Create layer with custom dimensions and ranges
        const newLayer = new TransformLayer(state.xDim, state.yDim, 
            state.xMin, state.xMax, state.yMin, state.yMax);
        
        // Add to stack
        this.stack.items.push(sampledPoint);
        this.stack.items.push(newLayer);
        
        this.selectedIndex = this.stack.items.length - 1;
        
        // Reset creation state
        this.cancelLayerCreation();
        
        // Update UI and regenerate map
        this.updateStackUI();
        this.generateMap();
    }
    
    cancelLayerCreation() {
        this.layerCreationState = {
            active: false,
            xDim: 'theta1',
            yDim: 'theta2',
            xMin: -3.14,
            xMax: 3.14,
            yMin: -3.14,
            yMax: 3.14,
            pinPosition: null,
            isPlacingPin: false
        };
        
        // Reset UI
        document.getElementById('xDimSelect').value = 'theta1';
        document.getElementById('yDimSelect').value = 'theta2';
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
    }
    
    updateBaseParams() {
        this.baseParams.g = parseFloat(document.getElementById('gInput').value) || 9.81;
        this.baseParams.dt = parseFloat(document.getElementById('dtInput').value) || 0.01;
        this.baseParams.maxIter = parseInt(document.getElementById('maxIterInput').value) || 5000;
        this.baseParams.threshold = parseFloat(document.getElementById('thresholdInput').value) || 0.5;
        this.baseParams.perturbMode = document.getElementById('perturbModeSelect').value || 'fixed';
        this.baseParams.integrator = document.getElementById('integratorSelect').value || 'rk4';
        this.updatePerturbConfigFromUI();
    }
    
    // Initialize and update the perturbation configuration UI
    updatePerturbConfigUI() {
        const panel = document.getElementById('perturbConfigPanel');
        if (!panel) return;
        
        const mode = this.baseParams.perturbMode;
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
    }
    
    // Read perturbation config from UI inputs
    updatePerturbConfigFromUI() {
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
    }
    
    // Compute perturbed state based on current perturbation configuration
    // For JS-side simulations, we use a simple approach:
    // - Fixed mode: add the fixed offset
    // - Random mode: sample from the Gaussian distribution (center ± std)
    computePerturbedState(baseState) {
        const mode = this.baseParams.perturbMode;
        
        if (mode === 'random') {
            // Random mode: sample from Gaussian for each dimension
            const pr = this.baseParams.perturbRandom;
            // Box-Muller for normal distribution
            const randn = () => {
                const u1 = Math.random();
                const u2 = Math.random();
                const r = Math.sqrt(-2 * Math.log(u1 + 0.0001));
                const theta = 2 * Math.PI * u2;
                return r * Math.cos(theta);
            };
            return {
                theta1: pr.theta1.center + randn() * pr.theta1.std,
                theta2: pr.theta2.center + randn() * pr.theta2.std,
                omega1: pr.omega1.center + randn() * pr.omega1.std,
                omega2: pr.omega2.center + randn() * pr.omega2.std,
                l1: Math.max(0.1, pr.l1.center + randn() * pr.l1.std),
                l2: Math.max(0.1, pr.l2.center + randn() * pr.l2.std),
                m1: Math.max(0.1, pr.m1.center + randn() * pr.m1.std),
                m2: Math.max(0.1, pr.m2.center + randn() * pr.m2.std)
            };
        } else {
            // Fixed mode: add fixed offsets
            const pf = this.baseParams.perturbFixed;
            return {
                theta1: baseState.theta1 + pf.theta1,
                theta2: baseState.theta2 + pf.theta2,
                omega1: baseState.omega1 + pf.omega1,
                omega2: baseState.omega2 + pf.omega2,
                l1: Math.max(0.1, baseState.l1 + pf.l1),
                l2: Math.max(0.1, baseState.l2 + pf.l2),
                m1: Math.max(0.1, baseState.m1 + pf.m1),
                m2: Math.max(0.1, baseState.m2 + pf.m2)
            };
        }
    }
    
    resizeCanvas() {
        const container = document.getElementById('mapContainer');
        if (container) {
            this.canvas.width = this.baseParams.resolution;
            this.canvas.height = this.baseParams.resolution;
        }
    }
    
    updateLegend() {
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
    }
    
    // Stack UI Management
    updateStackUI() {
        const container = document.getElementById('stackList');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.stack.getItems().forEach((item, index) => {
            const el = document.createElement('div');
            const isSelected = index === this.selectedIndex;
            const isLayer = item.type === 'layer';
            const isSampled = item.type === 'sampled';
            
            el.className = `stack-item ${isSelected ? 'selected' : ''} ${isLayer ? 'layer-item' : 'sampled-item'}`;
            el.dataset.index = index;
            
            let content = '';
            if (isLayer) {
                const dim1Info = DIM_INFO[item.dim1];
                const dim2Info = DIM_INFO[item.dim2];
                content = `
                    <div class="stack-info">
                        <div class="stack-name">${item.name}</div>
                        <div class="stack-params">
                            ${dim1Info ? dim1Info.label : item.dim1}: [${item.min1.toFixed(1)}, ${item.max1.toFixed(1)}] 
                            ${dim2Info ? dim2Info.label : item.dim2}: [${item.min2.toFixed(1)}, ${item.max2.toFixed(1)}]
                        </div>
                    </div>
                `;
            } else {
                content = `
                    <div class="stack-info">
                        <div class="stack-name">${item.name}</div>
                        <div class="stack-params" title="${item.getStateDisplay()}">
                            ${item.getStateDisplay()}
                        </div>
                    </div>
                `;
            }
            
            // Delete button (not for initial sampled point)
            const canDelete = index > 0;
            
            el.innerHTML = content + `
                <button class="delete-btn ${canDelete ? '' : 'disabled'}" data-index="${index}" ${canDelete ? '' : 'disabled'}>
                    ×
                </button>
            `;
            
            // Click to select
            el.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn')) {
                    e.stopPropagation();
                    if (canDelete) {
                        this.stack.removeItem(index);
                        this.selectedIndex = Math.min(this.selectedIndex, this.stack.items.length - 1);
                        this.updateStackUI();
                        this.generateMap();
                    }
                } else {
                    this.selectItem(index);
                }
            });
            
            container.appendChild(el);
        });
        
        // Show/hide layer editor based on selection
        this.updateLayerEditor();
    }
    
    selectItem(index) {
        this.selectedIndex = index;
        this.updateStackUI();
    }
    
    updateLayerEditor() {
        const editor = document.getElementById('layerEditor');
        const title = document.getElementById('editorTitle');
        const params = document.getElementById('editorParams');
        
        if (!editor || !title || !params) return;
        
        const item = this.selectedIndex >= 0 ? this.stack.getItems()[this.selectedIndex] : null;
        
        if (!item || item.type !== 'layer') {
            editor.style.display = 'none';
            return;
        }
        
        // Only regenerate the editor if it's a different layer or first time showing
        const currentLayerId = editor.dataset.layerId;
        if (currentLayerId === item.id) {
            // Just update the title in case it changed
            title.textContent = item.name;
            return;
        }
        
        editor.style.display = 'block';
        editor.dataset.layerId = item.id;
        title.textContent = item.name;
        
        const dim1 = item.dim1;
        const dim2 = item.dim2;
        const dim1Info = DIM_INFO[dim1] || { label: dim1, unit: '' };
        const dim2Info = DIM_INFO[dim2] || { label: dim2, unit: '' };
        
        // Create range editors with clear dimension labels
        params.innerHTML = `
            <div class="form-group">
                <label>Min / Max for ${dim1Info.label}</label>
                <div class="range-inputs">
                    <input type="number" value="${item.min1}" id="min1Input" step="0.1">
                    <span>to</span>
                    <input type="number" value="${item.max1}" id="max1Input" step="0.1">
                </div>
            </div>
            <div class="form-group">
                <label>Min / Max for ${dim2Info.label}</label>
                <div class="range-inputs">
                    <input type="number" value="${item.min2}" id="min2Input" step="0.1">
                    <span>to</span>
                    <input type="number" value="${item.max2}" id="max2Input" step="0.1">
                </div>
            </div>
        `;
        
        // Event listeners - update values and regenerate map automatically
        const updateItemValues = () => {
            const min1 = parseFloat(document.getElementById('min1Input').value) || 0;
            const max1 = parseFloat(document.getElementById('max1Input').value) || 1;
            const min2 = parseFloat(document.getElementById('min2Input').value) || 0;
            const max2 = parseFloat(document.getElementById('max2Input').value) || 1;
            
            item.min1 = Math.min(min1, max1);
            item.max1 = Math.max(min1, max1);
            item.min2 = Math.min(min2, max2);
            item.max2 = Math.max(min2, max2);
            
            // Update the stack UI display
            this.updateStackItemDisplay(this.selectedIndex, item);
        };
        
        const min1Input = document.getElementById('min1Input');
        const max1Input = document.getElementById('max1Input');
        const min2Input = document.getElementById('min2Input');
        const max2Input = document.getElementById('max2Input');
        
        // Use 'change' to regenerate map when user finishes editing
        const onInputChange = () => {
            updateItemValues();
            this.generateMap();
        };
        
        min1Input.addEventListener('change', onInputChange);
        max1Input.addEventListener('change', onInputChange);
        min2Input.addEventListener('change', onInputChange);
        max2Input.addEventListener('change', onInputChange);
    }
    
    // Update just a single stack item's display without regenerating the whole UI
    updateStackItemDisplay(index, item) {
        const container = document.getElementById('stackList');
        if (!container) return;
        
        const el = container.children[index];
        if (!el) return;
        
        const paramsEl = el.querySelector('.stack-params');
        if (!paramsEl) return;
        
        if (item.type === 'layer') {
            const dim1Info = DIM_INFO[item.dim1];
            const dim2Info = DIM_INFO[item.dim2];
            paramsEl.textContent = `${dim1Info ? dim1Info.label : item.dim1}: [${item.min1.toFixed(1)}, ${item.max1.toFixed(1)}] ${dim2Info ? dim2Info.label : item.dim2}: [${item.min2.toFixed(1)}, ${item.max2.toFixed(1)}]`;
        }
    }
    
    // Map interaction handlers
    getMapCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        const nx = Math.max(0, Math.min(1, x / this.canvas.width));
        // Y axis: WebGL has y=0 at bottom, but we want ny=0 at bottom too for consistency
        // The shader flips y for rendering, so we keep ny as is (0 at top, 1 at bottom of screen)
        const ny = Math.max(0, Math.min(1, y / this.canvas.height));
        return { nx, ny };
    }
    
    handleMapHover(e) {
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
    }
    
    schedulePreviewRender(nx, ny) {
        // Clear existing timer
        if (this.previewDebounceTimer) {
            clearTimeout(this.previewDebounceTimer);
        }
        
        // Schedule new render after 100ms
        this.previewDebounceTimer = setTimeout(() => {
            this.renderPreview(nx, ny);
        }, 100);
    }
    
    renderPreview(nx, ny) {
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
    }
    
    handleMapLeave() {
        this.hoverPosition = null;
        const info = document.getElementById('hoverInfo');
        if (info) info.innerHTML = 'Hover over map to see pendulum state';
        
        // Clear the hover debounce timer
        if (this.hoverDebounceTimer) {
            clearTimeout(this.hoverDebounceTimer);
            this.hoverDebounceTimer = null;
        }
        this.hoverDebouncedPosition = null;
    }
    
    handleMapClick(e) {
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
    }
    
    // Zoom/Pan handling - independent of layer transformation stack
    handleMapMouseDown(e) {
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
    }
    
    handleMapMouseMove(e) {
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
    }
    
    handleMapMouseUp(e) {
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
    }
    
    handleMapMouseLeave() {
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
    }
    
    createZoomOverlay() {
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
    }
    
    updateZoomOverlay() {
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
    }
    
    removeZoomOverlay() {
        if (this.zoomOverlay) {
            this.zoomOverlay.remove();
            this.zoomOverlay = null;
        }
    }
    
    applyZoomRectangle() {
        const layer = this.stack.getLastLayer();
        if (!layer) return;
        
        // Get drag rectangle in normalized coordinates [0, 1]
        const nx1 = Math.max(0, Math.min(1, Math.min(this.zoomState.dragStart.x, this.zoomState.dragCurrent.x) / this.canvas.width));
        const nx2 = Math.max(0, Math.min(1, Math.max(this.zoomState.dragStart.x, this.zoomState.dragCurrent.x) / this.canvas.width));
        // Y coordinates: canvas y=0 is at top, ny=0 is at bottom
        // We need to flip y for the data coordinates
        const ny1 = Math.max(0, Math.min(1, Math.min(this.zoomState.dragStart.y, this.zoomState.dragCurrent.y) / this.canvas.height));
        const ny2 = Math.max(0, Math.min(1, Math.max(this.zoomState.dragStart.y, this.zoomState.dragCurrent.y) / this.canvas.height));
        
        // Calculate data values at the rectangle corners
        // Note: ny=0 corresponds to min2 (bottom in data, top on screen)
        //       ny=1 corresponds to max2 (top in data, bottom on screen)
        // So we need to be careful about which ny maps to which data value
        const dataX1 = layer.min1 + nx1 * (layer.max1 - layer.min1);
        const dataX2 = layer.min1 + nx2 * (layer.max1 - layer.min1);
        // For Y: ny=0 is at top of screen but corresponds to max2 in the layer's view
        // Wait - let me check: in computeOutput, ny goes from min2 to max2
        // The shader flips y for rendering, but the layer's computeOutput doesn't flip
        // Let's trace through: viewport ny=0 (top) -> computeOutput -> min2
        //                    viewport ny=1 (bottom) -> computeOutput -> max2
        // So the data Y increases from top to bottom of screen
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
    }
    
    zoomOut() {
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
            const dimDefaults = {
                theta1: { min: -3.14, max: 3.14 }, theta2: { min: -3.14, max: 3.14 },
                omega1: { min: -10, max: 10 }, omega2: { min: -10, max: 10 },
                l1: { min: 0.1, max: 3 }, l2: { min: 0.1, max: 3 },
                m1: { min: 0.1, max: 5 }, m2: { min: 0.1, max: 5 }
            };
            layer.min1 = dimDefaults[layer.dim1]?.min ?? -3.14;
            layer.max1 = dimDefaults[layer.dim1]?.max ?? 3.14;
            layer.min2 = dimDefaults[layer.dim2]?.min ?? -3.14;
            layer.max2 = dimDefaults[layer.dim2]?.max ?? 3.14;
        }
        
        this.updateStackUI();
        this.generateMap();
    }
    
    // Update the hover preview pane (top one) with current hover state
    updateHoverPreview(nx, ny) {
        // Compute the state at this position
        const state = this.stack.computeState(nx, ny);
        
        // Update hover preview state
        this.hoverPreviewState = { ...state };
        this.hoverPerturbedState = this.computePerturbedState(state);
        
        // Update the title
        const title = document.getElementById('hoverPaneTitle');
        if (title) {
            title.textContent = `Preview (${nx.toFixed(2)}, ${ny.toFixed(2)})`;
        }
        
        // Initialize or reset GPU simulation
        this.initHoverGPUSim(state);
    }
    
    // Initialize GPU simulation for hover preview
    initHoverGPUSim(state) {
        try {
            // Clean up existing simulation
            if (this.hoverGPUSim) {
                this.hoverGPUSim.destroy();
                this.hoverGPUSim = null;
            }
            
            // Cancel any existing animation frame
            if (this.hoverAnimationId) {
                cancelAnimationFrame(this.hoverAnimationId);
                this.hoverAnimationId = null;
            }
            
            // Create perturbed state
            const perturbedState = this.computePerturbedState(state);
            
            // Create new GPU simulation
            this.hoverGPUSim = new GPUPendulumSimulation(this.pendulumPreviewCanvas, {
                g: this.baseParams.g,
                dt: this.baseParams.dt,
                l1: state.l1,
                l2: state.l2,
                m1: state.m1,
                m2: state.m2,
                integrator: this.baseParams.integrator,
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
                },
                perturb: this.baseParams.perturbFixed
            });
            
            // Start animation loop
            this.animateHoverGPUSim();
        } catch (e) {
            console.error('Failed to initialize GPU simulation:', e);
            // Fall back to CPU rendering
            this.drawInPreviewPane(this.pendulumPreviewCanvas, this.hoverPreviewState, this.hoverPerturbedState);
        }
    }
    
    // Animation loop for hover GPU simulation
    animateHoverGPUSim() {
        if (!this.hoverGPUSim) return;
        
        // Step and render
        this.hoverGPUSim.step(this.pendulumSimSpeed);
        this.hoverGPUSim.render();
        
        // Continue animation
        this.hoverAnimationId = requestAnimationFrame(() => this.animateHoverGPUSim());
    }
    
    // Toggle pin mode - when active, clicking on map creates a pinned simulation
    togglePinMode(forceState = null) {
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
    }
    
    // Clear all pinned simulations
    clearAllPinnedSimulations() {
        // Stop all animations and remove all simulations
        while (this.pinnedSimulations.length > 0) {
            this.removePinnedSimulation(this.pinnedSimulations[0].id);
        }
        this.updatePinnedSimulationTitle();
    }
    
    // Create a new pinned simulation (max 3)
    createPinnedSimulation(nx, ny) {
        // Check if we already have a simulation at this exact position
        const existing = this.pinnedSimulations.find(s => 
            Math.abs(s.nx - nx) < 0.01 && Math.abs(s.ny - ny) < 0.01
        );
        if (existing) return;
        
        // If at max capacity, remove the oldest one
        if (this.pinnedSimulations.length >= this.maxPinnedSimulations) {
            this.removePinnedSimulation(this.pinnedSimulations[0].id);
        }
        
        // Compute state
        const state = this.stack.computeState(nx, ny);
        const perturbedState = this.computePerturbedState(state);
        
        // Create simulation object
        const sim = {
            id: Date.now() + Math.random().toString(36).substr(2, 9),
            nx,
            ny,
            state: { ...state },
            perturbedState: { ...perturbedState },
            trail: [],
            divergenceTime: null,
            animationId: null,
            canvas: null,
            element: null,
            gpuSim: null
        };
        
        // Create DOM element for this simulation
        sim.element = this.createPinnedSimulationElement(sim);
        
        // Add to container (after the hover pane)
        const container = document.getElementById('simulationContainer');
        if (container) {
            container.appendChild(sim.element);
        }
        
        // Get canvas and create GPU simulation
        sim.canvas = sim.element.querySelector('canvas');
        
        try {
            // Create GPU simulation
            sim.gpuSim = new GPUPendulumSimulation(sim.canvas, {
                g: this.baseParams.g,
                dt: this.baseParams.dt,
                l1: state.l1,
                l2: state.l2,
                m1: state.m1,
                m2: state.m2,
                integrator: this.baseParams.integrator,
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
                },
                perturb: this.baseParams.perturbFixed
            });
            
            // Store in map
            this.pinnedGPUSims.set(sim.id, sim.gpuSim);
        } catch (e) {
            console.error('Failed to create GPU simulation:', e);
            // Fall back to CPU-based simulation
            this.setupPinnedSimulationWebGL(sim);
        }
        
        // Add to array
        this.pinnedSimulations.push(sim);
        
        // Start animation
        this.animatePinnedSimulation(sim);
        
        // Update title
        this.updatePinnedSimulationTitle();
    }
    
    // Create DOM element for a pinned simulation
    createPinnedSimulationElement(sim) {
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
    }
    
    // Setup WebGL context for a pinned simulation
    setupPinnedSimulationWebGL(sim) {
        if (!sim.canvas) return;
        
        sim.gl = sim.canvas.getContext('webgl', {
            antialias: true,
            preserveDrawingBuffer: true
        });
        
        if (!sim.gl) {
            console.error('WebGL not supported for pinned simulation');
            return;
        }
        
        const gl = sim.gl;
        
        // Use the shader scripts from HTML
        const vsEl = document.getElementById('pendulum-preview-vertex-shader');
        const fsEl = document.getElementById('pendulum-preview-fragment-shader');
        const vsSource = vsEl ? vsEl.textContent : null;
        const fsSource = fsEl ? fsEl.textContent : null;
        
        if (!vsSource || !fsSource) return;
        
        const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vs || !fs) return;
        
        sim.program = this.createProgram(gl, vs, fs);
        sim.trailBuffer = gl.createBuffer();
        sim.positionBuffer = gl.createBuffer();
    }
    
    // Remove a pinned simulation
    removePinnedSimulation(id) {
        const index = this.pinnedSimulations.findIndex(s => s.id === id);
        if (index === -1) return;
        
        const sim = this.pinnedSimulations[index];
        
        // Stop animation
        if (sim.animationId) {
            cancelAnimationFrame(sim.animationId);
        }
        
        // Clean up GPU simulation
        if (sim.gpuSim) {
            sim.gpuSim.destroy();
            this.pinnedGPUSims.delete(id);
        }
        
        // Remove DOM element
        if (sim.element && sim.element.parentNode) {
            sim.element.parentNode.removeChild(sim.element);
        }
        
        // Remove from array
        this.pinnedSimulations.splice(index, 1);
        
        // Update title
        this.updatePinnedSimulationTitle();
    }
    
    // Update the main title based on number of pinned simulations
    updatePinnedSimulationTitle() {
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
    }
    
    // Animate a pinned simulation
    animatePinnedSimulation(sim) {
        const steps = this.pendulumSimSpeed;
        
        // Use GPU simulation if available
        if (sim.gpuSim) {
            // Step GPU simulation
            sim.gpuSim.step(steps);
            
            // Render
            sim.gpuSim.render();
            
            // Update status
            const statusEl = document.getElementById(`status-${sim.id}`);
            if (statusEl) {
                if (sim.gpuSim.diverged) {
                    statusEl.textContent = `Diverged at t=${sim.gpuSim.divergenceTime}`;
                    statusEl.style.color = '#f88';
                } else {
                    statusEl.textContent = `t=${sim.gpuSim.frameCount}`;
                    statusEl.style.color = '#8f8';
                }
            }
        } else {
            // Fallback to CPU simulation
            this.animatePinnedSimulationCPU(sim, steps);
        }
        
        // Continue animation
        sim.animationId = requestAnimationFrame(() => this.animatePinnedSimulation(sim));
    }
    
    // CPU fallback for pinned simulation animation
    animatePinnedSimulationCPU(sim, steps) {
        let diverged = false;
        
        // Get base state (lengths and masses)
        const baseState = this.stack.computeState(sim.nx, sim.ny);
        
        for (let i = 0; i < steps; i++) {
            // Step physics (GPU-side only - uses RK4 for preview)
            sim.state = this.stepPhysicsRK4OnGPU(sim.state, baseState.l1, baseState.l2, baseState.m1, baseState.m2);
            sim.perturbedState = this.stepPhysicsRK4OnGPU(sim.perturbedState, baseState.l1, baseState.l2, baseState.m1, baseState.m2);
            
            // Check for divergence
            if (!diverged && sim.divergenceTime === null) {
                const dist = this.measureDivergence(sim.state, sim.perturbedState);
                if (dist > this.baseParams.threshold) {
                    sim.divergenceTime = sim.trail.length;
                    diverged = true;
                }
            }
        }
        
        // Add to trail
        const x1 = baseState.l1 * Math.sin(sim.state.theta1);
        const y1 = baseState.l1 * Math.cos(sim.state.theta1);
        const x2 = x1 + baseState.l2 * Math.sin(sim.state.theta2);
        const y2 = y1 + baseState.l2 * Math.cos(sim.state.theta2);
        
        sim.trail.push({ x1, y1, x2, y2 });
        if (sim.trail.length > 400) {
            sim.trail.shift();
        }
        
        // Draw
        if (sim.gl && sim.program) {
            this.drawInWebGLContext(sim.gl, sim.program, sim.positionBuffer, sim.trailBuffer, sim.state, sim.perturbedState, sim.trail, baseState);
        }
        
        // Update status
        const statusEl = document.getElementById(`status-${sim.id}`);
        if (statusEl) {
            if (sim.divergenceTime !== null) {
                statusEl.textContent = `Diverged at t=${sim.divergenceTime}`;
                statusEl.style.color = '#f88';
            } else {
                const time = sim.trail.length;
                statusEl.textContent = `t=${time}`;
                statusEl.style.color = '#8f8';
            }
        }
    }
    
    updateHoverInfo(state) {
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
    }
    
    // Draw pendulum in a preview pane canvas (for hover preview - no trail, just static)
    drawInPreviewPane(canvas, state1, state2) {
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
        
        // Get base state from hover position
        const baseState = this.hoverPosition ? 
            this.stack.computeState(this.hoverPosition.nx, this.hoverPosition.ny) :
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
    }
    
    // Draw pendulum in a WebGL context (for pinned simulations)
    drawInWebGLContext(gl, program, positionBuffer, trailBuffer, state1, state2, trail, baseState) {
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
    }
    
    // Draw pendulum components in WebGL
    drawPendulumInGL(gl, program, positionBuffer, cx, cy, x1, y1, x2, y2, m1, m2, color) {
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
    }
    
    // Draw circle in WebGL
    drawCircleInGL(gl, program, positionBuffer, cx, cy, radius, color) {
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
    }
    
    // Clean up all pinned simulations when leaving page
    cleanup() {
        // Clean up hover simulation
        if (this.hoverAnimationId) {
            cancelAnimationFrame(this.hoverAnimationId);
            this.hoverAnimationId = null;
        }
        if (this.hoverGPUSim) {
            this.hoverGPUSim.destroy();
            this.hoverGPUSim = null;
        }
        
        // Clean up all pinned simulations
        this.pinnedSimulations.forEach(sim => {
            if (sim.animationId) {
                cancelAnimationFrame(sim.animationId);
            }
            if (sim.gpuSim) {
                sim.gpuSim.destroy();
            }
        });
        this.pinnedGPUSims.clear();
        this.pinnedSimulations = [];
    }
    
    // Main map generation
    async generateMap() {
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
        
        if (loading) loading.style.display = 'none';
        if (progressFill) progressFill.style.width = '0%';
        
        this.isRendering = false;
    }
    
    // Download the current chaos map as an image
    downloadImage() {
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
    }
    
    renderTile(offsetX, offsetY, width, height) {
        const gl = this.tileGl;
        const program = this.tileProgram;
        if (!gl || !program) return;
        
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
        
        // Set uniforms
        gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), res, res);
        gl.uniform2f(gl.getUniformLocation(program, 'u_tileOffset'), offsetX, offsetY);
        gl.uniform2f(gl.getUniformLocation(program, 'u_tileSize'), width, height);
        gl.uniform1f(gl.getUniformLocation(program, 'u_l1'), shaderParams.l1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_l2'), shaderParams.l2);
        gl.uniform1f(gl.getUniformLocation(program, 'u_m1'), shaderParams.m1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_m2'), shaderParams.m2);
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
        
        // Generate and bind per-tile noise texture for truly independent random perturbations
        const noiseTex = this.updateNoiseTexture(gl, width, height);
        if (noiseTex) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, noiseTex);
            gl.uniform1i(gl.getUniformLocation(program, 'u_noiseTexture'), 0);
        }
        
        // Layer-based uniforms
        gl.uniform1i(gl.getUniformLocation(program, 'u_layerMode'), shaderParams.mode);
        gl.uniform4f(gl.getUniformLocation(program, 'u_fixedState'), 
            shaderParams.fixedState[0], shaderParams.fixedState[1],
            shaderParams.fixedState[2], shaderParams.fixedState[3]);
        gl.uniform1f(gl.getUniformLocation(program, 'u_scaleX'), shaderParams.scaleX);
        gl.uniform1f(gl.getUniformLocation(program, 'u_scaleY'), shaderParams.scaleY);
        gl.uniform1f(gl.getUniformLocation(program, 'u_centerX'), shaderParams.centerX || 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_centerY'), shaderParams.centerY || 0);
        
        // Which dimensions are being mapped
        const dim1 = shaderParams.layerDims ? shaderParams.layerDims[0] : 'theta1';
        const dim2 = shaderParams.layerDims ? shaderParams.layerDims[1] : 'theta2';
        const dimToIndex = { theta1: 0, theta2: 1, omega1: 2, omega2: 3, l1: 4, l2: 5, m1: 6, m2: 7 };
        gl.uniform2i(gl.getUniformLocation(program, 'u_mappedDims'), dimToIndex[dim1], dimToIndex[dim2]);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    
    // GPU-consistent RK4 integration - uses SAME physics as the shader
    stepPhysicsRK4OnGPU(state, l1, l2, m1, m2) {
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
    }
    
    // GPU-consistent derivative computation - matches shader's computeAccelerations
    computeDerivativesGPU(s, l1, l2, m1, m2, g) {
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
    }
    
    // Legacy RK4 - kept for compatibility, uses computeDerivatives
    stepPhysicsRK4(state) {
        return this.stepPhysicsRK4OnGPU(
            state,
            this.stack.computeState(0.5, 0.5).l1,
            this.stack.computeState(0.5, 0.5).l2,
            this.stack.computeState(0.5, 0.5).m1,
            this.stack.computeState(0.5, 0.5).m2
        );
    }
    
    // Measure divergence between two pendulum states
    measureDivergence(s1, s2) {
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
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.chaosRenderer = new ChaosMapRenderer();
});
