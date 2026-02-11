// Double Pendulum Chaos Map - Main Renderer Class

class ChaosMapRenderer {
    constructor() {
        this.canvas = document.getElementById('chaosMapCanvas');
        this.gl = null;
        this.program = null;
        this.tileCanvas = document.createElement('canvas');
        this.tileGl = null;
        this.tileProgram = null;
        
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
            deltaMode: false,  // When true, add to basis state instead of replacing
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
}
