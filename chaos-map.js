// Double Pendulum Chaos Map - GPU Simulation with Preview Modes

class ChaosMapRenderer {
    constructor() {
        this.canvas = document.getElementById('chaosMapCanvas');
        this.gl = null;
        this.program = null;
        this.tileCanvas = document.createElement('canvas');
        this.tileGl = null;
        this.tileProgram = null;
        this.compositeCanvas = document.createElement('canvas');
        
        // Preview canvases
        this.pendulumPreviewCanvas = document.getElementById('pendulumPreviewCanvas');
        this.pendulumPreviewCtx = this.pendulumPreviewCanvas.getContext('2d');
        this.velocityPreviewCanvas = document.getElementById('velocityPreviewCanvas');
        this.velocityPreviewCtx = this.velocityPreviewCanvas.getContext('2d');
        
        // Parameters
        this.params = {
            l1: 1.0,
            l2: 1.0,
            m1: 1.0,
            m2: 1.0,
            g: 9.81,
            dt: 0.01,
            maxIter: 5000,
            threshold: 0.5,
            perturbation: 0.0001,
            resolution: 1024,
            tileSize: 64,
            velocityScale: 5.0
        };
        
        // Mode: 0 = position map, 1 = velocity map
        this.mode = 0;
        this.fixedState = { theta1: 0, theta2: 0, omega1: 0, omega2: 0 };
        
        // Rendering state
        this.isRendering = false;
        this.shouldStop = false;
        
        // Preview modes
        this.pendulumPreviewEnabled = false;
        this.velocityPreviewEnabled = false;
        this.hoverPosition = null; // {nx, ny} normalized coordinates
        this.hoverState = null; // {theta1, theta2, omega1, omega2}
        
        // Debounce for velocity preview
        this.velocityPreviewTimeout = null;
        
        // Pendulum simulation state
        this.pendulumSimRunning = false;
        this.pendulumSimStates = null; // {state1, state2, trail1, trail2, iteration}
        this.pendulumSimAnimationId = null;
        
        this.init();
    }
    
    init() {
        this.setupWebGL();
        this.setupTileWebGL();
        this.setupEventListeners();
        this.resizeCanvas();
        
        // Initial render
        this.generateMap();
    }
    
    setupWebGL() {
        this.gl = this.canvas.getContext('webgl', { 
            preserveDrawingBuffer: true,
            antialias: false 
        });
        
        if (!this.gl) {
            alert('WebGL not supported');
            return;
        }
        
        const gl = this.gl;
        
        this.canvas.addEventListener('webglcontextlost', (e) => {
            console.warn('WebGL context lost');
            e.preventDefault();
        });
        
        this.canvas.addEventListener('webglcontextrestored', () => {
            console.log('WebGL context restored');
            this.setupWebGL();
        });
        
        const vsEl = document.getElementById('chaos-vertex-shader');
        const fsEl = document.getElementById('chaos-fragment-shader');
        if (!vsEl || !fsEl) {
            console.error('Shader elements not found');
            return;
        }
        
        const vsSource = vsEl.textContent;
        const fsSource = fsEl.textContent;
        
        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vertexShader || !fragmentShader) {
            console.error('Failed to compile shaders');
            return;
        }
        
        this.program = this.createProgram(gl, vertexShader, fragmentShader);
        
        if (!this.program) {
            console.error('Failed to create program');
            return;
        }
        
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1
        ]);
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }
    
    setupTileWebGL() {
        this.tileCanvas.width = this.params.tileSize;
        this.tileCanvas.height = this.params.tileSize;
        this.tileGl = this.tileCanvas.getContext('webgl', {
            antialias: false,
            preserveDrawingBuffer: true
        });
        
        if (!this.tileGl) return;
        
        const gl = this.tileGl;
        
        this.tileCanvas.addEventListener('webglcontextlost', (e) => {
            console.warn('Tile WebGL context lost');
            e.preventDefault();
        });
        
        this.tileCanvas.addEventListener('webglcontextrestored', () => {
            console.log('Tile WebGL context restored');
            this.setupTileWebGL();
        });
        
        const vsEl = document.getElementById('chaos-vertex-shader');
        const fsEl = document.getElementById('chaos-fragment-shader');
        if (!vsEl || !fsEl) return;
        
        const vsSource = vsEl.textContent;
        const fsSource = fsEl.textContent;
        
        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vertexShader || !fragmentShader) return;
        
        this.tileProgram = this.createProgram(gl, vertexShader, fragmentShader);
        
        if (!this.tileProgram) return;
        
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1
        ]);
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        const positionLocation = gl.getAttribLocation(this.tileProgram, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }
    
    createShader(gl, type, source) {
        if (!gl || gl.isContextLost()) {
            console.error('WebGL context is lost or unavailable');
            return null;
        }
        const shader = gl.createShader(type);
        if (!shader) {
            console.error('Failed to create shader');
            return null;
        }
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
        if (!gl || gl.isContextLost() || !vs || !fs) {
            console.error('Cannot create program: invalid context or shaders');
            return null;
        }
        const program = gl.createProgram();
        if (!program) {
            console.error('Failed to create program');
            return null;
        }
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
        // Parameter inputs
        const inputs = ['l1', 'l2', 'm1', 'm2', 'g', 'dt', 'maxIter', 'threshold', 'perturb'];
        inputs.forEach(id => {
            const el = document.getElementById(id + 'Input');
            if (el) {
                el.addEventListener('change', () => this.updateParams());
            }
        });
        
        // Resolution and tile size
        document.getElementById('resolutionSelect').addEventListener('change', (e) => {
            this.params.resolution = parseInt(e.target.value);
            this.resizeCanvas();
        });
        
        document.getElementById('tileSizeSelect').addEventListener('change', (e) => {
            this.params.tileSize = parseInt(e.target.value);
            this.setupTileWebGL();
        });
        
        // Generate button
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateMap();
        });
        
        // Back button
        document.getElementById('backToMapBtn').addEventListener('click', () => {
            this.mode = 0;
            this.updateModeUI();
            this.generateMap();
        });
        
        // Preview buttons
        document.getElementById('pendulumPreviewBtn').addEventListener('click', () => {
            this.pendulumPreviewEnabled = !this.pendulumPreviewEnabled;
            this.updatePreviewUI();
        });
        
        document.getElementById('velocityPreviewBtn').addEventListener('click', () => {
            this.velocityPreviewEnabled = !this.velocityPreviewEnabled;
            this.updatePreviewUI();
        });
        
        // Pendulum simulation controls
        document.getElementById('playPendulumBtn').addEventListener('click', () => {
            this.startPendulumSimulation();
        });
        
        document.getElementById('resetPendulumBtn').addEventListener('click', () => {
            this.resetPendulumSimulation();
        });
        
        // Velocity map switch button
        document.getElementById('switchToVelocityBtn').addEventListener('click', () => {
            if (this.hoverState) {
                this.mode = 1;
                this.fixedState = {
                    theta1: this.hoverState.theta1,
                    theta2: this.hoverState.theta2,
                    omega1: 0,
                    omega2: 0
                };
                this.updateModeUI();
                this.generateMap();
            }
        });
        
        // Map hover interaction
        this.canvas.addEventListener('mousemove', (e) => this.handleMapHover(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMapLeave());
        
        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.handleMapHover(mouseEvent);
        });
        
        window.addEventListener('resize', () => this.resizeCanvas());
    }
    
    updateParams() {
        this.params.l1 = parseFloat(document.getElementById('l1Input').value) || 1;
        this.params.l2 = parseFloat(document.getElementById('l2Input').value) || 1;
        this.params.m1 = parseFloat(document.getElementById('m1Input').value) || 1;
        this.params.m2 = parseFloat(document.getElementById('m2Input').value) || 1;
        this.params.g = parseFloat(document.getElementById('gInput').value) || 9.81;
        this.params.dt = parseFloat(document.getElementById('dtInput').value) || 0.01;
        this.params.maxIter = parseInt(document.getElementById('maxIterInput').value) || 5000;
        this.params.threshold = parseFloat(document.getElementById('thresholdInput').value) || 0.5;
        this.params.perturbation = parseFloat(document.getElementById('perturbInput').value) || 0.0001;
    }
    
    updatePreviewUI() {
        const pendulumBtn = document.getElementById('pendulumPreviewBtn');
        const velocityBtn = document.getElementById('velocityPreviewBtn');
        const pendulumInfo = document.getElementById('pendulumPreviewInfo');
        const velocityInfo = document.getElementById('velocityPreviewInfo');
        const pendulumControls = document.getElementById('pendulumControls');
        const velocityControls = document.getElementById('velocityControls');
        
        pendulumBtn.classList.toggle('active', this.pendulumPreviewEnabled);
        velocityBtn.classList.toggle('active', this.velocityPreviewEnabled);
        
        if (this.pendulumPreviewEnabled) {
            pendulumInfo.textContent = 'Hover over map';
            pendulumControls.style.display = 'flex';
        } else {
            pendulumInfo.textContent = 'Click 📌 to enable';
            pendulumControls.style.display = 'none';
            this.resetPendulumSimulation();
        }
        
        if (this.velocityPreviewEnabled) {
            velocityInfo.textContent = 'Hover over map';
            velocityControls.style.display = 'flex';
        } else {
            velocityInfo.textContent = 'Click 📌 to enable';
            velocityControls.style.display = 'none';
        }
        
        // Clear map marker
        const mapMarker = document.getElementById('mapMarker');
        if (!this.pendulumPreviewEnabled && !this.velocityPreviewEnabled) {
            mapMarker.classList.remove('active');
        }
    }
    
    resizeCanvas() {
        const container = document.getElementById('mapContainer');
        
        this.canvas.width = this.params.resolution;
        this.canvas.height = this.params.resolution;
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    
    updateModeUI() {
        const indicator = document.getElementById('modeIndicator');
        const backBtn = document.getElementById('backToMapBtn');
        const overlay = document.getElementById('mapOverlay');
        
        if (this.mode === 0) {
            indicator.textContent = 'Position Map Mode';
            indicator.className = 'mode-indicator';
            backBtn.style.display = 'none';
            overlay.textContent = 'Hover with preview enabled';
        } else {
            indicator.textContent = `Velocity Map Mode (θ₁=${this.fixedState.theta1.toFixed(2)}, θ₂=${this.fixedState.theta2.toFixed(2)})`;
            indicator.className = 'mode-indicator velocity-mode';
            backBtn.style.display = 'block';
            overlay.textContent = 'Hover with preview enabled';
        }
    }
    
    getMapCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        
        const nx = Math.max(0, Math.min(1, x / this.canvas.width));
        const ny = Math.max(0, Math.min(1, 1.0 - (y / this.canvas.height)));
        
        return { nx, ny };
    }
    
    getStateFromMapCoords(nx, ny) {
        if (this.mode === 0) {
            // Position map: map to theta1, theta2
            const theta1 = (nx * 2 - 1) * Math.PI;
            const theta2 = (ny * 2 - 1) * Math.PI;
            return { theta1, theta2, omega1: 0, omega2: 0 };
        } else {
            // Velocity map: map to omega1, omega2
            const omega1 = (nx * 2 - 1) * this.params.velocityScale;
            const omega2 = (ny * 2 - 1) * this.params.velocityScale;
            return {
                theta1: this.fixedState.theta1,
                theta2: this.fixedState.theta2,
                omega1,
                omega2
            };
        }
    }
    
    handleMapHover(e) {
        const { nx, ny } = this.getMapCoordinates(e);
        this.hoverPosition = { nx, ny };
        this.hoverState = this.getStateFromMapCoords(nx, ny);
        
        // Update map marker
        const mapMarker = document.getElementById('mapMarker');
        mapMarker.style.left = `${nx * 100}%`;
        mapMarker.style.top = `${(1 - ny) * 100}%`;
        mapMarker.classList.add('active');
        
        // Update pendulum preview if enabled and not running simulation
        if (this.pendulumPreviewEnabled && !this.pendulumSimRunning) {
            this.drawPendulumPreview(this.hoverState);
        }
        
        // Update velocity preview if enabled (debounced)
        if (this.velocityPreviewEnabled) {
            if (this.velocityPreviewTimeout) {
                clearTimeout(this.velocityPreviewTimeout);
            }
            this.velocityPreviewTimeout = setTimeout(() => {
                this.renderVelocityPreview(nx, ny);
            }, 500);
        }
    }
    
    handleMapLeave() {
        this.hoverPosition = null;
        this.hoverState = null;
        document.getElementById('mapMarker').classList.remove('active');
    }
    
    drawPendulumPreview(state) {
        const canvas = this.pendulumPreviewCanvas;
        const ctx = this.pendulumPreviewCtx;
        const cx = canvas.width / 2;
        const cy = canvas.height / 3;
        const scale = 60;
        
        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Calculate positions
        const x1 = cx + Math.sin(state.theta1) * this.params.l1 * scale;
        const y1 = cy + Math.cos(state.theta1) * this.params.l1 * scale;
        const x2 = x1 + Math.sin(state.theta2) * this.params.l2 * scale;
        const y2 = y1 + Math.cos(state.theta2) * this.params.l2 * scale;
        
        // Draw arms
        ctx.strokeStyle = '#6af';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        
        // Draw masses
        const r1 = Math.sqrt(this.params.m1) * 5;
        const r2 = Math.sqrt(this.params.m2) * 5;
        
        ctx.fillStyle = '#8af';
        ctx.beginPath();
        ctx.arc(x1, y1, r1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x2, y2, r2, 0, Math.PI * 2);
        ctx.fill();
        
        // Pivot
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Info text
        document.getElementById('pendulumPreviewInfo').textContent = 
            `θ₁=${state.theta1.toFixed(2)} θ₂=${state.theta2.toFixed(2)}`;
    }
    
    async renderVelocityPreview(centerNx, centerNy) {
        if (!this.velocityPreviewEnabled || !this.hoverState) return;
        
        const canvas = this.velocityPreviewCanvas;
        const previewSize = 256;
        
        // Create a temporary tile canvas for rendering
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = previewSize;
        tempCanvas.height = previewSize;
        const gl = tempCanvas.getContext('webgl', { antialias: false });
        
        if (!gl) return;
        
        // Compile shaders
        const vsEl = document.getElementById('chaos-vertex-shader');
        const fsEl = document.getElementById('chaos-fragment-shader');
        const vsSource = vsEl.textContent;
        const fsSource = fsEl.textContent;
        
        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vertexShader || !fragmentShader) return;
        
        const program = this.createProgram(gl, vertexShader, fragmentShader);
        if (!program) return;
        
        // Set up geometry
        const positions = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1
        ]);
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        const positionLocation = gl.getAttribLocation(program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        gl.useProgram(program);
        
        // Calculate the view range (zoom into area around cursor)
        const zoomRange = 0.2; // Show 20% of the map
        const offsetX = Math.max(0, Math.min(1 - zoomRange, centerNx - zoomRange / 2));
        const offsetY = Math.max(0, Math.min(1 - zoomRange, centerNy - zoomRange / 2));
        
        // Set uniforms
        const setFloat = (name, value) => {
            const loc = gl.getUniformLocation(program, name);
            if (loc !== null) gl.uniform1f(loc, value);
        };
        
        const setInt = (name, value) => {
            const loc = gl.getUniformLocation(program, name);
            if (loc !== null) gl.uniform1i(loc, value);
        };
        
        const setVec2 = (name, v1, v2) => {
            const loc = gl.getUniformLocation(program, name);
            if (loc !== null) gl.uniform2f(loc, v1, v2);
        };
        
        const setVec4 = (name, v1, v2, v3, v4) => {
            const loc = gl.getUniformLocation(program, name);
            if (loc !== null) gl.uniform4f(loc, v1, v2, v3, v4);
        };
        
        setVec2('u_resolution', previewSize / zoomRange, previewSize / zoomRange);
        setVec2('u_tileOffset', offsetX * previewSize / zoomRange, offsetY * previewSize / zoomRange);
        setVec2('u_tileSize', previewSize, previewSize);
        setFloat('u_l1', this.params.l1);
        setFloat('u_l2', this.params.l2);
        setFloat('u_m1', this.params.m1);
        setFloat('u_m2', this.params.m2);
        setFloat('u_g', this.params.g);
        setFloat('u_dt', this.params.dt);
        setInt('u_maxIter', this.params.maxIter);
        setFloat('u_threshold', this.params.threshold);
        setFloat('u_perturbation', this.params.perturbation);
        setInt('u_mode', this.mode);
        
        if (this.mode === 0) {
            setVec4('u_fixedState', 0, 0, 0, 0);
        } else {
            setVec4('u_fixedState', this.fixedState.theta1, this.fixedState.theta2, 
                    this.fixedState.omega1, this.fixedState.omega2);
        }
        setFloat('u_velocityScale', this.params.velocityScale);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.flush();
        
        // Copy to preview canvas
        this.velocityPreviewCtx.drawImage(tempCanvas, 0, 0);
        
        // Update info
        const state = this.getStateFromMapCoords(centerNx, centerNy);
        document.getElementById('velocityPreviewInfo').textContent = 
            `ω₁=${state.omega1.toFixed(2)} ω₂=${state.omega2.toFixed(2)}`;
    }
    
    // Physics functions that exactly match the GPU implementation
    computeAccelerations(state) {
        const { l1, l2, m1, m2, g } = this.params;
        const M = m1 + m2;
        
        const delta = state.theta1 - state.theta2;
        const sinDelta = Math.sin(delta);
        const cosDelta = Math.cos(delta);
        
        const alpha_denom = m1 + m2 * sinDelta * sinDelta;
        
        const num1 = -m2 * l1 * state.omega1 * state.omega1 * sinDelta * cosDelta
                   - m2 * l2 * state.omega2 * state.omega2 * sinDelta
                   - M * g * Math.sin(state.theta1)
                   + m2 * g * Math.sin(state.theta2) * cosDelta;
        
        const num2 = M * l1 * state.omega1 * state.omega1 * sinDelta
                   + m2 * l2 * state.omega2 * state.omega2 * sinDelta * cosDelta
                   + M * g * Math.sin(state.theta1) * cosDelta
                   - M * g * Math.sin(state.theta2);
        
        return {
            alpha1: num1 / (l1 * alpha_denom),
            alpha2: num2 / (l2 * alpha_denom)
        };
    }
    
    stepPhysicsRK4(state) {
        const dt = this.params.dt;
        
        const getDerivatives = (s) => ({
            dtheta1: s.omega1,
            dtheta2: s.omega2,
            domega1: this.computeAccelerations(s).alpha1,
            domega2: this.computeAccelerations(s).alpha2
        });
        
        const k1 = getDerivatives(state);
        
        const s2 = {
            theta1: state.theta1 + 0.5 * dt * k1.dtheta1,
            theta2: state.theta2 + 0.5 * dt * k1.dtheta2,
            omega1: state.omega1 + 0.5 * dt * k1.domega1,
            omega2: state.omega2 + 0.5 * dt * k1.domega2
        };
        const k2 = getDerivatives(s2);
        
        const s3 = {
            theta1: state.theta1 + 0.5 * dt * k2.dtheta1,
            theta2: state.theta2 + 0.5 * dt * k2.dtheta2,
            omega1: state.omega1 + 0.5 * dt * k2.domega1,
            omega2: state.omega2 + 0.5 * dt * k2.domega2
        };
        const k3 = getDerivatives(s3);
        
        const s4 = {
            theta1: state.theta1 + dt * k3.dtheta1,
            theta2: state.theta2 + dt * k3.dtheta2,
            omega1: state.omega1 + dt * k3.domega1,
            omega2: state.omega2 + dt * k3.domega2
        };
        const k4 = getDerivatives(s4);
        
        return {
            theta1: state.theta1 + dt * (k1.dtheta1 + 2*k2.dtheta1 + 2*k3.dtheta1 + k4.dtheta1) / 6,
            theta2: state.theta2 + dt * (k1.dtheta2 + 2*k2.dtheta2 + 2*k3.dtheta2 + k4.dtheta2) / 6,
            omega1: state.omega1 + dt * (k1.domega1 + 2*k2.domega1 + 2*k3.domega1 + k4.domega1) / 6,
            omega2: state.omega2 + dt * (k1.domega2 + 2*k2.domega2 + 2*k3.domega2 + k4.domega2) / 6
        };
    }
    
    measureDivergence(s1, s2) {
        const dTheta1 = s1.theta1 - s2.theta1;
        const dTheta2 = s1.theta2 - s2.theta2;
        const dOmega1 = s1.omega1 - s2.omega1;
        const dOmega2 = s1.omega2 - s2.omega2;
        return Math.sqrt(dTheta1*dTheta1 + dTheta2*dTheta2 + dOmega1*dOmega1 + dOmega2*dOmega2);
    }
    
    startPendulumSimulation() {
        if (!this.hoverState) return;
        
        this.pendulumSimRunning = true;
        
        // Initialize states: original and perturbed (matching GPU)
        const baseState = { ...this.hoverState };
        this.pendulumSimStates = {
            state1: { ...baseState },
            state2: {
                theta1: baseState.theta1,
                theta2: baseState.theta2,
                omega1: baseState.omega1 + this.params.perturbation,
                omega2: baseState.omega2 + this.params.perturbation * 0.7
            },
            trail1: [],
            trail2: [],
            iteration: 0,
            maxTrail: 200
        };
        
        // Disable play button during simulation
        document.getElementById('playPendulumBtn').disabled = true;
        
        this.animatePendulumSimulation();
    }
    
    animatePendulumSimulation() {
        if (!this.pendulumSimRunning) return;
        
        const sim = this.pendulumSimStates;
        const canvas = this.pendulumPreviewCanvas;
        const ctx = this.pendulumPreviewCtx;
        const cx = canvas.width / 2;
        const cy = canvas.height / 3;
        const scale = 60;
        
        // Multiple physics steps per frame
        const steps = 4;
        const dt = this.params.dt / steps;
        
        for (let i = 0; i < steps; i++) {
            // Store old dt and use smaller step
            const oldDt = this.params.dt;
            this.params.dt = dt;
            
            sim.state1 = this.stepPhysicsRK4(sim.state1);
            sim.state2 = this.stepPhysicsRK4(sim.state2);
            
            this.params.dt = oldDt;
            sim.iteration++;
        }
        
        // Calculate positions
        const getPositions = (s) => {
            const x1 = cx + Math.sin(s.theta1) * this.params.l1 * scale;
            const y1 = cy + Math.cos(s.theta1) * this.params.l1 * scale;
            const x2 = x1 + Math.sin(s.theta2) * this.params.l2 * scale;
            const y2 = y1 + Math.cos(s.theta2) * this.params.l2 * scale;
            return { x1, y1, x2, y2 };
        };
        
        const pos1 = getPositions(sim.state1);
        const pos2 = getPositions(sim.state2);
        
        // Add to trails
        sim.trail1.push({ x: pos1.x2, y: pos1.y2 });
        sim.trail2.push({ x: pos2.x2, y: pos2.y2 });
        if (sim.trail1.length > sim.maxTrail) sim.trail1.shift();
        if (sim.trail2.length > sim.maxTrail) sim.trail2.shift();
        
        // Calculate divergence
        const divergence = this.measureDivergence(sim.state1, sim.state2);
        
        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw trails (state1: cyan, state2: magenta)
        const drawTrail = (trail, color) => {
            if (trail.length < 2) return;
            ctx.fillStyle = color;
            for (let i = 0; i < trail.length; i++) {
                const alpha = (i / trail.length) * 0.5;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(trail[i].x, trail[i].y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        };
        
        drawTrail(sim.trail1, 'rgba(0, 255, 255, 0.8)');
        drawTrail(sim.trail2, 'rgba(255, 0, 255, 0.8)');
        
        // Draw pendulum 1 (cyan)
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(pos1.x1, pos1.y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos1.x1, pos1.y1);
        ctx.lineTo(pos1.x2, pos1.y2);
        ctx.stroke();
        
        // Draw pendulum 2 (magenta)
        ctx.strokeStyle = '#f0f';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(pos2.x1, pos2.y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos2.x1, pos2.y1);
        ctx.lineTo(pos2.x2, pos2.y2);
        ctx.stroke();
        
        // Draw masses
        const r1 = Math.sqrt(this.params.m1) * 5;
        const r2 = Math.sqrt(this.params.m2) * 5;
        
        ctx.fillStyle = '#0ff';
        ctx.beginPath();
        ctx.arc(pos1.x1, pos1.y1, r1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pos1.x2, pos1.y2, r2, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#f0f';
        ctx.beginPath();
        ctx.arc(pos2.x1, pos2.y1, r1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pos2.x2, pos2.y2, r2, 0, Math.PI * 2);
        ctx.fill();
        
        // Pivot
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Update info
        document.getElementById('pendulumPreviewInfo').textContent = 
            `Divergence: ${divergence.toFixed(6)} | Iter: ${sim.iteration}`;
        
        // Check if exceeded threshold
        if (divergence > this.params.threshold) {
            document.getElementById('pendulumPreviewInfo').textContent += ' ✓ DIVERGED';
            this.pendulumSimRunning = false;
            document.getElementById('playPendulumBtn').disabled = false;
            return;
        }
        
        this.pendulumSimAnimationId = requestAnimationFrame(() => this.animatePendulumSimulation());
    }
    
    resetPendulumSimulation() {
        this.pendulumSimRunning = false;
        if (this.pendulumSimAnimationId) {
            cancelAnimationFrame(this.pendulumSimAnimationId);
        }
        this.pendulumSimStates = null;
        document.getElementById('playPendulumBtn').disabled = false;
        
        if (this.hoverState) {
            this.drawPendulumPreview(this.hoverState);
        } else {
            // Clear canvas
            const canvas = this.pendulumPreviewCanvas;
            this.pendulumPreviewCtx.fillStyle = '#0a0a0a';
            this.pendulumPreviewCtx.fillRect(0, 0, canvas.width, canvas.height);
            document.getElementById('pendulumPreviewInfo').textContent = 'Hover over map';
        }
    }
    
    async generateMap() {
        if (this.isRendering) {
            this.shouldStop = true;
            await new Promise(r => setTimeout(r, 100));
        }
        
        this.isRendering = true;
        this.shouldStop = false;
        
        const loading = document.getElementById('loadingIndicator');
        const progressFill = document.getElementById('progressFill');
        const stats = document.getElementById('renderStats');
        const generateBtn = document.getElementById('generateBtn');
        
        loading.style.display = 'flex';
        generateBtn.disabled = true;
        
        const startTime = performance.now();
        const tileSize = this.params.tileSize;
        const resolution = this.params.resolution;
        const tilesX = Math.ceil(resolution / tileSize);
        const tilesY = Math.ceil(resolution / tileSize);
        const totalTiles = tilesX * tilesY;
        
        this.compositeCanvas.width = resolution;
        this.compositeCanvas.height = resolution;
        const ctx = this.compositeCanvas.getContext('2d');
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, resolution, resolution);
        
        let completedTiles = 0;
        
        for (let ty = 0; ty < tilesY && !this.shouldStop; ty++) {
            for (let tx = 0; tx < tilesX && !this.shouldStop; tx++) {
                const tileOffsetX = tx * tileSize;
                const tileOffsetY = ty * tileSize;
                const actualTileWidth = Math.min(tileSize, resolution - tileOffsetX);
                const actualTileHeight = Math.min(tileSize, resolution - tileOffsetY);
                
                await this.renderTile(tileOffsetX, tileOffsetY, actualTileWidth, actualTileHeight);
                
                ctx.drawImage(this.tileCanvas, 0, 0, actualTileWidth, actualTileHeight, 
                             tileOffsetX, tileOffsetY, actualTileWidth, actualTileHeight);
                
                completedTiles++;
                const progress = (completedTiles / totalTiles) * 100;
                progressFill.style.width = progress + '%';
                
                await new Promise(r => requestAnimationFrame(r));
            }
        }
        
        this.drawCompositeToCanvas();
        
        const elapsed = performance.now() - startTime;
        stats.textContent = `Rendered ${resolution}x${resolution} in ${(elapsed/1000).toFixed(1)}s`;
        
        loading.style.display = 'none';
        generateBtn.disabled = false;
        progressFill.style.width = '0%';
        this.isRendering = false;
    }
    
    drawCompositeToCanvas() {
        const ctx = this.canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(this.compositeCanvas, 0, 0, this.canvas.width, this.canvas.height);
            return;
        }
    }
    
    renderTile(offsetX, offsetY, width, height) {
        return new Promise((resolve) => {
            const gl = this.tileGl;
            if (!gl || gl.isContextLost()) {
                resolve();
                return;
            }
            
            if (this.tileCanvas.width !== width || this.tileCanvas.height !== height) {
                this.tileCanvas.width = width;
                this.tileCanvas.height = height;
                gl.viewport(0, 0, width, height);
            }
            
            if (!this.tileProgram) {
                resolve();
                return;
            }
            
            gl.useProgram(this.tileProgram);
            
            const setFloat = (name, value) => {
                const loc = gl.getUniformLocation(this.tileProgram, name);
                if (loc !== null) gl.uniform1f(loc, value);
            };
            
            const setInt = (name, value) => {
                const loc = gl.getUniformLocation(this.tileProgram, name);
                if (loc !== null) gl.uniform1i(loc, value);
            };
            
            const setVec2 = (name, v1, v2) => {
                const loc = gl.getUniformLocation(this.tileProgram, name);
                if (loc !== null) gl.uniform2f(loc, v1, v2);
            };
            
            const setVec4 = (name, v1, v2, v3, v4) => {
                const loc = gl.getUniformLocation(this.tileProgram, name);
                if (loc !== null) gl.uniform4f(loc, v1, v2, v3, v4);
            };
            
            setVec2('u_resolution', this.params.resolution, this.params.resolution);
            setVec2('u_tileOffset', offsetX, offsetY);
            setVec2('u_tileSize', width, height);
            setFloat('u_l1', this.params.l1);
            setFloat('u_l2', this.params.l2);
            setFloat('u_m1', this.params.m1);
            setFloat('u_m2', this.params.m2);
            setFloat('u_g', this.params.g);
            setFloat('u_dt', this.params.dt);
            setInt('u_maxIter', this.params.maxIter);
            setFloat('u_threshold', this.params.threshold);
            setFloat('u_perturbation', this.params.perturbation);
            setInt('u_mode', this.mode);
            setVec4('u_fixedState', this.fixedState.theta1, this.fixedState.theta2, 
                    this.fixedState.omega1, this.fixedState.omega2);
            setFloat('u_velocityScale', this.params.velocityScale);
            
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            gl.flush();
            
            requestAnimationFrame(resolve);
        });
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.chaosRenderer = new ChaosMapRenderer();
});
