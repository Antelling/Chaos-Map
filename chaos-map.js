// Double Pendulum Chaos Map - GPU Simulation with Preview Modes

// Embedded shader sources (to avoid CORS issues with file:// protocol)


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
        this.velocityPreviewCanvas = document.getElementById('velocityPreviewCanvas');
        this.velocityPreviewCtx = this.velocityPreviewCanvas.getContext('2d');
        
        // GPU-based pendulum preview - WebGL context for rendering
        this.pendulumPreviewGl = null;
        this.pendulumPreviewProgram = null;
        this.pendulumPreviewState = null; // {theta1, theta2, omega1, omega2}
        this.pendulumPreviewPerturbedState = null;
        this.pendulumPreviewTrail = []; // Array of {x1, y1, x2, y2} for both pendulums
        this.pendulumPreviewTrailBuffer = null; // WebGL buffer for trails
        
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
            perturbMode: 'fixed', // 'fixed' or 'random'
            resolution: 1024,
            tileSize: 64,
            velocityScale: 5.0,
            velocityOffsetX: 0.0,
            velocityOffsetY: 0.0,
            cyclePeriod: 500
        };
        
        // Mode: 0 = position map, 1 = velocity map
        this.mode = 0;
        this.fixedState = { theta1: 0, theta2: 0, omega1: 0, omega2: 0 };
        
        // Zoom state for position map
        this.zoomState = {
            enabled: false,
            minX: 0, // normalized 0-1
            maxX: 1,
            minY: 0,
            maxY: 1
        };
        this.zoomHistory = []; // Stack for zoom levels
        
        // Zoom state for velocity map (stores previous scale/offset)
        this.velocityZoomHistory = [];
        
        // Drag selection state
        this.isDragging = false;
        this.dragStart = null;
        this.dragCurrent = null;
        
        // Color mapping: 0=linear, 1=log, 2=sqrt, 3=exp, 4=smoothstep, 5=gamma, 6=hyperlog, 7=cap97, 8=cyclical
        this.cyclePeriod = 500;
        this.colorMapping = 0; // Default to linear (original rainbow)
        
        // Hue palette mapping: 0=rainbow, 1=heatmap, 2=cool, 3=hot, 4=grayscale, 5=viridis, 6=plasma, 7=inv_rainbow
        this.hueMapping = 0; // Default to rainbow
        
        // Rendering state
        this.isRendering = false;
        this.shouldStop = false;
        
        // Preview modes
        this.pendulumPreviewEnabled = false;
        this.velocityPreviewEnabled = false;
        this.hoverPosition = null; // {nx, ny} normalized coordinates
        this.hoverState = null; // {theta1, theta2, omega1, omega2}
        this.selectedState = null; // Stored state for when user clicks play
        
        // Debounce for velocity preview
        this.velocityPreviewTimeout = null;
        
        // Zoom selection overlay
        this.zoomSelectionEl = document.getElementById('zoomSelection');
        
        // Pendulum simulation state
        this.pendulumSimRunning = false;
        this.pendulumSimStates = null; // {state1, state2, trail1, trail2, iteration}
        this.pendulumSimAnimationId = null;
        this.pendulumSimSpeed = 1; // Number of physics steps per frame
        
        this.init();
    }
    
    init() {
        this.setupWebGL();
        this.setupTileWebGL();
        this.setupPendulumPreviewWebGL();
        this.setupEventListeners();
        this.resizeCanvas();
        this.updateLegend();
        
        // Set initial selected state (center of map, theta1=0, theta2=0)
        this.selectedState = { theta1: 0, theta2: 0, omega1: 0, omega2: 0 };
        
        // Initial render
        this.generateMap();
        
        // Initial velocity preview render (center of map)
        setTimeout(() => {
            this.renderVelocityPreview(0.5, 0.5);
        }, 100);
    }
    
    setupPendulumPreviewWebGL() {
        // Initialize WebGL context for pendulum preview
        this.pendulumPreviewGl = this.pendulumPreviewCanvas.getContext('webgl', {
            antialias: true,
            preserveDrawingBuffer: true
        });
        
        if (!this.pendulumPreviewGl) {
            console.error('WebGL not supported for pendulum preview');
            return;
        }
        
        const gl = this.pendulumPreviewGl;
        
        // Vertex shader for pendulum rendering
        const vsSource = `
            attribute vec2 a_position;
            uniform vec2 u_resolution;
            
            void main() {
                // Convert from pixel coordinates to clip space
                vec2 clipSpace = ((a_position / u_resolution) * 2.0) - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0.0, 1.0);
            }
        `;
        
        // Fragment shader for pendulum rendering
        const fsSource = `
            precision mediump float;
            uniform vec4 u_color;
            
            void main() {
                gl_FragColor = u_color;
            }
        `;
        
        const vs = this.createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, fsSource);
        
        if (!vs || !fs) {
            console.error('Failed to compile pendulum preview shaders');
            return;
        }
        
        this.pendulumPreviewProgram = this.createProgram(gl, vs, fs);
        
        if (!this.pendulumPreviewProgram) {
            console.error('Failed to create pendulum preview program');
            return;
        }
        
        // Create trail buffer
        this.pendulumPreviewTrailBuffer = gl.createBuffer();
        
        // Create state texture for GPU physics
        this.pendulumStateTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.pendulumStateTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    

    
    setupWebGL() {
        // Main canvas uses 2D context for compositing tiles
        // WebGL is only used for tile rendering (in setupTileWebGL)
        this.mainCtx = this.canvas.getContext('2d');
        
        if (!this.mainCtx) {
            alert('Canvas 2D context not supported');
            return;
        }
    }
    
    setupTileWebGL() {
        this.tileCanvas.width = this.params.tileSize;
        this.tileCanvas.height = this.params.tileSize;
        
        const contextName = 'webgl';
        
        this.tileGl = this.tileCanvas.getContext(contextName, {
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
        
        // Get shader sources
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
        
        // Color mapping dropdown - re-render with new color settings
        document.getElementById('colorMappingSelect').addEventListener('change', (e) => {
            this.colorMapping = parseInt(e.target.value);
            // Show/hide cycle period input based on selection
            const cycleGroup = document.getElementById('cyclePeriodGroup');
            if (cycleGroup) {
                cycleGroup.style.display = (this.colorMapping === 8) ? 'flex' : 'none';
            }
            if (!this.isRendering) {
                this.reapplyColorMapping();
            }
        });
        
        // Cycle period input
        const cycleInput = document.getElementById('cyclePeriodInput');
        if (cycleInput) {
            cycleInput.addEventListener('change', (e) => {
                this.cyclePeriod = parseFloat(e.target.value) || 500;
                if (this.colorMapping === 8 && !this.isRendering) {
                    this.reapplyColorMapping();
                }
            });
        }
        
        // Hue mapping dropdown - re-render with new color settings
        document.getElementById('hueMappingSelect').addEventListener('change', (e) => {
            this.hueMapping = parseInt(e.target.value);
            this.updateLegend();
            if (!this.isRendering) {
                this.reapplyColorMapping();
            }
        });
        
        // Generate button
        document.getElementById('generateBtn').addEventListener('click', () => {
            this.generateMap();
        });
        
        // Velocity viewport controls
        const velocityRangeSelect = document.getElementById('velocityRangeSelect');
        const velocityOffsetX = document.getElementById('velocityOffsetX');
        const velocityOffsetY = document.getElementById('velocityOffsetY');
        
        if (velocityRangeSelect) {
            velocityRangeSelect.addEventListener('change', (e) => {
                this.params.velocityScale = parseFloat(e.target.value);
                document.getElementById('velocityRangeValue').textContent = `±${this.params.velocityScale}`;
                if (this.mode === 1) {
                    this.generateMap();
                }
            });
        }
        
        if (velocityOffsetX) {
            velocityOffsetX.addEventListener('change', (e) => {
                this.params.velocityOffsetX = parseFloat(e.target.value) || 0;
                if (this.mode === 1) {
                    this.generateMap();
                }
            });
        }
        
        if (velocityOffsetY) {
            velocityOffsetY.addEventListener('change', (e) => {
                this.params.velocityOffsetY = parseFloat(e.target.value) || 0;
                if (this.mode === 1) {
                    this.generateMap();
                }
            });
        }
        
        // Back button
        document.getElementById('backToMapBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.mode = 0;
            // Reset zoom when going back to position map
            this.zoomState.minX = 0;
            this.zoomState.maxX = 1;
            this.zoomState.minY = 0;
            this.zoomState.maxY = 1;
            this.zoomState.enabled = false;
            this.zoomHistory = [];
            // Also reset velocity zoom state for next time
            this.velocityZoomHistory = [];
            this.params.velocityScale = 5.0;
            this.params.velocityOffsetX = 0;
            this.params.velocityOffsetY = 0;
            // Update velocity UI inputs
            const scaleSelect = document.getElementById('velocityRangeSelect');
            const offsetXInput = document.getElementById('velocityOffsetX');
            const offsetYInput = document.getElementById('velocityOffsetY');
            if (scaleSelect) {
                for (const opt of scaleSelect.options) {
                    if (parseFloat(opt.value) === 5.0) {
                        opt.selected = true;
                        break;
                    }
                }
            }
            if (offsetXInput) offsetXInput.value = '0';
            if (offsetYInput) offsetYInput.value = '0';
            const rangeValue = document.getElementById('velocityRangeValue');
            if (rangeValue) rangeValue.textContent = '±5';
            this.updateZoomUI();
            this.updateModeUI();
            this.generateMap();
            // Re-render velocity preview with current selection
            if (this.selectedState) {
                setTimeout(() => {
                    this.renderVelocityPreview(0.5, 0.5);
                }, 100);
            }
        });
        
        // Preview buttons
        // Pendulum pin: toggles whether clicking starts a simulation
        document.getElementById('pendulumPreviewBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.pendulumPreviewEnabled = !this.pendulumPreviewEnabled;
            if (this.pendulumPreviewEnabled) {
                // Disable velocity pin when pendulum is active
                this.velocityPreviewEnabled = false;
            }
            this.updatePreviewUI();
        });
        
        // Velocity pin: toggles velocity mode (enters/exits velocity map view)
        document.getElementById('velocityPreviewBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.velocityPreviewEnabled = !this.velocityPreviewEnabled;
            if (this.velocityPreviewEnabled) {
                // Disable pendulum pin when velocity is active (but don't stop simulation)
                this.pendulumPreviewEnabled = false;
            }
            this.updatePreviewUI();
        });
        
        // Reset button for pendulum simulation
        document.getElementById('resetPendulumBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.resetPendulumSimulation();
        });
        
        // Simulation speed slider
        const speedSlider = document.getElementById('simSpeedSlider');
        if (speedSlider) {
            speedSlider.addEventListener('input', (e) => {
                this.pendulumSimSpeed = parseInt(e.target.value);
                document.getElementById('speedValue').textContent = this.pendulumSimSpeed + 'x';
            });
        }
        
        // Map hover interaction
        this.canvas.addEventListener('mousemove', (e) => this.handleMapHover(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMapLeave());
        this.canvas.addEventListener('mousedown', (e) => this.handleMapMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMapMouseMove(e));
        window.addEventListener('mouseup', (e) => this.handleMapMouseUp(e));
        this.canvas.addEventListener('click', (e) => this.handleMapClick(e));
        
        // Reset zoom button
        document.getElementById('resetZoomBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.resetZoom();
        });
        
        // Prevent map click from bubbling when clicking on controls
        document.getElementById('pendulumPreviewBtn').addEventListener('click', (e) => e.stopPropagation());
        document.getElementById('velocityPreviewBtn').addEventListener('click', (e) => e.stopPropagation());
        
        // Click outside map to clear navigation/preview mode
        document.addEventListener('click', (e) => {
            const mapContainer = document.getElementById('mapContainer');
            const sidebar = document.querySelector('.sidebar');
            const topBar = document.querySelector('.top-bar');
            
            // If click is outside map, sidebar, and top-bar, clear preview modes
            // (but don't stop pendulum simulation)
            if (!mapContainer.contains(e.target) && 
                !sidebar.contains(e.target) && 
                !topBar.contains(e.target)) {
                this.pendulumPreviewEnabled = false;
                this.velocityPreviewEnabled = false;
                this.updatePreviewUI();
                this.handleMapLeave();
            }
        });
        
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
        this.params.perturbMode = document.getElementById('perturbModeSelect').value || 'fixed';
    }
    

    
    updatePreviewUI() {
        const pendulumBtn = document.getElementById('pendulumPreviewBtn');
        const velocityBtn = document.getElementById('velocityPreviewBtn');
        const pendulumInfo = document.getElementById('pendulumPreviewInfo');
        const velocityInfo = document.getElementById('velocityPreviewInfo');
        const pendulumControls = document.getElementById('pendulumControls');
        const pendulumSpeedControls = document.getElementById('pendulumSpeedControls');
        
        pendulumBtn.classList.toggle('active', this.pendulumPreviewEnabled);
        velocityBtn.classList.toggle('active', this.velocityPreviewEnabled);
        
        // Pendulum pin: controls whether clicking starts simulation
        if (this.pendulumPreviewEnabled) {
            pendulumInfo.textContent = 'Click map to start simulation';
            pendulumControls.style.display = 'flex';
        } else {
            pendulumInfo.textContent = '📌 Click to enable simulation mode';
            pendulumControls.style.display = 'none';
            // Don't reset simulation when disabling - let it keep running
        }
        // Speed controls always visible when simulation is running or available
        pendulumSpeedControls.style.display = 'flex';
        
        // Velocity pin: indicates velocity mode is ready
        if (this.velocityPreviewEnabled) {
            velocityInfo.textContent = 'Click map to view velocity map';
        } else {
            velocityInfo.textContent = '📌 Click to enable velocity mode';
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
        const viewportPanel = document.getElementById('velocityViewportPanel');
        const zoomPanel = document.getElementById('zoomPanel');
        
        if (this.mode === 0) {
            indicator.textContent = 'Position Map Mode';
            indicator.className = 'mode-indicator';
            backBtn.style.display = 'none';
            if (zoomPanel) zoomPanel.style.display = 'block';
            
            // Update overlay with zoom info if zoomed
            if (this.zoomState.enabled) {
                const theta1Min = ((this.zoomState.minX * 2 - 1) * Math.PI).toFixed(2);
                const theta1Max = ((this.zoomState.maxX * 2 - 1) * Math.PI).toFixed(2);
                const theta2Min = ((this.zoomState.minY * 2 - 1) * Math.PI).toFixed(2);
                const theta2Max = ((this.zoomState.maxY * 2 - 1) * Math.PI).toFixed(2);
                overlay.textContent = `θ₁: [${theta1Min}, ${theta1Max}] | θ₂: [${theta2Min}, ${theta2Max}]`;
            } else {
                overlay.textContent = 'Drag to zoom, hover for previews';
            }
            if (viewportPanel) viewportPanel.style.display = 'none';
        } else {
            const centerX = this.params.velocityOffsetX.toFixed(1);
            const centerY = this.params.velocityOffsetY.toFixed(1);
            indicator.textContent = `Velocity Map (θ₁=${this.fixedState.theta1.toFixed(2)}, θ₂=${this.fixedState.theta2.toFixed(2)})`;
            indicator.className = 'mode-indicator velocity-mode';
            backBtn.style.display = 'block';
            // Show zoom panel in velocity mode too
            if (zoomPanel) zoomPanel.style.display = 'block';
            if (viewportPanel) viewportPanel.style.display = 'block';
            
            // Update overlay with current viewport info
            const range = this.params.velocityScale;
            const minX = (this.params.velocityOffsetX - range).toFixed(1);
            const maxX = (this.params.velocityOffsetX + range).toFixed(1);
            const minY = (this.params.velocityOffsetY - range).toFixed(1);
            const maxY = (this.params.velocityOffsetY + range).toFixed(1);
            overlay.textContent = `ω₁: [${minX}, ${maxX}] | ω₂: [${minY}, ${maxY}] - Drag to zoom`;
        }
    }
    
    updateLegend() {
        const gradient = document.getElementById('legendGradient');
        const fastLabel = document.getElementById('legendFast');
        const slowLabel = document.getElementById('legendSlow');
        
        const palette = this.hueMapping;
        
        // Define gradients and labels for each palette
        const palettes = {
            0: { // Rainbow
                gradient: 'linear-gradient(90deg, hsl(0, 80%, 50%), hsl(30, 80%, 50%), hsl(60, 80%, 50%), hsl(120, 80%, 50%), hsl(180, 80%, 50%), hsl(240, 80%, 50%), hsl(300, 80%, 50%))',
                fast: 'Fast (red)',
                slow: 'Slow (purple)'
            },
            1: { // Heatmap
                gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(255,0,0), rgb(255,255,0), rgb(255,255,255))',
                fast: 'Fast (black)',
                slow: 'Slow (white)'
            },
            2: { // Cool
                gradient: 'linear-gradient(90deg, hsl(240, 80%, 50%), hsl(180, 80%, 50%), hsl(120, 80%, 50%), hsl(60, 80%, 50%))',
                fast: 'Fast (blue)',
                slow: 'Slow (yellow)'
            },
            3: { // Hot
                gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(255,0,0), rgb(255,255,0))',
                fast: 'Fast (black)',
                slow: 'Slow (yellow)'
            },
            4: { // Grayscale
                gradient: 'linear-gradient(90deg, rgb(255,255,255), rgb(0,0,0))',
                fast: 'Fast (white)',
                slow: 'Slow (black)'
            },
            5: { // Viridis
                gradient: 'linear-gradient(90deg, rgb(128,0,128), rgb(0,128,255), rgb(0,255,128), rgb(255,255,0))',
                fast: 'Fast (purple)',
                slow: 'Slow (yellow)'
            },
            6: { // Plasma
                gradient: 'linear-gradient(90deg, rgb(0,0,0), rgb(128,0,128), rgb(255,0,128), rgb(255,255,0))',
                fast: 'Fast (black)',
                slow: 'Slow (yellow)'
            },
            7: { // Inverted Rainbow
                gradient: 'linear-gradient(90deg, hsl(300, 80%, 50%), hsl(240, 80%, 50%), hsl(180, 80%, 50%), hsl(120, 80%, 50%), hsl(60, 80%, 50%), hsl(30, 80%, 50%), hsl(0, 80%, 50%))',
                fast: 'Fast (purple)',
                slow: 'Slow (red)'
            }
        };
        
        const p = palettes[palette] || palettes[0];
        if (gradient) gradient.style.background = p.gradient;
        if (fastLabel) fastLabel.textContent = p.fast;
        if (slowLabel) slowLabel.textContent = p.slow;
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
            // Apply zoom transformation if zoomed in
            let finalNx = nx;
            let finalNy = ny;
            if (this.zoomState.enabled) {
                finalNx = this.zoomState.minX + nx * (this.zoomState.maxX - this.zoomState.minX);
                finalNy = this.zoomState.minY + ny * (this.zoomState.maxY - this.zoomState.minY);
            }
            const theta1 = (finalNx * 2 - 1) * Math.PI;
            const theta2 = (finalNy * 2 - 1) * Math.PI;
            return { theta1, theta2, omega1: 0, omega2: 0 };
        } else {
            // Velocity map: map to omega1, omega2 with offset
            const omega1 = (nx * 2 - 1) * this.params.velocityScale + this.params.velocityOffsetX;
            const omega2 = (ny * 2 - 1) * this.params.velocityScale + this.params.velocityOffsetY;
            return {
                theta1: this.fixedState.theta1,
                theta2: this.fixedState.theta2,
                omega1,
                omega2
            };
        }
    }
    
    // Convert normalized map coords to physical coordinates for shader
    getPhysicalCoordsFromNormalized(nx, ny) {
        if (this.mode === 0) {
            // Apply zoom transformation
            let finalNx = nx;
            let finalNy = ny;
            if (this.zoomState.enabled) {
                finalNx = this.zoomState.minX + nx * (this.zoomState.maxX - this.zoomState.minX);
                finalNy = this.zoomState.minY + ny * (this.zoomState.maxY - this.zoomState.minY);
            }
            const theta1 = (finalNx * 2 - 1) * Math.PI;
            const theta2 = (finalNy * 2 - 1) * Math.PI;
            return { theta1, theta2, omega1: 0, omega2: 0 };
        } else {
            const omega1 = (nx * 2 - 1) * this.params.velocityScale + this.params.velocityOffsetX;
            const omega2 = (ny * 2 - 1) * this.params.velocityScale + this.params.velocityOffsetY;
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
        
        // Store as selected state for use when clicking play
        this.selectedState = { ...this.hoverState };
        
        // Update map marker
        const mapMarker = document.getElementById('mapMarker');
        mapMarker.style.left = `${nx * 100}%`;
        mapMarker.style.top = `${(1 - ny) * 100}%`;
        mapMarker.classList.add('active');
        
        // Update pendulum preview if enabled and not running simulation
        if (this.pendulumPreviewEnabled && !this.pendulumSimRunning) {
            this.pendulumPreviewState = { ...this.hoverState };
            this.drawPendulumPreview(this.pendulumPreviewState);
        }
        
        // Velocity preview is ALWAYS active (debounced)
        if (this.velocityPreviewTimeout) {
            clearTimeout(this.velocityPreviewTimeout);
        }
        this.velocityPreviewTimeout = setTimeout(() => {
            this.renderVelocityPreview(nx, ny);
        }, 500);
    }
    
    handleMapClick(e) {
        const { nx, ny } = this.getMapCoordinates(e);
        this.selectedState = this.getStateFromMapCoords(nx, ny);
        this.hoverState = { ...this.selectedState };
        this.hoverPosition = { nx, ny };
        
        // Clicking the map deselects all pinpoints (but doesn't stop pendulum sim)
        const hadPendulumPin = this.pendulumPreviewEnabled;
        const hadVelocityPin = this.velocityPreviewEnabled;
        this.pendulumPreviewEnabled = false;
        this.velocityPreviewEnabled = false;
        if (hadPendulumPin || hadVelocityPin) {
            this.updatePreviewUI();
        }
        
        // If pendulum pin was active, start simulation at clicked point
        if (hadPendulumPin) {
            this.startPendulumSimulation();
            return;
        }
        
        // If velocity pin was active, switch to velocity map
        if (hadVelocityPin) {
            this.mode = 1;
            this.fixedState = {
                theta1: this.selectedState.theta1,
                theta2: this.selectedState.theta2,
                omega1: 0,
                omega2: 0
            };
            this.updateModeUI();
            this.generateMap();
            return;
        }
    }
    
    handleMapLeave() {
        this.hoverPosition = null;
        this.hoverState = null;
        document.getElementById('mapMarker').classList.remove('active');
        // Hide zoom selection if dragging
        if (this.isDragging) {
            this.isDragging = false;
            this.dragStart = null;
            this.dragCurrent = null;
            this.updateZoomSelection();
        }
    }
    
    handleMapMouseDown(e) {
        // Allow zoom selection in both position and velocity modes (but not in preview modes)
        if (this.pendulumPreviewEnabled || this.velocityPreviewEnabled) {
            return;
        }
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.isDragging = true;
        this.dragStart = { x, y };
        this.dragCurrent = { x, y };
        this.updateZoomSelection();
    }
    
    handleMapMouseMove(e) {
        if (!this.isDragging || !this.dragStart) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        this.dragCurrent = { x, y };
        this.updateZoomSelection();
    }
    
    handleMapMouseUp(e) {
        if (!this.isDragging || !this.dragStart || !this.dragCurrent) {
            this.isDragging = false;
            this.dragStart = null;
            this.dragCurrent = null;
            this.updateZoomSelection();
            return;
        }
        
        // Calculate selection size
        const dx = Math.abs(this.dragCurrent.x - this.dragStart.x);
        const dy = Math.abs(this.dragCurrent.y - this.dragStart.y);
        const minSize = 10; // Minimum drag distance to trigger zoom
        
        if (dx >= minSize && dy >= minSize) {
            this.applyZoom();
        }
        
        this.isDragging = false;
        this.dragStart = null;
        this.dragCurrent = null;
        this.updateZoomSelection();
    }
    
    updateZoomSelection() {
        if (!this.isDragging || !this.dragStart || !this.dragCurrent) {
            this.zoomSelectionEl.classList.remove('active');
            return;
        }
        
        const container = document.getElementById('mapContainer');
        const containerRect = container.getBoundingClientRect();
        
        // Calculate selection rectangle in container coordinates
        const x1 = Math.min(this.dragStart.x, this.dragCurrent.x);
        const y1 = Math.min(this.dragStart.y, this.dragCurrent.y);
        const x2 = Math.max(this.dragStart.x, this.dragCurrent.x);
        const y2 = Math.max(this.dragStart.y, this.dragCurrent.y);
        
        // Set styles
        this.zoomSelectionEl.style.left = x1 + 'px';
        this.zoomSelectionEl.style.top = y1 + 'px';
        this.zoomSelectionEl.style.width = (x2 - x1) + 'px';
        this.zoomSelectionEl.style.height = (y2 - y1) + 'px';
        this.zoomSelectionEl.classList.add('active');
    }
    
    applyZoom() {
        const rect = this.canvas.getBoundingClientRect();
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;
        
        // Screen coordinates: Y=0 at top
        const screenX1 = Math.min(this.dragStart.x, this.dragCurrent.x);
        const screenY1 = Math.min(this.dragStart.y, this.dragCurrent.y); // Top of selection
        const screenX2 = Math.max(this.dragStart.x, this.dragCurrent.x);
        const screenY2 = Math.max(this.dragStart.y, this.dragCurrent.y); // Bottom of selection
        
        if (this.mode === 0) {
            // Position map zoom: use normalized zoomState
            // Convert to normalized coordinates (0-1, Y-flipped so ny=1 is top)
            const nx1 = screenX1 / canvasWidth;
            const ny1 = 1 - screenY2 / canvasHeight; // Bottom of selection -> smaller ny
            const nx2 = screenX2 / canvasWidth;
            const ny2 = 1 - screenY1 / canvasHeight; // Top of selection -> larger ny
            
            console.log(`Zoom selection: screen(${screenX1.toFixed(0)},${screenY1.toFixed(0)})-(${screenX2.toFixed(0)},${screenY2.toFixed(0)})`);
            console.log(`  normalized: nx=${nx1.toFixed(3)}-${nx2.toFixed(3)}, ny=${ny1.toFixed(3)}-${ny2.toFixed(3)}`);
            
            // Save current zoom state to history
            this.zoomHistory.push({
                minX: this.zoomState.minX,
                maxX: this.zoomState.maxX,
                minY: this.zoomState.minY,
                maxY: this.zoomState.maxY
            });
            
            // Calculate new zoom bounds within current view
            const currentMinX = this.zoomState.minX;
            const currentMaxX = this.zoomState.maxX;
            const currentMinY = this.zoomState.minY;
            const currentMaxY = this.zoomState.maxY;
            
            // minY maps to smaller ny (bottom of screen), maxY maps to larger ny (top of screen)
            this.zoomState.minX = currentMinX + nx1 * (currentMaxX - currentMinX);
            this.zoomState.maxX = currentMinX + nx2 * (currentMaxX - currentMinX);
            this.zoomState.minY = currentMinY + ny1 * (currentMaxY - currentMinY);
            this.zoomState.maxY = currentMinY + ny2 * (currentMaxY - currentMinY);
            this.zoomState.enabled = true;
            
            console.log(`  new zoom bounds: minX=${this.zoomState.minX.toFixed(3)}, maxX=${this.zoomState.maxX.toFixed(3)}`);
            console.log(`                   minY=${this.zoomState.minY.toFixed(3)}, maxY=${this.zoomState.maxY.toFixed(3)}`);
            
            this.updateZoomUI();
            this.generateMap();
        } else {
            // Velocity map zoom: adjust velocityScale and offsets
            // nx goes from 0 to 1, mapping to (offsetX - scale) to (offsetX + scale)
            // ny goes from 0 to 1, mapping to (offsetY - scale) to (offsetY + scale), with Y flipped
            
            const selectionWidth = (screenX2 - screenX1) / canvasWidth;
            const selectionHeight = (screenY2 - screenY1) / canvasHeight;
            
            if (selectionWidth < 0.01 || selectionHeight < 0.01) return; // Too small
            
            // Current view bounds
            const currentScale = this.params.velocityScale;
            const currentOffsetX = this.params.velocityOffsetX;
            const currentOffsetY = this.params.velocityOffsetY;
            
            // Calculate the selected region in velocity space
            // nx=0 -> offsetX - scale, nx=1 -> offsetX + scale
            const nx1 = screenX1 / canvasWidth;
            const nx2 = screenX2 / canvasWidth;
            // Y is flipped: ny=0 (bottom) -> offsetY - scale, ny=1 (top) -> offsetY + scale
            const ny1 = 1 - screenY2 / canvasHeight; // Bottom of selection
            const ny2 = 1 - screenY1 / canvasHeight; // Top of selection
            
            const vMinX = currentOffsetX - currentScale + nx1 * (2 * currentScale);
            const vMaxX = currentOffsetX - currentScale + nx2 * (2 * currentScale);
            const vMinY = currentOffsetY - currentScale + ny1 * (2 * currentScale);
            const vMaxY = currentOffsetY - currentScale + ny2 * (2 * currentScale);
            
            // Save current state to history
            this.velocityZoomHistory.push({
                velocityScale: currentScale,
                velocityOffsetX: currentOffsetX,
                velocityOffsetY: currentOffsetY
            });
            
            // Calculate new zoom
            const newScale = Math.max(0.01, Math.min(vMaxX - vMinX, vMaxY - vMinY) / 2);
            const newOffsetX = (vMinX + vMaxX) / 2;
            const newOffsetY = (vMinY + vMaxY) / 2;
            
            this.params.velocityScale = newScale;
            this.params.velocityOffsetX = newOffsetX;
            this.params.velocityOffsetY = newOffsetY;
            
            // Update UI inputs
            const scaleSelect = document.getElementById('velocityRangeSelect');
            const offsetXInput = document.getElementById('velocityOffsetX');
            const offsetYInput = document.getElementById('velocityOffsetY');
            
            // Find closest scale option or use custom
            if (scaleSelect) {
                // Try to find matching option
                let matched = false;
                for (const opt of scaleSelect.options) {
                    if (Math.abs(parseFloat(opt.value) - newScale) < 0.001) {
                        opt.selected = true;
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    // Add custom option if not found
                    const customOpt = document.createElement('option');
                    customOpt.value = newScale;
                    customOpt.textContent = `±${newScale.toFixed(2)} (custom)`;
                    customOpt.selected = true;
                    // Remove any existing custom option first
                    for (let i = scaleSelect.options.length - 1; i >= 0; i--) {
                        if (scaleSelect.options[i].textContent.includes('custom')) {
                            scaleSelect.remove(i);
                        }
                    }
                    scaleSelect.appendChild(customOpt);
                }
            }
            if (offsetXInput) offsetXInput.value = newOffsetX.toFixed(2);
            if (offsetYInput) offsetYInput.value = newOffsetY.toFixed(2);
            
            // Update range value display
            const rangeValue = document.getElementById('velocityRangeValue');
            if (rangeValue) rangeValue.textContent = `±${newScale.toFixed(2)}`;
            
            this.updateZoomUI();
            this.updateModeUI();
            this.generateMap();
        }
    }
    
    resetZoom() {
        if (this.mode === 0) {
            // Position map: use zoomHistory
            if (this.zoomHistory.length > 0) {
                // Pop one level from history
                const prevZoom = this.zoomHistory.pop();
                this.zoomState.minX = prevZoom.minX;
                this.zoomState.maxX = prevZoom.maxX;
                this.zoomState.minY = prevZoom.minY;
                this.zoomState.maxY = prevZoom.maxY;
                this.zoomState.enabled = (this.zoomHistory.length > 0);
            } else {
                // Full reset
                this.zoomState.minX = 0;
                this.zoomState.maxX = 1;
                this.zoomState.minY = 0;
                this.zoomState.maxY = 1;
                this.zoomState.enabled = false;
            }
        } else {
            // Velocity map: use velocityZoomHistory
            if (this.velocityZoomHistory.length > 0) {
                // Pop one level from history
                const prevZoom = this.velocityZoomHistory.pop();
                this.params.velocityScale = prevZoom.velocityScale;
                this.params.velocityOffsetX = prevZoom.velocityOffsetX;
                this.params.velocityOffsetY = prevZoom.velocityOffsetY;
                
                // Update UI inputs
                const scaleSelect = document.getElementById('velocityRangeSelect');
                const offsetXInput = document.getElementById('velocityOffsetX');
                const offsetYInput = document.getElementById('velocityOffsetY');
                
                if (scaleSelect) {
                    // Find matching option
                    for (const opt of scaleSelect.options) {
                        if (Math.abs(parseFloat(opt.value) - prevZoom.velocityScale) < 0.001) {
                            opt.selected = true;
                            break;
                        }
                    }
                }
                if (offsetXInput) offsetXInput.value = prevZoom.velocityOffsetX.toFixed(2);
                if (offsetYInput) offsetYInput.value = prevZoom.velocityOffsetY.toFixed(2);
                
                const rangeValue = document.getElementById('velocityRangeValue');
                if (rangeValue) rangeValue.textContent = `±${prevZoom.velocityScale.toFixed(2)}`;
            } else {
                // Full reset to defaults
                this.params.velocityScale = 5.0;
                this.params.velocityOffsetX = 0;
                this.params.velocityOffsetY = 0;
                
                const scaleSelect = document.getElementById('velocityRangeSelect');
                const offsetXInput = document.getElementById('velocityOffsetX');
                const offsetYInput = document.getElementById('velocityOffsetY');
                
                if (scaleSelect) {
                    for (const opt of scaleSelect.options) {
                        if (parseFloat(opt.value) === 5.0) {
                            opt.selected = true;
                            break;
                        }
                    }
                }
                if (offsetXInput) offsetXInput.value = '0';
                if (offsetYInput) offsetYInput.value = '0';
                
                const rangeValue = document.getElementById('velocityRangeValue');
                if (rangeValue) rangeValue.textContent = '±5';
            }
            this.updateModeUI();
        }
        this.updateZoomUI();
        this.generateMap();
    }
    
    updateZoomUI() {
        const zoomInfo = document.getElementById('zoomInfo');
        const resetBtn = document.getElementById('resetZoomBtn');
        
        if (this.mode === 0) {
            // Position map zoom info
            if (!this.zoomState.enabled) {
                zoomInfo.textContent = '1x (full view)';
                resetBtn.style.display = 'none';
            } else {
                const zoomX = 1 / (this.zoomState.maxX - this.zoomState.minX);
                const zoomY = 1 / (this.zoomState.maxY - this.zoomState.minY);
                const zoomLevel = Math.round(Math.min(zoomX, zoomY));
                zoomInfo.textContent = `${zoomLevel}x zoom (${this.zoomHistory.length + 1} levels)`;
                resetBtn.style.display = 'block';
            }
        } else {
            // Velocity map zoom info
            const defaultScale = 5.0;
            const currentScale = this.params.velocityScale;
            if (currentScale >= defaultScale && this.velocityZoomHistory.length === 0) {
                zoomInfo.textContent = '1x (full view)';
                resetBtn.style.display = 'none';
            } else {
                const zoomLevel = Math.round(defaultScale / currentScale);
                zoomInfo.textContent = `${zoomLevel}x zoom (${this.velocityZoomHistory.length + 1} levels)`;
                resetBtn.style.display = 'block';
            }
        }
    }
    
    // GPU-based pendulum preview rendering
    drawPendulumPreview(states) {
        const canvas = this.pendulumPreviewCanvas;
        const gl = this.pendulumPreviewGl;
        if (!gl || !this.pendulumPreviewProgram) return;
        
        const cx = canvas.width / 2;
        const cy = canvas.height / 3;
        const scale = 60;
        
        // Clear to black
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.04, 0.04, 0.04, 1.0); // #0a0a0a
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Use the pendulum preview program
        gl.useProgram(this.pendulumPreviewProgram);
        
        // Set resolution uniform
        const resLoc = gl.getUniformLocation(this.pendulumPreviewProgram, 'u_resolution');
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        
        // Calculate positions for both pendulums
        const getPos = (s) => {
            const x1 = cx + Math.sin(s.theta1) * this.params.l1 * scale;
            const y1 = cy + Math.cos(s.theta1) * this.params.l1 * scale;
            const x2 = x1 + Math.sin(s.theta2) * this.params.l2 * scale;
            const y2 = y1 + Math.cos(s.theta2) * this.params.l2 * scale;
            return { x1, y1, x2, y2 };
        };
        
        // Get the attribute location
        const posLoc = gl.getAttribLocation(this.pendulumPreviewProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        
        // Draw a pendulum with given state and colors
        const drawPendulum = (s, armColor, massColor) => {
            const pos = getPos(s);
            const r1 = Math.sqrt(this.params.m1) * 5;
            const r2 = Math.sqrt(this.params.m2) * 5;
            
            // Draw arms as lines
            const armVertices = new Float32Array([
                cx, cy,
                pos.x1, pos.y1,
                pos.x1, pos.y1,
                pos.x2, pos.y2
            ]);
            
            gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, armVertices, gl.STATIC_DRAW);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            
            const colorLoc = gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color');
            gl.uniform4f(colorLoc, armColor[0], armColor[1], armColor[2], armColor[3]);
            gl.lineWidth(3);
            gl.drawArrays(gl.LINES, 0, 4);
            
            // Draw masses as circles (approximated with triangles)
            this.drawCircle(gl, pos.x1, pos.y1, r1, massColor);
            this.drawCircle(gl, pos.x2, pos.y2, r2, massColor);
        };
        
        // Draw trail if available
        if (this.pendulumPreviewTrail.length > 1) {
            // Trail for pendulum 1 (cyan)
            const trail1Vertices = [];
            for (const pt of this.pendulumPreviewTrail) {
                trail1Vertices.push(pt.x1, pt.y1);
            }
            if (trail1Vertices.length > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trail1Vertices), gl.STATIC_DRAW);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
                gl.uniform4f(gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color'), 0, 1, 1, 0.5);
                gl.drawArrays(gl.POINTS, 0, trail1Vertices.length / 2);
            }
            
            // Trail for pendulum 2 (magenta)
            const trail2Vertices = [];
            for (const pt of this.pendulumPreviewTrail) {
                trail2Vertices.push(pt.x2, pt.y2);
            }
            if (trail2Vertices.length > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trail2Vertices), gl.STATIC_DRAW);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
                gl.uniform4f(gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color'), 1, 0, 1, 0.5);
                gl.drawArrays(gl.POINTS, 0, trail2Vertices.length / 2);
            }
        }
        
        // If we have two states, draw both (simulation mode)
        if (states.state2) {
            drawPendulum(states.state1, [0, 1, 1, 1], [0, 1, 1, 0.8]); // Cyan
            drawPendulum(states.state2, [1, 0, 1, 1], [1, 0, 1, 0.8]); // Magenta
        } else {
            // Single state (preview mode)
            drawPendulum(states, [0.4, 0.67, 1, 1], [0.53, 0.67, 1, 1]); // Blue shades
        }
        
        // Draw pivot
        this.drawCircle(gl, cx, cy, 3, [1, 1, 1, 1]);
        
        // Update info text
        const s = states.state1 || states;
        document.getElementById('pendulumPreviewInfo').textContent = 
            `θ₁=${s.theta1.toFixed(2)} θ₂=${s.theta2.toFixed(2)}`;
    }
    
    // Helper to draw a circle using WebGL
    drawCircle(gl, cx, cy, radius, color) {
        const segments = 16;
        const vertices = [];
        
        for (let i = 0; i < segments; i++) {
            const angle1 = (i / segments) * Math.PI * 2;
            const angle2 = ((i + 1) / segments) * Math.PI * 2;
            
            vertices.push(cx, cy);
            vertices.push(cx + Math.cos(angle1) * radius, cy + Math.sin(angle1) * radius);
            vertices.push(cx + Math.cos(angle2) * radius, cy + Math.sin(angle2) * radius);
        }
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        
        const posLoc = gl.getAttribLocation(this.pendulumPreviewProgram, 'a_position');
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        
        const colorLoc = gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color');
        gl.uniform4f(colorLoc, color[0], color[1], color[2], color[3]);
        
        gl.drawArrays(gl.TRIANGLES, 0, segments * 3);
    }
    
    // GPU-based RK4 physics step
    stepPendulumGPU(state) {
        const { l1, l2, m1, m2, g } = this.params;
        const M = m1 + m2;
        const dt = this.params.dt;
        
        // Compute accelerations
        const computeAcc = (theta1, theta2, omega1, omega2) => {
            const delta = theta1 - theta2;
            const sinDelta = Math.sin(delta);
            const cosDelta = Math.cos(delta);
            const alpha_denom = m1 + m2 * sinDelta * sinDelta;
            
            const num1 = -m2 * l1 * omega1 * omega1 * sinDelta * cosDelta
                       - m2 * l2 * omega2 * omega2 * sinDelta
                       - M * g * Math.sin(theta1)
                       + m2 * g * Math.sin(theta2) * cosDelta;
            
            const num2 = M * l1 * omega1 * omega1 * sinDelta
                       + m2 * l2 * omega2 * omega2 * sinDelta * cosDelta
                       + M * g * Math.sin(theta1) * cosDelta
                       - M * g * Math.sin(theta2);
            
            return {
                alpha1: num1 / (l1 * alpha_denom),
                alpha2: num2 / (l2 * alpha_denom)
            };
        };
        
        // RK4 integration
        // k1
        const acc1 = computeAcc(state.theta1, state.theta2, state.omega1, state.omega2);
        const k1 = { dtheta1: state.omega1, dtheta2: state.omega2, domega1: acc1.alpha1, domega2: acc1.alpha2 };
        
        // k2
        const s2 = {
            theta1: state.theta1 + 0.5 * dt * k1.dtheta1,
            theta2: state.theta2 + 0.5 * dt * k1.dtheta2,
            omega1: state.omega1 + 0.5 * dt * k1.domega1,
            omega2: state.omega2 + 0.5 * dt * k1.domega2
        };
        const acc2 = computeAcc(s2.theta1, s2.theta2, s2.omega1, s2.omega2);
        const k2 = { dtheta1: s2.omega1, dtheta2: s2.omega2, domega1: acc2.alpha1, domega2: acc2.alpha2 };
        
        // k3
        const s3 = {
            theta1: state.theta1 + 0.5 * dt * k2.dtheta1,
            theta2: state.theta2 + 0.5 * dt * k2.dtheta2,
            omega1: state.omega1 + 0.5 * dt * k2.domega1,
            omega2: state.omega2 + 0.5 * dt * k2.domega2
        };
        const acc3 = computeAcc(s3.theta1, s3.theta2, s3.omega1, s3.omega2);
        const k3 = { dtheta1: s3.omega1, dtheta2: s3.omega2, domega1: acc3.alpha1, domega2: acc3.alpha2 };
        
        // k4
        const s4 = {
            theta1: state.theta1 + dt * k3.dtheta1,
            theta2: state.theta2 + dt * k3.dtheta2,
            omega1: state.omega1 + dt * k3.domega1,
            omega2: state.omega2 + dt * k3.domega2
        };
        const acc4 = computeAcc(s4.theta1, s4.theta2, s4.omega1, s4.omega2);
        const k4 = { dtheta1: s4.omega1, dtheta2: s4.omega2, domega1: acc4.alpha1, domega2: acc4.alpha2 };
        
        return {
            theta1: state.theta1 + dt * (k1.dtheta1 + 2 * k2.dtheta1 + 2 * k3.dtheta1 + k4.dtheta1) / 6.0,
            theta2: state.theta2 + dt * (k1.dtheta2 + 2 * k2.dtheta2 + 2 * k3.dtheta2 + k4.dtheta2) / 6.0,
            omega1: state.omega1 + dt * (k1.domega1 + 2 * k2.domega1 + 2 * k3.domega1 + k4.domega1) / 6.0,
            omega2: state.omega2 + dt * (k1.domega2 + 2 * k2.domega2 + 2 * k3.domega2 + k4.domega2) / 6.0
        };
    }
    
    async renderVelocityPreview(centerNx, centerNy) {
        const state = this.selectedState || this.hoverState;
        // Velocity preview is always active - just needs a valid state
        if (!state) return;
        
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
        setInt('u_perturbMode', this.params.perturbMode === 'random' ? 1 : 0);
        setFloat('u_seed', Math.random() * 1000.0);
        // For velocity preview, we always want velocity mode (mode = 1)
        // with the position fixed to the current hover/selected position
        setInt('u_mode', 1);
        setVec4('u_fixedState', state.theta1, state.theta2, state.omega1, state.omega2);
        setFloat('u_velocityScale', this.params.velocityScale);
        setInt('u_colorMapping', this.colorMapping);
        setInt('u_hueMapping', this.hueMapping);
        setFloat('u_cyclePeriod', this.cyclePeriod);
        
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.flush();
        
        // Copy to preview canvas
        this.velocityPreviewCtx.drawImage(tempCanvas, 0, 0);
        
        // Update info - show the fixed position being previewed + hint
        const infoText = this.velocityPreviewEnabled 
            ? `θ₁=${state.theta1.toFixed(2)} θ₂=${state.theta2.toFixed(2)} • Click map to enter`
            : `θ₁=${state.theta1.toFixed(2)} θ₂=${state.theta2.toFixed(2)} • 📌 Click to enter velocity mode`;
        document.getElementById('velocityPreviewInfo').textContent = infoText;
    }
    

    
    // Generate random number from standard normal distribution (Box-Muller)
    randomNormal() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    
    // Get perturbation components as a pair (matches shader's Box-Muller approach)
    getPerturbationPair() {
        if (this.params.perturbMode === 'random') {
            // Box-Muller transform to match shader behavior
            // Generate two correlated standard normal values from same random source
            let u1 = 0, u2 = 0;
            while (u1 === 0) u1 = Math.random();
            while (u2 === 0) u2 = Math.random();
            const r = Math.sqrt(-2.0 * Math.log(u1 + 0.0001)); // Add small value to avoid log(0)
            const theta = 2.0 * Math.PI * u2;
            const rand1 = r * Math.cos(theta); // Standard normal N(0,1)
            const rand2 = r * Math.sin(theta); // Standard normal N(0,1)
            return {
                omega1: rand1 * this.params.perturbation,
                omega2: rand2 * this.params.perturbation
            };
        }
        // Fixed perturbation (default)
        return {
            omega1: this.params.perturbation,
            omega2: this.params.perturbation * 0.7
        };
    }
    
    measureDivergence(s1, s2) {
        // Use circular difference for angles to match shader behavior
        const circularDiff = (a, b) => {
            let d = a - b;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            return d;
        };
        
        const dTheta1 = circularDiff(s1.theta1, s2.theta1);
        const dTheta2 = circularDiff(s1.theta2, s2.theta2);
        const dOmega1 = s1.omega1 - s2.omega1;
        const dOmega2 = s1.omega2 - s2.omega2;
        return Math.sqrt(dTheta1*dTheta1 + dTheta2*dTheta2 + dOmega1*dOmega1 + dOmega2*dOmega2);
    }
    
    // Note: Iteration data is no longer stored for color mapping.
    // This function is kept for API compatibility but returns null.
    getIterationCountFromMap(nx, ny) {
        return null;
    }
    
    startPendulumSimulation() {
        const state = this.selectedState || this.hoverState;
        if (!state) return;
        
        this.pendulumSimRunning = true;
        
        // Initialize states: original and perturbed (matching GPU)
        const baseState = { ...state };
        this.pendulumPreviewState = { ...baseState };
        
        // Get perturbation pair (matches shader's Box-Muller approach)
        const perturb = this.getPerturbationPair();
        this.pendulumPreviewPerturbedState = {
            theta1: baseState.theta1,
            theta2: baseState.theta2,
            omega1: baseState.omega1 + perturb.omega1,
            omega2: baseState.omega2 + perturb.omega2
        };
        this.pendulumPreviewTrail = [];
        this.pendulumSimIteration = 0;
        // Trails last forever - no max limit
        this.pendulumDivergenceLogged = false;
        
        // Log expected divergence from map data
        if (this.hoverPosition) {
            const expectedIter = this.getIterationCountFromMap(this.hoverPosition.nx, this.hoverPosition.ny);
            if (expectedIter !== null) {
                console.log(`Starting simulation. Map expects divergence at iteration: ${expectedIter} (maxIter=${this.params.maxIter})`);
                console.log(`Initial state: theta1=${baseState.theta1.toFixed(6)}, theta2=${baseState.theta2.toFixed(6)}, omega1=${baseState.omega1}, omega2=${baseState.omega2}`);
                console.log(`Perturbation: omega1+=${perturb.omega1.toFixed(8)}, omega2+=${perturb.omega2.toFixed(8)}`);
            }
        }
        
        this.animatePendulumSimulation();
    }
    
    animatePendulumSimulation() {
        if (!this.pendulumSimRunning) return;
        
        // Calculate scale to fit pendulum in canvas
        const maxReach = this.params.l1 + this.params.l2;
        const maxDisplaySize = Math.min(this.pendulumPreviewCanvas.width, this.pendulumPreviewCanvas.height) * 0.4;
        const scale = maxDisplaySize / maxReach;
        
        // Multiple physics steps per frame based on speed setting
        const steps = this.pendulumSimSpeed || 1;
        for (let i = 0; i < steps; i++) {
            this.pendulumPreviewState = this.stepPendulumGPU(this.pendulumPreviewState);
            this.pendulumPreviewPerturbedState = this.stepPendulumGPU(this.pendulumPreviewPerturbedState);
            this.pendulumSimIteration++;
        }
        
        // Calculate positions for trail
        const cx = this.pendulumPreviewCanvas.width / 2;
        const cy = this.pendulumPreviewCanvas.height / 3;
        
        const getPos = (s) => {
            const x1 = cx + Math.sin(s.theta1) * this.params.l1 * scale;
            const y1 = cy + Math.cos(s.theta1) * this.params.l1 * scale;
            const x2 = x1 + Math.sin(s.theta2) * this.params.l2 * scale;
            const y2 = y1 + Math.cos(s.theta2) * this.params.l2 * scale;
            return { x1: x2, y1: y2, x2: x2, y2: y2 }; // Store end positions for trail
        };
        
        const pos1 = getPos(this.pendulumPreviewState);
        const pos2 = getPos(this.pendulumPreviewPerturbedState);
        
        // Add to trails (no limit - trails last forever)
        this.pendulumPreviewTrail.push({ 
            x1: pos1.x1, y1: pos1.y1, 
            x2: pos2.x1, y2: pos2.y1 
        });
        
        // Calculate divergence using circular difference for angles (matches shader)
        const circularDiff = (a, b) => {
            let d = a - b;
            if (d > Math.PI) d -= 2 * Math.PI;
            if (d < -Math.PI) d += 2 * Math.PI;
            return d;
        };
        
        const dTheta1 = circularDiff(this.pendulumPreviewState.theta1, this.pendulumPreviewPerturbedState.theta1);
        const dTheta2 = circularDiff(this.pendulumPreviewState.theta2, this.pendulumPreviewPerturbedState.theta2);
        const dOmega1 = this.pendulumPreviewState.omega1 - this.pendulumPreviewPerturbedState.omega1;
        const dOmega2 = this.pendulumPreviewState.omega2 - this.pendulumPreviewPerturbedState.omega2;
        const divergence = Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2);
        
        // Log first time divergence exceeds threshold
        if (divergence > this.params.threshold && !this.pendulumDivergenceLogged) {
            console.log(`Preview divergence detected at iteration ${this.pendulumSimIteration}, divergence=${divergence.toFixed(6)}, threshold=${this.params.threshold}`);
            this.pendulumDivergenceLogged = true;
        }
        
        // Draw everything using GPU
        this.drawPendulumSimulationGPU(divergence);
        
        this.pendulumSimAnimationId = requestAnimationFrame(() => this.animatePendulumSimulation());
    }
    
    // GPU-based pendulum simulation rendering
    drawPendulumSimulationGPU(divergence) {
        const canvas = this.pendulumPreviewCanvas;
        const gl = this.pendulumPreviewGl;
        if (!gl || !this.pendulumPreviewProgram) return;
        
        const cx = canvas.width / 2;
        const cy = canvas.height / 3;
        
        // Calculate scale to fit pendulum in canvas
        const maxReach = this.params.l1 + this.params.l2;
        const maxDisplaySize = Math.min(canvas.width, canvas.height) * 0.4;
        const scale = maxDisplaySize / maxReach;
        
        // Clear to black
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0.04, 0.04, 0.04, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Use the pendulum preview program
        gl.useProgram(this.pendulumPreviewProgram);
        
        // Set resolution uniform
        const resLoc = gl.getUniformLocation(this.pendulumPreviewProgram, 'u_resolution');
        gl.uniform2f(resLoc, canvas.width, canvas.height);
        
        // Get the attribute location
        const posLoc = gl.getAttribLocation(this.pendulumPreviewProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        
        // Helper to calculate positions from state
        const getPositions = (s) => {
            const x1 = cx + Math.sin(s.theta1) * this.params.l1 * scale;
            const y1 = cy + Math.cos(s.theta1) * this.params.l1 * scale;
            const x2 = x1 + Math.sin(s.theta2) * this.params.l2 * scale;
            const y2 = y1 + Math.cos(s.theta2) * this.params.l2 * scale;
            return { x1, y1, x2, y2 };
        };
        
        const pos1 = getPositions(this.pendulumPreviewState);
        const pos2 = getPositions(this.pendulumPreviewPerturbedState);
        
        // Draw trails
        if (this.pendulumPreviewTrail.length > 1) {
            // Trail 1 (cyan)
            const trail1Vertices = [];
            for (const pt of this.pendulumPreviewTrail) {
                trail1Vertices.push(pt.x1, pt.y1);
            }
            if (trail1Vertices.length > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trail1Vertices), gl.STATIC_DRAW);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
                gl.uniform4f(gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color'), 0, 1, 1, 0.6);
                gl.drawArrays(gl.POINTS, 0, trail1Vertices.length / 2);
            }
            
            // Trail 2 (magenta)
            const trail2Vertices = [];
            for (const pt of this.pendulumPreviewTrail) {
                trail2Vertices.push(pt.x2, pt.y2);
            }
            if (trail2Vertices.length > 0) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(trail2Vertices), gl.STATIC_DRAW);
                gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
                gl.uniform4f(gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color'), 1, 0, 1, 0.6);
                gl.drawArrays(gl.POINTS, 0, trail2Vertices.length / 2);
            }
        }
        
        // Draw pendulum 1 (cyan)
        const r1 = Math.sqrt(this.params.m1) * 5;
        const r2 = Math.sqrt(this.params.m2) * 5;
        
        const arm1Vertices = new Float32Array([
            cx, cy,
            pos1.x1, pos1.y1,
            pos1.x1, pos1.y1,
            pos1.x2, pos1.y2
        ]);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, arm1Vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform4f(gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color'), 0, 1, 1, 1);
        gl.lineWidth(2);
        gl.drawArrays(gl.LINES, 0, 4);
        
        // Masses for pendulum 1
        this.drawCircle(gl, pos1.x1, pos1.y1, r1, [0, 1, 1, 1]);
        this.drawCircle(gl, pos1.x2, pos1.y2, r2, [0, 1, 1, 1]);
        
        // Draw pendulum 2 (magenta)
        const arm2Vertices = new Float32Array([
            cx, cy,
            pos2.x1, pos2.y1,
            pos2.x1, pos2.y1,
            pos2.x2, pos2.y2
        ]);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.pendulumPreviewTrailBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, arm2Vertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform4f(gl.getUniformLocation(this.pendulumPreviewProgram, 'u_color'), 1, 0, 1, 1);
        gl.drawArrays(gl.LINES, 0, 4);
        
        // Masses for pendulum 2
        this.drawCircle(gl, pos2.x1, pos2.y1, r1, [1, 0, 1, 1]);
        this.drawCircle(gl, pos2.x2, pos2.y2, r2, [1, 0, 1, 1]);
        
        // Draw pivot
        this.drawCircle(gl, cx, cy, 3, [1, 1, 1, 1]);
        
        // Update info
        let info = `Divergence: ${divergence.toFixed(6)} | Iter: ${this.pendulumSimIteration}`;
        if (divergence > this.params.threshold) {
            info += ' ✓ DIVERGED';
        }
        document.getElementById('pendulumPreviewInfo').textContent = info;
    }
    
    resetPendulumSimulation() {
        this.pendulumSimRunning = false;
        if (this.pendulumSimAnimationId) {
            cancelAnimationFrame(this.pendulumSimAnimationId);
        }
        this.pendulumPreviewState = null;
        this.pendulumPreviewPerturbedState = null;
        this.pendulumPreviewTrail = [];
        
        const state = this.selectedState || this.hoverState;
        if (state) {
            this.drawPendulumPreview(state);
        } else {
            // Clear canvas using WebGL
            const gl = this.pendulumPreviewGl;
            if (gl) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.viewport(0, 0, this.pendulumPreviewCanvas.width, this.pendulumPreviewCanvas.height);
                gl.clearColor(0.04, 0.04, 0.04, 1.0);
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
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
    

    
    reapplyColorMapping() {
        // Simply re-generate the map with new color settings
        // This ensures consistent coloring between initial render and re-color
        // (The physics simulation is fast enough that this is acceptable)
        this.generateMap();
    }
    
    drawCompositeToCanvas() {
        if (this.mainCtx) {
            this.mainCtx.drawImage(this.compositeCanvas, 0, 0, this.canvas.width, this.canvas.height);
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
            
            // Single pass: render colors directly using shader
            gl.useProgram(this.tileProgram);

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
            setInt('u_perturbMode', this.params.perturbMode === 'random' ? 1 : 0);
            setFloat('u_seed', Math.random() * 1000.0);
            setInt('u_mode', this.mode);
            setVec4('u_fixedState', this.fixedState.theta1, this.fixedState.theta2, 
                    this.fixedState.omega1, this.fixedState.omega2);
            setFloat('u_velocityScale', this.params.velocityScale);
            setVec2('u_velocityOffset', this.params.velocityOffsetX, this.params.velocityOffsetY);
            setInt('u_zoomEnabled', this.zoomState.enabled ? 1 : 0);
            setFloat('u_zoomMinX', this.zoomState.minX);
            setFloat('u_zoomMaxX', this.zoomState.maxX);
            setFloat('u_zoomMinY', this.zoomState.minY);
            setFloat('u_zoomMaxY', this.zoomState.maxY);
            setInt('u_colorMapping', this.colorMapping);
            setInt('u_hueMapping', this.hueMapping);
            setFloat('u_cyclePeriod', this.cyclePeriod);
            
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
