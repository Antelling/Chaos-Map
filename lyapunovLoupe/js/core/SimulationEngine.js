import { ShaderCompiler } from '../webgl-utils.js';
import { PingPongBuffers } from '../texture-manager.js';

export class SimulationEngine {
  constructor(gl, textureManager) {
    this.gl = gl;
    this.textureManager = textureManager;
    this.simulationProgram = null;
    this.vao = null;
    this.vertexBuffer = null;
    this.pingPongBuffers = null;
    
    this.resolution = 512;
    this.isFirstFrame = true;
    
    this.dtLoc = null;
    this.pertScaleLoc = null;
    this.numPertLoc = null;
    this.chunkIterLoc = null;
    this.isFirstChunkLoc = null;
    this.stateLoc = null;
    this.noiseGridSizeLoc = null;
    
    this.shaders = null;
    this.systemShaders = null;
  }

  setShaders(shaders, systemShaders) {
    this.shaders = shaders;
    this.systemShaders = systemShaders;
  }

  createFullscreenQuad() {
    const positions = new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      1.0, 1.0
    ]);

    const buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, positions, this.gl.STATIC_DRAW);

    return { buffer };
  }

  initialize(resolution) {
    if (!this.shaders || !this.systemShaders) {
      throw new Error('Shaders must be set before initializing simulation engine');
    }
    
    this.resolution = resolution;
    this.vertexBuffer = this.createFullscreenQuad();

    const maxAttachments = this.gl.getParameter(this.gl.MAX_COLOR_ATTACHMENTS);
    const numAttachments = Math.min(4, maxAttachments);

    this.pingPongBuffers = new PingPongBuffers(
      this.gl,
      this.textureManager,
      resolution,
      resolution,
      2,
      numAttachments
    );
  }

  async compileSimulationProgram(system) {
    if (!this.shaders || !this.systemShaders) {
      throw new Error('Shaders not loaded');
    }

    if (!this.vertexBuffer) {
      throw new Error('SimulationEngine not initialized. Call initialize() first.');
    }

    const systemSource = await this.fetchShader(this.systemShaders[system]);
    const integratorSource = this.shaders.rk4;

    const simulationFragmentShader = this.buildSimulationShader(
      this.shaders.common,
      systemSource,
      integratorSource
    );

    this.simulationProgram = ShaderCompiler.createProgramFromSource(
      this.gl,
      ShaderCompiler.getFullscreenQuadVertexShader(),
      simulationFragmentShader,
      null
    );

    if (!this.simulationProgram) {
      throw new Error('Failed to create simulation program');
    }

    this.gl.useProgram(this.simulationProgram);
    const stateLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_stateTexture');
    const pertLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_perturbationTexture');
    const noiseLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_noiseTexture');

    this.gl.uniform1i(stateLoc, 0);
    this.gl.uniform1i(pertLoc, 1);
    this.gl.uniform1i(noiseLoc, 3);
    this.gl.useProgram(null);

    this.setupUniformLocations();
    this.setupVAO();
  }

  async fetchShader(path) {
    const cacheBuster = `?v=${Date.now()}`;
    const response = await fetch(path + cacheBuster);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${path} (${response.status})`);
    }
    return await response.text();
  }

  buildSimulationShader(commonSource, systemSource, integratorSource) {
    const commonWithoutHeader = commonSource.replace(/^#version.*$\n?/m, '').replace(/^precision.*$\n?/m, '');
    const systemWithoutHeader = systemSource.replace(/^#version.*$\n?/m, '').replace(/^precision.*$\n?/m, '');

    const systemDeriv = systemWithoutHeader.match(/vec4\s+systemDeriv\s*\([^)]*\)\s*\{[\s\S]*?\n\}/s);
    const systemDerivCode = systemDeriv ? systemDeriv[0] : systemWithoutHeader;

    const integratorWithoutHeader = integratorSource.replace(/^#version.*$\n?/m, '').replace(/^precision.*$\n?/m, '');
    const integratorWithoutForwardDecl = integratorWithoutHeader.replace(/^vec4\s+systemDeriv\s*\([^)]*\);\s*$/m, '');

    return `#version 300 es
precision highp float;

${commonWithoutHeader}

${systemDerivCode}

${integratorWithoutForwardDecl}`;
  }

  setupUniformLocations() {
    this.dtLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_dt');
    this.pertScaleLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_perturbationScale');
    this.numPertLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_numPerturbations');
    this.chunkIterLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_chunkIterations');
    this.isFirstChunkLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_isFirstChunk');
    this.stateLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_stateTexture');
    this.noiseGridSizeLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_noiseGridSize');
  }

  setupVAO() {
    this.vao = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.vao);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer.buffer);
    const posLoc = this.gl.getAttribLocation(this.simulationProgram, 'a_position');
    this.gl.enableVertexAttribArray(posLoc);
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
  }

  setUniforms(dt, perturbationScale, noiseGridSize) {
    this.gl.useProgram(this.simulationProgram);
    this.gl.uniform1f(this.dtLoc, dt);
    this.gl.uniform1f(this.pertScaleLoc, perturbationScale);
    this.gl.uniform1f(this.noiseGridSizeLoc, noiseGridSize || 8);
  }

  runStep(iterations, numPerturbations, noiseTexture, isVerlet = false) {
    if (!this.simulationProgram) return;

    this.gl.useProgram(this.simulationProgram);

    const isFirstChunk = this.isFirstFrame ? 1 : 0;

    this.gl.uniform1i(this.numPertLoc, numPerturbations);
    this.gl.uniform1i(this.chunkIterLoc, iterations);
    this.gl.uniform1i(this.isFirstChunkLoc, isFirstChunk);

    const read = this.pingPongBuffers.getRead();

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, read.textures.color0);
    this.gl.uniform1i(this.stateLoc, 0);

    if (isVerlet) {
      const prevStateLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_prevStateTexture');
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, read.textures.color1);
      this.gl.uniform1i(prevStateLoc, 1);
    }

    const runningFtleLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_runningFtleTexture');
    if (runningFtleLoc !== null) {
      this.gl.activeTexture(this.gl.TEXTURE2);
      this.gl.bindTexture(this.gl.TEXTURE_2D, read.textures.color2);
      this.gl.uniform1i(runningFtleLoc, 2);
    }

    // Bind running divergence texture
    const runningDivergenceLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_runningDivergenceTexture');
    if (runningDivergenceLoc !== null && read.textures.color3) {
      this.gl.activeTexture(this.gl.TEXTURE4);
      this.gl.bindTexture(this.gl.TEXTURE_2D, read.textures.color3);
      this.gl.uniform1i(runningDivergenceLoc, 4);
    }

    // Set divergence threshold
    const divergenceThresholdLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_divergenceThreshold');
    if (divergenceThresholdLoc !== null) {
      this.gl.uniform1f(divergenceThresholdLoc, 0.1);  // Default threshold
    }

    // Set chunk start for global iteration tracking
    const chunkStartLoc = this.gl.getUniformLocation(this.simulationProgram, 'u_chunkStart');
    if (chunkStartLoc !== null) {
      this.gl.uniform1i(chunkStartLoc, this.totalIterations || 0);
    }

    const write = this.pingPongBuffers.getWrite();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, write.framebuffer);

    this.gl.drawBuffers([
      this.gl.COLOR_ATTACHMENT0,
      this.gl.COLOR_ATTACHMENT1,
      this.gl.COLOR_ATTACHMENT2,
      this.gl.COLOR_ATTACHMENT3
    ]);

    this.gl.bindVertexArray(this.vao);
    this.gl.bindVertexArray(this.vao);
    this.gl.viewport(0, 0, this.resolution, this.resolution);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.bindVertexArray(null);
    this.pingPongBuffers.swap();
    
    // Track total iterations for global divergence tracking
    this.totalIterations = (this.totalIterations || 0) + iterations;
  }

  getCurrentState() {
    const read = this.pingPongBuffers.getRead();
    return {
      stateTexture: read.textures.color0,
      prevStateTexture: read.textures.color1,
      ftleTexture: read.textures.color2,
      divergenceTexture: read.textures.color3
    };
  }

  getCurrentState() {
    const read = this.pingPongBuffers.getRead();
    return {
      stateTexture: read.textures.color0,
      prevStateTexture: read.textures.color1,
      ftleTexture: read.textures.color2
    };
  }


  copyInitialState(initialData) {
    const readBuffer = this.pingPongBuffers.getRead();
    this.gl.bindBuffer(this.gl.PIXEL_UNPACK_BUFFER, null);
    this.gl.bindTexture(this.gl.TEXTURE_2D, readBuffer.textures.color0);
    this.gl.texSubImage2D(
      this.gl.TEXTURE_2D, 0, 0, 0,
      this.resolution, this.resolution,
      this.gl.RGBA, this.gl.FLOAT, initialData
    );
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
  }

  resize(width, height) {
    this.pingPongBuffers.resize(width, height);
  }

  reset() {
    this.isFirstFrame = true;
    this.totalIterations = 0;
  }

  cleanup() {
    if (this.pingPongBuffers) {
      this.pingPongBuffers.cleanup();
    }
    if (this.simulationProgram) {
      this.gl.deleteProgram(this.simulationProgram);
    }
  }
}
