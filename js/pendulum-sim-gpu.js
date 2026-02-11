// Pure GPU-Based Double Pendulum Simulation
// Uses the EXACT shader from chaos-map.html (lines 1023-1170)
// State passed as uniforms, output written to 1x1 texture

class PureGPUPendulumSimulation {
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
        this.dt = options.dt || 0.002;
        this.l1 = options.l1 || 1.0;
        this.l2 = options.l2 || 1.0;
        this.m1 = options.m1 || 1.0;
        this.m2 = options.m2 || 1.0;
        this.threshold = options.threshold || 0.05;
        this.integrator = options.integrator || 'verlet';
        
        // Current states (stored as JS objects, passed as uniforms each frame)
        this.state1 = { ...options.initialState1 } || { theta1: 1.0, theta2: 0.5, omega1: 0, omega2: 0 };
        this.state2 = { ...options.initialState2 } || { theta1: 1.00001, theta2: 0.50001, omega1: 0, omega2: 0 };
        
        // Simulation tracking
        this.frameCount = 0;
        this.divergenceTime = null;
        this.diverged = false;
        
        // Initialize
        this.init();
        
        // Handle context loss
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
        });
        
        this.canvas.addEventListener('webglcontextrestored', () => {
            this.init();
        });
    }
    
    init() {
        const gl = this.gl;
        
        if (gl.isContextLost()) return;
        
        // Get shader source from the HTML (EXACT same shader as chaos map)
        const vsEl = document.getElementById('simulation-vertex-shader');
        const fsEl = document.getElementById('simulation-fragment-shader');
        
        if (!vsEl || !fsEl) {
            // Fallback: embed the shader directly
            this.createFallbackShaders();
        } else {
            this.simProgram = this.createProgram(vsEl.textContent, fsEl.textContent);
        }
        
        if (!this.simProgram) throw new Error('Failed to create simulation shader');
        
        // Create render programs
        this.renderProgram = this.createRenderProgram();
        
        // Setup FBO for reading back state (1x1 RGBA32F per pendulum)
        this.setupStateFBOs();
        
        // Setup divergence FBO
        this.setupDivergenceFBO();
        
        // Setup render buffers
        this.setupRenderBuffers();
        
        // Get uniform locations for simulation
        this.getSimUniformLocations();
        
        console.log('PureGPUPendulumSimulation initialized');
    }
    
    createFallbackShaders() {
        // Vertex shader
        const vsSource = `
            attribute vec2 a_position;
            void main() {
                gl_Position = vec4(a_position, 0.0, 1.0);
            }
        `;
        
        // Fragment shader - EXACT physics from chaos-map.html with byte packing for output
        const fsSource = `
            precision highp float;
            
            uniform float u_theta1_p1;
            uniform float u_theta2_p1;
            uniform float u_omega1_p1;
            uniform float u_omega2_p1;
            uniform float u_theta1_p2;
            uniform float u_theta2_p2;
            uniform float u_omega1_p2;
            uniform float u_omega2_p2;
            
            uniform float u_l1;
            uniform float u_l2;
            uniform float u_m1;
            uniform float u_m2;
            uniform float u_g;
            uniform float u_dt;
            uniform int u_pendulumIndex;
            
            const float PI = 3.14159265359;
            
            struct State {
                float theta1;
                float theta2;
                float omega1;
                float omega2;
            };
            
            void computeAccelerations(State s, out float alpha1, out float alpha2) {
                float M = u_m1 + u_m2;
                float delta = s.theta1 - s.theta2;
                float sinDelta = sin(delta);
                float cosDelta = cos(delta);
                
                float alpha_denom = u_m1 + u_m2 * sinDelta * sinDelta;
                
                float num1 = -u_m2 * u_l1 * s.omega1 * s.omega1 * sinDelta * cosDelta
                           - u_m2 * u_l2 * s.omega2 * s.omega2 * sinDelta
                           - M * u_g * sin(s.theta1)
                           + u_m2 * u_g * sin(s.theta2) * cosDelta;
                
                float num2 = M * u_l1 * s.omega1 * s.omega1 * sinDelta
                           + u_m2 * u_l2 * s.omega2 * s.omega2 * sinDelta * cosDelta
                           + M * u_g * sin(s.theta1) * cosDelta
                           - M * u_g * sin(s.theta2);
                
                alpha1 = num1 / (u_l1 * alpha_denom);
                alpha2 = num2 / (u_l2 * alpha_denom);
            }
            
            State stepVerlet(State s) {
                float halfDt = 0.5 * u_dt;
                
                float alpha1, alpha2;
                computeAccelerations(s, alpha1, alpha2);
                
                float omega1_half = s.omega1 + halfDt * alpha1;
                float omega2_half = s.omega2 + halfDt * alpha2;
                
                State next;
                next.theta1 = s.theta1 + u_dt * omega1_half;
                next.theta2 = s.theta2 + u_dt * omega2_half;
                next.omega1 = omega1_half;
                next.omega2 = omega2_half;
                
                computeAccelerations(next, alpha1, alpha2);
                
                next.omega1 += halfDt * alpha1;
                next.omega2 += halfDt * alpha2;
                
                return next;
            }
            
            // Pack float into 2 bytes (rg or ba)
            vec2 packFloat(float v) {
                float vNorm = (v + 32.0) / 64.0;  // Map [-32, 32] to [0, 1]
                vNorm = clamp(vNorm, 0.0, 0.999985);
                float high = floor(vNorm * 255.0) / 255.0;
                float low = fract(vNorm * 255.0);
                return vec2(high, low);
            }
            
            void main() {
                State s;
                
                if (u_pendulumIndex == 0) {
                    s.theta1 = u_theta1_p1;
                    s.theta2 = u_theta2_p1;
                    s.omega1 = u_omega1_p1;
                    s.omega2 = u_omega2_p1;
                } else {
                    s.theta1 = u_theta1_p2;
                    s.theta2 = u_theta2_p2;
                    s.omega1 = u_omega1_p2;
                    s.omega2 = u_omega2_p2;
                }
                
                State next = stepVerlet(s);
                
                // Pack output: rg = theta1, ba = theta2 for pixel 0
                // rg = omega1, ba = omega2 for pixel 1
                int pixelIndex = int(gl_FragCoord.x);
                if (pixelIndex == 0) {
                    vec2 t1 = packFloat(next.theta1);
                    vec2 t2 = packFloat(next.theta2);
                    gl_FragColor = vec4(t1.r, t1.g, t2.r, t2.g);
                } else {
                    vec2 o1 = packFloat(next.omega1);
                    vec2 o2 = packFloat(next.omega2);
                    gl_FragColor = vec4(o1.r, o1.g, o2.r, o2.g);
                }
            }
        `;
        
        this.simProgram = this.createProgram(vsSource, fsSource);
    }
    
    createProgram(vsSource, fsSource) {
        const gl = this.gl;
        
        const createShader = (type, source) => {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Shader compile error:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        };
        
        const vs = createShader(gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
        
        if (!vs || !fs) return null;
        
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }
        
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        
        return program;
    }
    
    getSimUniformLocations() {
        const gl = this.gl;
        const p = this.simProgram;
        
        this.simUniforms = {
            theta1_p1: gl.getUniformLocation(p, 'u_theta1_p1'),
            theta2_p1: gl.getUniformLocation(p, 'u_theta2_p1'),
            omega1_p1: gl.getUniformLocation(p, 'u_omega1_p1'),
            omega2_p1: gl.getUniformLocation(p, 'u_omega2_p1'),
            theta1_p2: gl.getUniformLocation(p, 'u_theta1_p2'),
            theta2_p2: gl.getUniformLocation(p, 'u_theta2_p2'),
            omega1_p2: gl.getUniformLocation(p, 'u_omega1_p2'),
            omega2_p2: gl.getUniformLocation(p, 'u_omega2_p2'),
            l1: gl.getUniformLocation(p, 'u_l1'),
            l2: gl.getUniformLocation(p, 'u_l2'),
            m1: gl.getUniformLocation(p, 'u_m1'),
            m2: gl.getUniformLocation(p, 'u_m2'),
            g: gl.getUniformLocation(p, 'u_g'),
            dt: gl.getUniformLocation(p, 'u_dt'),
            integrator: gl.getUniformLocation(p, 'u_integrator'),
            pendulumIndex: gl.getUniformLocation(p, 'u_pendulumIndex')
        };
    }
    
    createRenderProgram() {
        const gl = this.gl;
        
        // Point program for rendering masses
        const pointVS = `
            attribute float a_vertexID;
            uniform vec2 u_state;  // theta1, theta2
            uniform vec2 u_resolution;
            uniform float u_l1;
            uniform float u_l2;
            uniform float u_m1;
            uniform float u_m2;
            uniform float u_scale;
            uniform vec2 u_center;
            uniform int u_pendulumIndex;
            
            varying vec3 v_color;
            
            void main() {
                float theta1 = u_state.x;
                float theta2 = u_state.y;
                
                float x1 = u_l1 * sin(theta1);
                float y1 = u_l1 * cos(theta1);
                float x2 = x1 + u_l2 * sin(theta2);
                float y2 = y1 + u_l2 * cos(theta2);
                
                vec2 pos;
                float pointSize = 8.0;
                
                int vid = int(a_vertexID);
                if (vid == 0) {
                    // Mass 1 at end of first arm
                    pos = vec2(x1, y1);
                    pointSize = 8.0 + u_m1 * 8.0;  // Base size + mass scaling
                } else {
                    // Mass 2 at end of second arm
                    pos = vec2(x2, y2);
                    pointSize = 8.0 + u_m2 * 8.0;  // Base size + mass scaling
                }
                
                vec2 screenPos = u_center + pos * u_scale;
                vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
                
                gl_Position = vec4(clipPos.x, -clipPos.y, 0.0, 1.0);
                gl_PointSize = pointSize;
                
                if (u_pendulumIndex == 0) {
                    v_color = vec3(0.4, 0.9, 1.0);
                } else {
                    v_color = vec3(1.0, 0.5, 0.2);
                }
            }
        `;
        
        const pointFS = `
            precision mediump float;
            varying vec3 v_color;
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                if (length(coord) > 0.5) discard;
                gl_FragColor = vec4(v_color, 1.0);
            }
        `;
        
        this.pointProgram = this.createProgram(pointVS, pointFS);
        
        // Line program for rendering rods
        const lineVS = `
            attribute float a_vertexID;
            uniform vec2 u_state;
            uniform vec2 u_resolution;
            uniform float u_l1;
            uniform float u_l2;
            uniform float u_scale;
            uniform vec2 u_center;
            uniform int u_pendulumIndex;
            
            varying vec3 v_color;
            
            void main() {
                float theta1 = u_state.x;
                float theta2 = u_state.y;
                
                float x1 = u_l1 * sin(theta1);
                float y1 = u_l1 * cos(theta1);
                float x2 = x1 + u_l2 * sin(theta2);
                float y2 = y1 + u_l2 * cos(theta2);
                
                vec2 pos;
                int vid = int(a_vertexID);
                if (vid == 0 || vid == 2) {
                    pos = (vid == 0) ? vec2(0.0, 0.0) : vec2(x1, y1);
                } else if (vid == 1) {
                    pos = vec2(x1, y1);
                } else {
                    pos = vec2(x2, y2);
                }
                
                vec2 screenPos = u_center + pos * u_scale;
                vec2 clipPos = (screenPos / u_resolution) * 2.0 - 1.0;
                
                gl_Position = vec4(clipPos.x, -clipPos.y, 0.0, 1.0);
                
                if (u_pendulumIndex == 0) {
                    v_color = vec3(0.4, 0.9, 1.0);
                } else {
                    v_color = vec3(1.0, 0.5, 0.2);
                }
            }
        `;
        
        const lineFS = `
            precision mediump float;
            varying vec3 v_color;
            void main() {
                gl_FragColor = vec4(v_color, 1.0);
            }
        `;
        
        this.lineProgram = this.createProgram(lineVS, lineFS);
        
        return this.pointProgram;
    }
    
    setupStateFBOs() {
        const gl = this.gl;
        
        // Create 2x1 FBOs: pixel 0 = theta1, theta2; pixel 1 = omega1, omega2
        this.fbo1 = this.createFBO();
        this.fbo2 = this.createFBO();
        
        // Readback buffer (4 floats: theta1, theta2, omega1, omega2)
        this.readbackBuffer = new Float32Array(4);
    }
    
    createFBO() {
        const gl = this.gl;
        
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        
        // Always use UNSIGNED_BYTE - shader packs floats into bytes
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        return { fbo, texture };
    }
    
    setupDivergenceFBO() {
        const gl = this.gl;
        
        this.divergenceTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.divergenceTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        
        this.divergenceFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergenceFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.divergenceTexture, 0);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    
    setupRenderBuffers() {
        const gl = this.gl;
        
        // Full-screen quad
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        // Vertex IDs for point rendering (m1 and m2 only, no origin)
        const vertexIDs = new Float32Array([0, 1]);
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexIDs, gl.STATIC_DRAW);
        
        // Rod indices for line rendering
        const rodIDs = new Float32Array([0, 1, 1, 2]);
        this.rodBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.rodBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, rodIDs, gl.STATIC_DRAW);
    }
    
    reset() {
        this.frameCount = 0;
        this.divergenceTime = null;
        this.diverged = false;
    }
    
    stepPendulumOnGPU(pendulumIndex, stateIn, fboOut) {
        const gl = this.gl;
        
        // Render to 2x1 FBO (pixel 0 = thetas, pixel 1 = omegas)
        gl.bindFramebuffer(gl.FRAMEBUFFER, fboOut.fbo);
        gl.viewport(0, 0, 2, 1);
        
        gl.useProgram(this.simProgram);
        
        // Set all state uniforms (current state of both pendulums)
        gl.uniform1f(this.simUniforms.theta1_p1, this.state1.theta1);
        gl.uniform1f(this.simUniforms.theta2_p1, this.state1.theta2);
        gl.uniform1f(this.simUniforms.omega1_p1, this.state1.omega1);
        gl.uniform1f(this.simUniforms.omega2_p1, this.state1.omega2);
        gl.uniform1f(this.simUniforms.theta1_p2, this.state2.theta1);
        gl.uniform1f(this.simUniforms.theta2_p2, this.state2.theta2);
        gl.uniform1f(this.simUniforms.omega1_p2, this.state2.omega1);
        gl.uniform1f(this.simUniforms.omega2_p2, this.state2.omega2);
        
        // Set parameters
        gl.uniform1f(this.simUniforms.l1, this.l1);
        gl.uniform1f(this.simUniforms.l2, this.l2);
        gl.uniform1f(this.simUniforms.m1, this.m1);
        gl.uniform1f(this.simUniforms.m2, this.m2);
        gl.uniform1f(this.simUniforms.g, this.g);
        gl.uniform1f(this.simUniforms.dt, this.dt);
        gl.uniform1i(this.simUniforms.integrator, this.integrator === 'verlet' ? 1 : 0);
        gl.uniform1i(this.simUniforms.pendulumIndex, pendulumIndex);
        
        // Draw
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        const posLoc = gl.getAttribLocation(this.simProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        
        // Read back 8 bytes (2 pixels * 4 bytes each)
        const bytes = new Uint8Array(8);
        gl.readPixels(0, 0, 2, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        
        // Unpack: pixel 0 has theta1, theta2; pixel 1 has omega1, omega2
        // Each value packed as: value = (high + low/255) * 64 - 32
        const unpack = (i) => {
            const high = bytes[i] / 255.0;
            const low = bytes[i + 1] / 255.0;
            return (high + low / 255.0) * 64.0 - 32.0;
        };
        
        this.readbackBuffer[0] = unpack(0);  // theta1 from pixel 0, rg
        this.readbackBuffer[1] = unpack(2);  // theta2 from pixel 0, ba
        this.readbackBuffer[2] = unpack(4);  // omega1 from pixel 1, rg
        this.readbackBuffer[3] = unpack(6);  // omega2 from pixel 1, ba
        
        // Update state
        stateIn.theta1 = this.readbackBuffer[0];
        stateIn.theta2 = this.readbackBuffer[1];
        stateIn.omega1 = this.readbackBuffer[2];
        stateIn.omega2 = this.readbackBuffer[3];
    }
    
    checkDivergence() {
        // Simple CPU divergence check using the same logic as chaos map
        const d1 = this.circularDiff(this.state1.theta1, this.state2.theta1);
        const d2 = this.circularDiff(this.state1.theta2, this.state2.theta2);
        const d3 = this.state1.omega1 - this.state2.omega1;
        const d4 = this.state1.omega2 - this.state2.omega2;
        
        const dist = Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4);
        
        if (dist > this.threshold && !this.diverged) {
            this.diverged = true;
            this.divergenceTime = this.frameCount;
        }
    }
    
    circularDiff(a, b) {
        let d = a - b;
        const PI = Math.PI;
        if (d > PI) d -= 2 * PI;
        if (d < -PI) d += 2 * PI;
        return d;
    }
    
    step(steps = 1) {
        if (this.gl.isContextLost()) return;
        
        for (let i = 0; i < steps; i++) {
            // Step both pendulums
            this.stepPendulumOnGPU(0, this.state1, this.fbo1);
            this.stepPendulumOnGPU(1, this.state2, this.fbo2);
            
            this.frameCount++;
        }
        
        // Check divergence periodically
        if (this.frameCount % 10 === 0) {
            this.checkDivergence();
        }
    }
    
    render() {
        const gl = this.gl;
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        
        gl.clearColor(0.04, 0.04, 0.04, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        // Calculate scale to fit
        const maxReach = this.l1 + this.l2;
        const minDimension = Math.min(w, h);
        const scale = (minDimension * 0.85) / (maxReach * 2.0);
        const centerX = w / 2;
        const centerY = h / 2;
        
        // Get uniform locations for render programs
        if (!this.renderUniforms) {
            this.renderUniforms = {
                point: {
                    state: gl.getUniformLocation(this.pointProgram, 'u_state'),
                    resolution: gl.getUniformLocation(this.pointProgram, 'u_resolution'),
                    l1: gl.getUniformLocation(this.pointProgram, 'u_l1'),
                    l2: gl.getUniformLocation(this.pointProgram, 'u_l2'),
                    m1: gl.getUniformLocation(this.pointProgram, 'u_m1'),
                    m2: gl.getUniformLocation(this.pointProgram, 'u_m2'),
                    scale: gl.getUniformLocation(this.pointProgram, 'u_scale'),
                    center: gl.getUniformLocation(this.pointProgram, 'u_center'),
                    pendulumIndex: gl.getUniformLocation(this.pointProgram, 'u_pendulumIndex')
                },
                line: {
                    state: gl.getUniformLocation(this.lineProgram, 'u_state'),
                    resolution: gl.getUniformLocation(this.lineProgram, 'u_resolution'),
                    l1: gl.getUniformLocation(this.lineProgram, 'u_l1'),
                    l2: gl.getUniformLocation(this.lineProgram, 'u_l2'),
                    scale: gl.getUniformLocation(this.lineProgram, 'u_scale'),
                    center: gl.getUniformLocation(this.lineProgram, 'u_center'),
                    pendulumIndex: gl.getUniformLocation(this.lineProgram, 'u_pendulumIndex')
                }
            };
        }
        
        // Draw rods first
        gl.useProgram(this.lineProgram);
        gl.uniform2f(this.renderUniforms.line.resolution, w, h);
        gl.uniform1f(this.renderUniforms.line.l1, this.l1);
        gl.uniform1f(this.renderUniforms.line.l2, this.l2);
        gl.uniform1f(this.renderUniforms.line.scale, scale);
        gl.uniform2f(this.renderUniforms.line.center, centerX, centerY);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.rodBuffer);
        const lineVertexLoc = gl.getAttribLocation(this.lineProgram, 'a_vertexID');
        gl.enableVertexAttribArray(lineVertexLoc);
        gl.vertexAttribPointer(lineVertexLoc, 1, gl.FLOAT, false, 0, 0);
        
        // Pendulum 1
        gl.uniform2f(this.renderUniforms.line.state, this.state1.theta1, this.state1.theta2);
        gl.uniform1i(this.renderUniforms.line.pendulumIndex, 0);
        gl.drawArrays(gl.LINES, 0, 4);
        
        // Pendulum 2
        gl.uniform2f(this.renderUniforms.line.state, this.state2.theta1, this.state2.theta2);
        gl.uniform1i(this.renderUniforms.line.pendulumIndex, 1);
        gl.drawArrays(gl.LINES, 0, 4);
        
        // Draw points (masses)
        gl.useProgram(this.pointProgram);
        gl.uniform2f(this.renderUniforms.point.resolution, w, h);
        gl.uniform1f(this.renderUniforms.point.l1, this.l1);
        gl.uniform1f(this.renderUniforms.point.l2, this.l2);
        gl.uniform1f(this.renderUniforms.point.m1, this.m1);
        gl.uniform1f(this.renderUniforms.point.m2, this.m2);
        gl.uniform1f(this.renderUniforms.point.scale, scale);
        gl.uniform2f(this.renderUniforms.point.center, centerX, centerY);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        const pointVertexLoc = gl.getAttribLocation(this.pointProgram, 'a_vertexID');
        gl.enableVertexAttribArray(pointVertexLoc);
        gl.vertexAttribPointer(pointVertexLoc, 1, gl.FLOAT, false, 0, 0);
        
        // Pendulum 1
        gl.uniform2f(this.renderUniforms.point.state, this.state1.theta1, this.state1.theta2);
        gl.uniform1i(this.renderUniforms.point.pendulumIndex, 0);
        gl.drawArrays(gl.POINTS, 0, 2);
        
        // Pendulum 2
        gl.uniform2f(this.renderUniforms.point.state, this.state2.theta1, this.state2.theta2);
        gl.uniform1i(this.renderUniforms.point.pendulumIndex, 1);
        gl.drawArrays(gl.POINTS, 0, 2);
    }
    
    destroy() {
        const gl = this.gl;
        
        if (this.fbo1) {
            gl.deleteFramebuffer(this.fbo1.fbo);
            gl.deleteTexture(this.fbo1.texture);
        }
        if (this.fbo2) {
            gl.deleteFramebuffer(this.fbo2.fbo);
            gl.deleteTexture(this.fbo2.texture);
        }
        
        if (this.divergenceFBO) gl.deleteFramebuffer(this.divergenceFBO);
        if (this.divergenceTexture) gl.deleteTexture(this.divergenceTexture);
        
        if (this.simProgram) gl.deleteProgram(this.simProgram);
        if (this.pointProgram) gl.deleteProgram(this.pointProgram);
        if (this.lineProgram) gl.deleteProgram(this.lineProgram);
        
        if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
        if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
        if (this.rodBuffer) gl.deleteBuffer(this.rodBuffer);
    }
}

// Export alias
var GPUPendulumSimulation = PureGPUPendulumSimulation;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PureGPUPendulumSimulation, GPUPendulumSimulation };
}
