// Double Pendulum Chaos Map - Transformation Stack Classes

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
