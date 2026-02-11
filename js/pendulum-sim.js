// Double Pendulum Chaos Map - GPU-Based Pendulum Simulation
// Uses CPU for physics (Verlet/RK4 integrator) and GPU for rendering

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
