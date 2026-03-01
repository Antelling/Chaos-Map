import { ShaderCompiler } from '../webgl-utils.js';

export class RenderEngine {
  constructor(gl, textureManager) {
    this.gl = gl;
    this.textureManager = textureManager;
    this.renderProgram = null;
    this.accumulateProgram = null;
    this.bob2DistanceProgram = null;
    this.divergenceTimeProgram = null;
    this.divergenceInitProgram = null;
    this.divergenceEvolveProgram = null;
    this.divergenceEvolvePrograms = {};  // System-specific programs
    this.positionRenderProgram = null;
    this.renderVao = null;
    this.accumulateVao = null;
    this.bob2DistanceVao = null;
    this.divergenceTimeVao = null;
    this.divergenceInitVao = null;
    this.divergenceEvolveVao = null;
    this.positionRenderVao = null;
    this.vertexBuffer = null;
    
    this.accumulatedFtleTexture = null;
    this.accumulatedFtleTextureAlt = null;
    this.bob2DistanceTexture = null;
    this.bob2DistanceTextureAlt = null;
    this.divergenceTimeTexture = null;
    this.divergenceTimeTextureAlt = null;
    this.divergencePerturbedTexturesRead = null;
    this.divergencePerturbedTexturesWrite = null;
    this.divergencePerturbedReadIndices = null;
    this.accumulateFramebuffer = null;
    this.bob2DistanceFramebuffer = null;
    this.divergenceTimeFramebuffer = null;
    this.divergencePerturbedFramebuffers = null;
    this.thumbnailFramebuffer = null;
    this.thumbnailTexture = null;
    this.accumulateReadIndex = 0;
    this.bob2DistanceReadIndex = 0;
    this.divergenceTimeReadIndex = 0;
    this.accumulatedFrameCount = 0;
    this.bob2DistanceAccumulatedFrameCount = 0;
    this.divergenceTimeAccumulatedFrameCount = 0;

    this.divergenceSamples = 8;
    this.divergencePerturbationScale = 0.001;
    this.shaders = null;
    this.systemShaders = null;
    this.currentSystem = null;
    
    this.cachedFtleRange = null;
    this.positionMode = 0;
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

  async compileRenderProgram(renderSource) {
    const vertexShader = ShaderCompiler.getFullscreenQuadVertexShader();
    this.renderProgram = ShaderCompiler.createProgramFromSource(
      this.gl,
      vertexShader,
      renderSource
    );

    if (!this.renderProgram) {
      throw new Error('Failed to compile render program');
    }
  }

  async compileAccumulateProgram(accumulateSource) {
    if (this.accumulateProgram) {
      this.gl.deleteProgram(this.accumulateProgram);
    }

    const vertexShader = ShaderCompiler.getFullscreenQuadVertexShader();
    this.accumulateProgram = ShaderCompiler.createProgramFromSource(
      this.gl,
      vertexShader,
      accumulateSource
    );

    if (!this.accumulateProgram) {
      throw new Error('Failed to compile accumulate program');
    }
  }

  async compileBob2DistanceProgram(bob2DistanceSource) {
    if (this.bob2DistanceProgram) {
      this.gl.deleteProgram(this.bob2DistanceProgram);
    }

    const vertexShader = ShaderCompiler.getFullscreenQuadVertexShader();
    this.bob2DistanceProgram = ShaderCompiler.createProgramFromSource(
      this.gl,
      vertexShader,
      bob2DistanceSource
    );

    if (!this.bob2DistanceProgram) {
      throw new Error('Failed to compile bob2 distance program');
    }
  }

  async compileDivergenceTimeProgram(divergenceTimeSource) {
    if (this.divergenceTimeProgram) {
      this.gl.deleteProgram(this.divergenceTimeProgram);
    }

    const vertexShader = ShaderCompiler.getFullscreenQuadVertexShader();
    this.divergenceTimeProgram = ShaderCompiler.createProgramFromSource(
      this.gl,
      vertexShader,
      divergenceTimeSource
    );

    if (!this.divergenceTimeProgram) {
      throw new Error('Failed to compile divergence time program');
    }
  }

  async compileDivergenceInitProgram(divergenceInitSource) {
    if (this.divergenceInitProgram) {
      this.gl.deleteProgram(this.divergenceInitProgram);
    }

    const vertexShader = ShaderCompiler.getFullscreenQuadVertexShader();
    this.divergenceInitProgram = ShaderCompiler.createProgramFromSource(
      this.gl,
      vertexShader,
      divergenceInitSource
    );

    if (!this.divergenceInitProgram) {
      throw new Error('Failed to compile divergence init program');
    }
  }

  async compileDivergenceEvolveProgram(divergenceEvolveSource) {
    // This is now a no-op - use compileDivergenceEvolveProgramForSystem instead
    // Kept for backward compatibility
  }

  async compileDivergenceEvolveProgramForSystem(system, systemSource) {
    if (this.divergenceEvolvePrograms[system]) {
      this.gl.deleteProgram(this.divergenceEvolvePrograms[system]);
    }

    const divergenceEvolveSource = this.buildDivergenceEvolveShader(systemSource);
    const vertexShader = ShaderCompiler.getFullscreenQuadVertexShader();
    const program = ShaderCompiler.createProgramFromSource(
      this.gl,
      vertexShader,
      divergenceEvolveSource
    );

    if (!program) {
      throw new Error('Failed to compile divergence evolve program for system: ' + system);
    }

    this.divergenceEvolvePrograms[system] = program;
    this.currentSystem = system;
  }

  buildDivergenceEvolveShader(systemSource) {
    // Extract systemDeriv from system shader (same pattern as SimulationEngine)
    const systemWithoutHeader = systemSource.replace(/^#version.*$\n?/gm, '').replace(/^precision.*$\n?/gm, '');
    const systemDerivMatch = systemWithoutHeader.match(/vec4\s+systemDeriv\s*\([^)]*\)\s*\{[\s\S]*?\n\}/s);
    const systemDerivCode = systemDerivMatch ? systemDerivMatch[0] : systemWithoutHeader;

    // Build divergence evolve shader with embedded system physics
    return `#version 300 es
precision highp float;

uniform sampler2D u_perturbedState;
uniform float u_dt;

in vec2 v_uv;
out vec4 fragColor;

${systemDerivCode}

vec4 rk4Step(vec4 state, float dt) {
  vec4 k1 = systemDeriv(state, vec4(0.0));
  vec4 k2 = systemDeriv(state + 0.5 * dt * k1, vec4(0.0));
  vec4 k3 = systemDeriv(state + 0.5 * dt * k2, vec4(0.0));
  vec4 k4 = systemDeriv(state + dt * k3, vec4(0.0));
  return state + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

void main() {
  vec4 state = texture(u_perturbedState, v_uv);
  fragColor = rk4Step(state, u_dt);
}
`;
  }

  async compilePositionRenderProgram(positionRenderSource) {
    if (this.positionRenderProgram) {
      this.gl.deleteProgram(this.positionRenderProgram);
    }

    const vertexShader = ShaderCompiler.getFullscreenQuadVertexShader();
    this.positionRenderProgram = ShaderCompiler.createProgramFromSource(
      this.gl,
      vertexShader,
      positionRenderSource
    );

    if (!this.positionRenderProgram) {
      throw new Error('Failed to compile position render program');
    }
  }

  initialize(resolution) {
    this.vertexBuffer = this.createFullscreenQuad();
    
    this.accumulatedFtleTexture = this.textureManager.createAccumulationTexture(resolution, resolution);
    this.clearTexture(this.accumulatedFtleTexture);
    
    this.accumulatedFtleTextureAlt = this.textureManager.createAccumulationTexture(resolution, resolution);
    this.clearTexture(this.accumulatedFtleTextureAlt);
    
    this.bob2DistanceTexture = this.textureManager.createAccumulationTexture(resolution, resolution);
    this.clearTexture(this.bob2DistanceTexture);
    
    this.bob2DistanceTextureAlt = this.textureManager.createAccumulationTexture(resolution, resolution);
    this.clearTexture(this.bob2DistanceTextureAlt);

    this.divergenceTimeTexture = this.textureManager.createAccumulationTexture(resolution, resolution);
    this.clearTexture(this.divergenceTimeTexture);

    this.divergenceTimeTextureAlt = this.textureManager.createAccumulationTexture(resolution, resolution);
    this.clearTexture(this.divergenceTimeTextureAlt);

    this.accumulateFramebuffer = this.gl.createFramebuffer();
    this.accumulateFramebufferAlt = this.gl.createFramebuffer();
    this.bob2DistanceFramebuffer = this.gl.createFramebuffer();
    this.bob2DistanceFramebufferAlt = this.gl.createFramebuffer();
    this.divergenceTimeFramebuffer = this.gl.createFramebuffer();
    this.divergenceTimeFramebufferAlt = this.gl.createFramebuffer();
    this.thumbnailFramebuffer = this.gl.createFramebuffer();
    this.thumbnailTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.thumbnailTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA8, 32, 32, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    
    this.setupAccumulationFramebuffers();
    
    this.initializeDivergenceTextures(resolution);
  }
  
  setupAccumulationFramebuffers() {
    const gl = this.gl;
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulateFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.accumulatedFtleTexture,
      0
    );
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.accumulateFramebufferAlt);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.accumulatedFtleTextureAlt,
      0
    );
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bob2DistanceFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.bob2DistanceTexture,
      0
    );
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bob2DistanceFramebufferAlt);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.bob2DistanceTextureAlt,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergenceTimeFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.divergenceTimeTexture,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergenceTimeFramebufferAlt);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.divergenceTimeTextureAlt,
      0
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  
  initializeDivergenceTextures(resolution) {
    const gl = this.gl;
    
    if (this.divergencePerturbedTexturesRead) {
      for (const tex of this.divergencePerturbedTexturesRead) {
        this.textureManager.deleteTexture(tex);
      }
    }
    if (this.divergencePerturbedTexturesWrite) {
      for (const tex of this.divergencePerturbedTexturesWrite) {
        this.textureManager.deleteTexture(tex);
      }
    }
    if (this.divergencePerturbedFramebuffers) {
      for (const fb of this.divergencePerturbedFramebuffers) {
        gl.deleteFramebuffer(fb);
      }
    }
    
    this.divergencePerturbedTexturesRead = [];
    this.divergencePerturbedTexturesWrite = [];
    this.divergencePerturbedFramebuffers = [];
    this.divergencePerturbedReadIndices = new Int8Array(32).fill(0);
    
    for (let i = 0; i < 32; i++) {
      const texRead = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texRead);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, resolution, resolution, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.clearTexture(texRead);
      this.divergencePerturbedTexturesRead.push(texRead);
      
      const texWrite = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texWrite);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, resolution, resolution, 0, gl.RGBA, gl.FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.clearTexture(texWrite);
      this.divergencePerturbedTexturesWrite.push(texWrite);
      
      const fb = gl.createFramebuffer();
      this.divergencePerturbedFramebuffers.push(fb);
    }
  }
  
  setDivergenceConfig(samples, scale) {
    const needsReinit = samples !== this.divergenceSamples;
    this.divergenceSamples = samples;
    this.divergencePerturbationScale = scale;
    return needsReinit;
  }

  initializeDivergencePerturbedStates(referenceStateTexture, resolution = 512) {
    if (!this.divergenceInitProgram || !referenceStateTexture) return;

    const gl = this.gl;
    gl.useProgram(this.divergenceInitProgram);

    const refStateLoc = gl.getUniformLocation(this.divergenceInitProgram, 'u_referenceState');
    const sampleIdxLoc = gl.getUniformLocation(this.divergenceInitProgram, 'u_sampleIndex');
    const scaleLoc = gl.getUniformLocation(this.divergenceInitProgram, 'u_perturbationScale');
    const numSamplesLoc = gl.getUniformLocation(this.divergenceInitProgram, 'u_numSamples');

    gl.uniform1i(refStateLoc, 0);
    gl.uniform1f(scaleLoc, this.divergencePerturbationScale);
    gl.uniform1i(numSamplesLoc, this.divergenceSamples);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, referenceStateTexture);

    if (!this.divergenceInitVao) {
      this.divergenceInitVao = gl.createVertexArray();
      gl.bindVertexArray(this.divergenceInitVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer.buffer);
      const posLoc = gl.getAttribLocation(this.divergenceInitProgram, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.bindVertexArray(this.divergenceInitVao);
    }

    for (let i = 0; i < this.divergenceSamples; i++) {
      gl.uniform1i(sampleIdxLoc, i);

      const writeTex = this.divergencePerturbedReadIndices[i] === 0
        ? this.divergencePerturbedTexturesWrite[i]
        : this.divergencePerturbedTexturesRead[i];

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergencePerturbedFramebuffers[i]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTex, 0);
      gl.viewport(0, 0, resolution, resolution);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      this.divergencePerturbedReadIndices[i] = 1 - this.divergencePerturbedReadIndices[i];
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  }

  evolveDivergencePerturbedStates(dt, resolution = 512, steps = 1) {
    const program = this.divergenceEvolvePrograms[this.currentSystem];
    if (!program) return;

    const gl = this.gl;
    gl.useProgram(program);

    const stateLoc = gl.getUniformLocation(program, 'u_perturbedState');
    const dtLoc = gl.getUniformLocation(program, 'u_dt');

    gl.uniform1f(dtLoc, dt);

    if (!this.divergenceEvolveVao) {
      this.divergenceEvolveVao = gl.createVertexArray();
      gl.bindVertexArray(this.divergenceEvolveVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer.buffer);
      const posLoc = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.bindVertexArray(this.divergenceEvolveVao);
    }

    for (let step = 0; step < steps; step++) {
      for (let i = 0; i < this.divergenceSamples; i++) {
        const readTex = this.divergencePerturbedReadIndices[i] === 0
          ? this.divergencePerturbedTexturesRead[i]
          : this.divergencePerturbedTexturesWrite[i];
        const writeTex = this.divergencePerturbedReadIndices[i] === 0
          ? this.divergencePerturbedTexturesWrite[i]
          : this.divergencePerturbedTexturesRead[i];

        gl.uniform1i(stateLoc, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, readTex);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.divergencePerturbedFramebuffers[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, writeTex, 0);
        gl.viewport(0, 0, resolution, resolution);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        this.divergencePerturbedReadIndices[i] = 1 - this.divergencePerturbedReadIndices[i];
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  }

  clearTexture(texture) {
    const gl = this.gl;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.deleteFramebuffer(fb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  async accumulateFrame(ftleTexture, actualIterations, dt, reset = false, resolution = 512) {
    if (!this.accumulateProgram) return;

    const readTexture = this.accumulateReadIndex === 0
      ? this.accumulatedFtleTexture
      : this.accumulatedFtleTextureAlt;

    this.gl.useProgram(this.accumulateProgram);

    const currentFtleLoc = this.gl.getUniformLocation(this.accumulateProgram, 'u_currentFtle');
    const accumulatedFtleLoc = this.gl.getUniformLocation(this.accumulateProgram, 'u_accumulatedFtle');
    const resetLoc = this.gl.getUniformLocation(this.accumulateProgram, 'u_reset');
    const actualIterationsLoc = this.gl.getUniformLocation(this.accumulateProgram, 'u_actualIterations');
    const dtLoc = this.gl.getUniformLocation(this.accumulateProgram, 'u_dt');

    this.gl.uniform1i(currentFtleLoc, 0);
    this.gl.uniform1i(accumulatedFtleLoc, 1);
    this.gl.uniform1i(resetLoc, reset ? 1 : 0);
    this.gl.uniform1i(actualIterationsLoc, actualIterations);
    this.gl.uniform1f(dtLoc, dt);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, ftleTexture);

    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, readTexture);

    const writeFramebuffer = this.accumulateReadIndex === 0
      ? this.accumulateFramebufferAlt
      : this.accumulateFramebuffer;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, writeFramebuffer);

    this.gl.viewport(0, 0, resolution, resolution);

    if (!this.accumulateVao) {
      this.accumulateVao = this.gl.createVertexArray();
      this.gl.bindVertexArray(this.accumulateVao);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer.buffer);

      const posLoc = this.gl.getAttribLocation(this.accumulateProgram, 'a_position');
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.bindVertexArray(this.accumulateVao);
    }

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.bindVertexArray(null);

    this.accumulateReadIndex = 1 - this.accumulateReadIndex;

    if (reset) {
      this.accumulatedFrameCount = 1;
    } else {
      this.accumulatedFrameCount++;
    }
  }

  async accumulateBob2Distance(stateTexture, reset = false, resolution = 512) {
    if (!this.bob2DistanceProgram || !stateTexture) return;

    const readTexture = this.bob2DistanceReadIndex === 0
      ? this.bob2DistanceTexture
      : this.bob2DistanceTextureAlt;

    this.gl.useProgram(this.bob2DistanceProgram);

    const stateLoc = this.gl.getUniformLocation(this.bob2DistanceProgram, 'u_stateTexture');
    const accumulatedLoc = this.gl.getUniformLocation(this.bob2DistanceProgram, 'u_accumulatedDistance');
    const resetLoc = this.gl.getUniformLocation(this.bob2DistanceProgram, 'u_reset');

    this.gl.uniform1i(stateLoc, 0);
    this.gl.uniform1i(accumulatedLoc, 1);
    this.gl.uniform1i(resetLoc, reset ? 1 : 0);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, stateTexture);

    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, readTexture);

    const writeFramebuffer = this.bob2DistanceReadIndex === 0
      ? this.bob2DistanceFramebufferAlt
      : this.bob2DistanceFramebuffer;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, writeFramebuffer);

    this.gl.viewport(0, 0, resolution, resolution);

    if (!this.bob2DistanceVao) {
      this.bob2DistanceVao = this.gl.createVertexArray();
      this.gl.bindVertexArray(this.bob2DistanceVao);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer.buffer);

      const posLoc = this.gl.getAttribLocation(this.bob2DistanceProgram, 'a_position');
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.bindVertexArray(this.bob2DistanceVao);
    }

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.bindVertexArray(null);

    this.bob2DistanceReadIndex = 1 - this.bob2DistanceReadIndex;

    if (reset) {
      this.bob2DistanceAccumulatedFrameCount = 1;
    } else {
      this.bob2DistanceAccumulatedFrameCount++;
    }
  }

  async accumulateDivergenceTime(stateTexture, divergenceThreshold, reset = false, resolution = 512, iteration = 0) {
    if (!this.divergenceTimeProgram || !stateTexture) return;

    const readTexture = this.divergenceTimeReadIndex === 0
      ? this.divergenceTimeTexture
      : this.divergenceTimeTextureAlt;

    this.gl.useProgram(this.divergenceTimeProgram);

    const stateLoc = this.gl.getUniformLocation(this.divergenceTimeProgram, 'u_stateTexture');
    const accumulatedLoc = this.gl.getUniformLocation(this.divergenceTimeProgram, 'u_accumulatedDivergence');
    const resetLoc = this.gl.getUniformLocation(this.divergenceTimeProgram, 'u_reset');
    const thresholdLoc = this.gl.getUniformLocation(this.divergenceTimeProgram, 'u_divergenceThreshold');
    const iterationLoc = this.gl.getUniformLocation(this.divergenceTimeProgram, 'u_iteration');
    const numSamplesLoc = this.gl.getUniformLocation(this.divergenceTimeProgram, 'u_numSamples');

    this.gl.uniform1i(stateLoc, 0);
    this.gl.uniform1i(accumulatedLoc, 1);
    this.gl.uniform1i(resetLoc, reset ? 1 : 0);
    this.gl.uniform1f(thresholdLoc, divergenceThreshold);
    this.gl.uniform1i(iterationLoc, iteration);
    this.gl.uniform1i(numSamplesLoc, this.divergenceSamples);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, stateTexture);

    this.gl.activeTexture(this.gl.TEXTURE1);
    this.gl.bindTexture(this.gl.TEXTURE_2D, readTexture);

    for (let i = 0; i < 8; i++) {
      const perturbedLoc = this.gl.getUniformLocation(this.divergenceTimeProgram, `u_perturbedState${i}`);
      if (perturbedLoc !== null && i < this.divergenceSamples) {
        const readIdx = this.divergencePerturbedReadIndices[i];
        const perturbedTex = readIdx === 0
          ? this.divergencePerturbedTexturesRead[i]
          : this.divergencePerturbedTexturesWrite[i];
        this.gl.uniform1i(perturbedLoc, 2 + i);
        this.gl.activeTexture(this.gl.TEXTURE2 + i);
        this.gl.bindTexture(this.gl.TEXTURE_2D, perturbedTex);
      }
    }

    const writeFramebuffer = this.divergenceTimeReadIndex === 0
      ? this.divergenceTimeFramebufferAlt
      : this.divergenceTimeFramebuffer;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, writeFramebuffer);

    this.gl.viewport(0, 0, resolution, resolution);

    if (!this.divergenceTimeVao) {
      this.divergenceTimeVao = this.gl.createVertexArray();
      this.gl.bindVertexArray(this.divergenceTimeVao);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer.buffer);

      const posLoc = this.gl.getAttribLocation(this.divergenceTimeProgram, 'a_position');
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.bindVertexArray(this.divergenceTimeVao);
    }

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.bindVertexArray(null);

    this.divergenceTimeReadIndex = 1 - this.divergenceTimeReadIndex;

    if (reset) {
      this.divergenceTimeAccumulatedFrameCount = 1;
    } else {
      this.divergenceTimeAccumulatedFrameCount++;
    }
  }

  render(ftleTexture, viewMode, state, canvas, resolution, stateTexture = null, divergenceTexture = null) {
    const isPositionMode = viewMode === 'position';
    const isDivergenceTimeMode = viewMode === 'divergence-time';

    if (isPositionMode) {
      this.renderPosition(stateTexture, state, canvas, resolution);
      return;
    }

    if (!this.renderProgram) return;

    this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    let textureToRender = ftleTexture;
    let isAccumulated = viewMode === 'accumulated';
    let isThreshold = viewMode === 'threshold';
    let isBob2Distance = viewMode === 'bob2-distance';

    if (isAccumulated) {
      const isAlt = this.accumulateReadIndex === 1;
      textureToRender = isAlt ? this.accumulatedFtleTextureAlt : this.accumulatedFtleTexture;
    } else if (isBob2Distance) {
      const isAlt = this.bob2DistanceReadIndex === 1;
      textureToRender = isAlt ? this.bob2DistanceTextureAlt : this.bob2DistanceTexture;
    } else if (isDivergenceTimeMode) {
      // Use the divergence texture from the simulation
      textureToRender = divergenceTexture;
    }

    this.gl.viewport(0, 0, canvas.width, canvas.height);

    let range;
    if (isThreshold) {
      range = { min: 1, max: Math.max(1, this.accumulatedFrameCount) };
    } else if (isDivergenceTimeMode) {
      range = { min: 0, max: Math.max(1, this.divergenceTimeAccumulatedFrameCount) };
    } else {
      if (!this.cachedFtleRange) {
        range = this.computeFtleRange(textureToRender, viewMode, state, resolution);
        this.cachedFtleRange = range;
      } else {
        range = this.cachedFtleRange;
      }
    }

    this.gl.useProgram(this.renderProgram);

    const ftleLoc = this.gl.getUniformLocation(this.renderProgram, 'u_ftleTexture');
    const colorModeLoc = this.gl.getUniformLocation(this.renderProgram, 'u_colorMode');
    const valueMappingLoc = this.gl.getUniformLocation(this.renderProgram, 'u_valueMapping');
    const mappingMinLoc = this.gl.getUniformLocation(this.renderProgram, 'u_mappingMin');
    const mappingMaxLoc = this.gl.getUniformLocation(this.renderProgram, 'u_mappingMax');
    const mappingPeriodLoc = this.gl.getUniformLocation(this.renderProgram, 'u_mappingPeriod');
    const isAccumulatedLoc = this.gl.getUniformLocation(this.renderProgram, 'u_isAccumulated');
    const isThresholdLoc = this.gl.getUniformLocation(this.renderProgram, 'u_isThreshold');
    const isBob2DistanceLoc = this.gl.getUniformLocation(this.renderProgram, 'u_isBob2Distance');
    const isDivergenceTimeLoc = this.gl.getUniformLocation(this.renderProgram, 'u_isDivergenceTime');
    const frameCountLoc = this.gl.getUniformLocation(this.renderProgram, 'u_accumulatedFrameCount');
    const integrationStepsLoc = this.gl.getUniformLocation(this.renderProgram, 'u_integrationSteps');
    const dtLoc = this.gl.getUniformLocation(this.renderProgram, 'u_dt');

    this.gl.uniform1i(ftleLoc, 0);
    this.gl.uniform1i(colorModeLoc, (isThreshold || isDivergenceTimeMode) ? 0 : state.colorMode);
    this.gl.uniform1i(valueMappingLoc, isThreshold ? 0 : state.valueMapping);
    this.gl.uniform1f(mappingMinLoc, range.min);
    this.gl.uniform1f(mappingMaxLoc, range.max);
    this.gl.uniform1f(mappingPeriodLoc, isThreshold ? 1.0 : state.mappingPeriod);
    this.gl.uniform1i(isAccumulatedLoc, isAccumulated ? 1 : 0);
    this.gl.uniform1i(isThresholdLoc, isThreshold ? 1 : 0);
    this.gl.uniform1i(isBob2DistanceLoc, isBob2Distance ? 1 : 0);
    this.gl.uniform1i(isDivergenceTimeLoc, isDivergenceTimeMode ? 1 : 0);
    this.gl.uniform1i(frameCountLoc, this.accumulatedFrameCount);
    this.gl.uniform1i(integrationStepsLoc, state.integrationSteps);
    this.gl.uniform1f(dtLoc, state.dt);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureToRender);

    if (!this.renderVao) {
      this.renderVao = this.gl.createVertexArray();
      this.gl.bindVertexArray(this.renderVao);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer.buffer);

      const posLoc = this.gl.getAttribLocation(this.renderProgram, 'a_position');
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.bindVertexArray(this.renderVao);
    }

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.bindVertexArray(null);
  }

  renderPosition(stateTexture, state, canvas, resolution) {
    if (!this.positionRenderProgram || !stateTexture) return;

    this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.viewport(0, 0, canvas.width, canvas.height);

    this.gl.useProgram(this.positionRenderProgram);

    const stateLoc = this.gl.getUniformLocation(this.positionRenderProgram, 'u_stateTexture');
    const positionModeLoc = this.gl.getUniformLocation(this.positionRenderProgram, 'u_positionMode');
    const mappingMinLoc = this.gl.getUniformLocation(this.positionRenderProgram, 'u_mappingMin');
    const mappingMaxLoc = this.gl.getUniformLocation(this.positionRenderProgram, 'u_mappingMax');
    const valueMappingLoc = this.gl.getUniformLocation(this.positionRenderProgram, 'u_valueMapping');
    const mappingPeriodLoc = this.gl.getUniformLocation(this.positionRenderProgram, 'u_mappingPeriod');

    this.gl.uniform1i(stateLoc, 0);
    this.gl.uniform1i(positionModeLoc, this.positionMode);
    this.gl.uniform1f(mappingMinLoc, state.mappingMin || -10.0);
    this.gl.uniform1f(mappingMaxLoc, state.mappingMax || 10.0);
    this.gl.uniform1i(valueMappingLoc, state.valueMapping);
    this.gl.uniform1f(mappingPeriodLoc, state.mappingPeriod || 1.0);

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, stateTexture);

    if (!this.positionRenderVao) {
      this.positionRenderVao = this.gl.createVertexArray();
      this.gl.bindVertexArray(this.positionRenderVao);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer.buffer);

      const posLoc = this.gl.getAttribLocation(this.positionRenderProgram, 'a_position');
      this.gl.enableVertexAttribArray(posLoc);
      this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);
    } else {
      this.gl.bindVertexArray(this.positionRenderVao);
    }

    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    this.gl.bindVertexArray(null);
  }

  renderThumbnail(data, viewMode, state, resolution) {
    if (!this.renderProgram || !data) return null;

    const gl = this.gl;
    const isPositionMode = viewMode === 'position';
    const isDivergenceTimeMode = viewMode === 'divergence-time';

    if (isPositionMode) {
      return this.renderThumbnailPosition(data, state, resolution);
    }

    const tempTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, resolution, resolution, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.thumbnailFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.thumbnailTexture, 0);
    gl.viewport(0, 0, 32, 32);

    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    let isAccumulated = viewMode === 'accumulated';
    let isThreshold = viewMode === 'threshold';
    let isBob2Distance = viewMode === 'bob2-distance';

    let range;
    if (isThreshold) {
      range = { min: 1, max: Math.max(1, this.accumulatedFrameCount) };
    } else if (isDivergenceTimeMode) {
      range = { min: 0, max: Math.max(1, this.divergenceTimeAccumulatedFrameCount) };
    } else {
      range = this.computeFtleRange(tempTexture, viewMode, state, resolution);
    }

    gl.useProgram(this.renderProgram);

    const ftleLoc = gl.getUniformLocation(this.renderProgram, 'u_ftleTexture');
    const colorModeLoc = gl.getUniformLocation(this.renderProgram, 'u_colorMode');
    const valueMappingLoc = gl.getUniformLocation(this.renderProgram, 'u_valueMapping');
    const mappingMinLoc = gl.getUniformLocation(this.renderProgram, 'u_mappingMin');
    const mappingMaxLoc = gl.getUniformLocation(this.renderProgram, 'u_mappingMax');
    const mappingPeriodLoc = gl.getUniformLocation(this.renderProgram, 'u_mappingPeriod');
    const isAccumulatedLoc = gl.getUniformLocation(this.renderProgram, 'u_isAccumulated');
    const isThresholdLoc = gl.getUniformLocation(this.renderProgram, 'u_isThreshold');
    const isBob2DistanceLoc = gl.getUniformLocation(this.renderProgram, 'u_isBob2Distance');
    const isDivergenceTimeLoc = gl.getUniformLocation(this.renderProgram, 'u_isDivergenceTime');
    const frameCountLoc = gl.getUniformLocation(this.renderProgram, 'u_accumulatedFrameCount');
    const integrationStepsLoc = gl.getUniformLocation(this.renderProgram, 'u_integrationSteps');
    const dtLoc = gl.getUniformLocation(this.renderProgram, 'u_dt');

    gl.uniform1i(ftleLoc, 0);
    gl.uniform1i(colorModeLoc, (isThreshold || isDivergenceTimeMode) ? 0 : state.colorMode);
    gl.uniform1i(valueMappingLoc, isThreshold ? 0 : state.valueMapping);
    gl.uniform1f(mappingMinLoc, range.min);
    gl.uniform1f(mappingMaxLoc, range.max);
    gl.uniform1f(mappingPeriodLoc, isThreshold ? 1.0 : state.mappingPeriod);
    gl.uniform1i(isAccumulatedLoc, isAccumulated ? 1 : 0);
    gl.uniform1i(isThresholdLoc, isThreshold ? 1 : 0);
    gl.uniform1i(isBob2DistanceLoc, isBob2Distance ? 1 : 0);
    gl.uniform1i(isDivergenceTimeLoc, isDivergenceTimeMode ? 1 : 0);
    gl.uniform1i(frameCountLoc, this.accumulatedFrameCount);
    gl.uniform1i(integrationStepsLoc, state.integrationSteps);
    gl.uniform1f(dtLoc, state.dt);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);

    if (!this.renderVao) {
      this.renderVao = gl.createVertexArray();
      gl.bindVertexArray(this.renderVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer.buffer);
      const posLoc = gl.getAttribLocation(this.renderProgram, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.bindVertexArray(this.renderVao);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    const pixels = new Uint8Array(32 * 32 * 4);
    gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(tempTexture);

    return new ImageData(new Uint8ClampedArray(pixels), 32, 32);
  }

  renderThumbnailPosition(data, state, resolution) {
    if (!this.positionRenderProgram) return null;

    const gl = this.gl;

    const tempTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, resolution, resolution, 0, gl.RGBA, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.thumbnailFramebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.thumbnailTexture, 0);
    gl.viewport(0, 0, 32, 32);

    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.positionRenderProgram);

    const stateLoc = gl.getUniformLocation(this.positionRenderProgram, 'u_stateTexture');
    const positionModeLoc = gl.getUniformLocation(this.positionRenderProgram, 'u_positionMode');
    const mappingMinLoc = gl.getUniformLocation(this.positionRenderProgram, 'u_mappingMin');
    const mappingMaxLoc = gl.getUniformLocation(this.positionRenderProgram, 'u_mappingMax');
    const valueMappingLoc = gl.getUniformLocation(this.positionRenderProgram, 'u_valueMapping');
    const mappingPeriodLoc = gl.getUniformLocation(this.positionRenderProgram, 'u_mappingPeriod');

    gl.uniform1i(stateLoc, 0);
    gl.uniform1i(positionModeLoc, this.positionMode);
    gl.uniform1f(mappingMinLoc, state.mappingMin || -10.0);
    gl.uniform1f(mappingMaxLoc, state.mappingMax || 10.0);
    gl.uniform1i(valueMappingLoc, state.valueMapping);
    gl.uniform1f(mappingPeriodLoc, state.mappingPeriod || 1.0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);

    if (!this.positionRenderVao) {
      this.positionRenderVao = gl.createVertexArray();
      gl.bindVertexArray(this.positionRenderVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer.buffer);
      const posLoc = gl.getAttribLocation(this.positionRenderProgram, 'a_position');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    } else {
      gl.bindVertexArray(this.positionRenderVao);
    }

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    const pixels = new Uint8Array(32 * 32 * 4);
    gl.readPixels(0, 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(tempTexture);

    return new ImageData(new Uint8ClampedArray(pixels), 32, 32);
  }

  setPositionMode(mode) {
    this.positionMode = mode;
    this.invalidateCache();
  }

  computeFtleRange(texture, viewMode, state, resolution = 512) {
    const gl = this.gl;
    const sampleStep = 8;
    const sampleRes = Math.ceil(resolution / sampleStep);
    const pixels = new Float32Array(sampleRes * sampleRes * 4);

    const tempFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, tempFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    gl.readPixels(0, 0, sampleRes, sampleRes, gl.RGBA, gl.FLOAT, pixels);

    gl.deleteFramebuffer(tempFb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const totalTime = state.integrationSteps * state.dt;
    const isAccumulated = viewMode === 'accumulated';
    const isThreshold = viewMode === 'threshold';
    const isBob2Distance = viewMode === 'bob2-distance';
    const isDivergenceTime = viewMode === 'divergence-time';
    const valueMapping = state.valueMapping;
    const mappingPeriod = state.mappingPeriod || 1.0;

    const values = [];
    for (let i = 0; i < pixels.length; i += 4) {
      let rawValue = 0.0;

      if (isThreshold) {
        const frameCount = pixels[i];
        const hasValidData = pixels[i + 1];
        if (hasValidData > 0 && frameCount > 0) {
          rawValue = frameCount;
        }
      } else if (isDivergenceTime) {
        // Format: R=divergenceFrame, G=maxDistance
        const divergenceFrame = Math.abs(pixels[i]);
        if (divergenceFrame > 0) {
          rawValue = divergenceFrame;
        }
      } else if (isAccumulated) {
        // Format: R=accumulatedFtle, G=frameCount
        const accumulatedFtle = pixels[i];
        const frameCount = pixels[i + 1];
        if (frameCount > 0) {
          rawValue = accumulatedFtle / frameCount;
        }
      } else if (isBob2Distance) {
        // Format: R=x2, G=y2, B=totalDistance, A=validFlag
        const totalDistance = pixels[i + 2];
        const hasValidData = pixels[i + 3];
        if (hasValidData > 0) {
          rawValue = totalDistance;
        }
      } else {
        // Instant FTLE format: R=maxLogGrowth, G=hasValidData
        const maxLogGrowth = pixels[i];
        const hasValidData = pixels[i + 1];
        if (hasValidData > 0 && totalTime > 0) {
          rawValue = maxLogGrowth / totalTime;
        }
      }


      if (isFinite(rawValue)) {
        values.push(rawValue);
      }
    }

    if (values.length === 0) {
      return { min: 0.0, max: 1.0 };
    }

    values.sort((a, b) => a - b);

    const lowIdx = Math.floor(values.length * 0.02);
    const highIdx = Math.floor(values.length * 0.98);
    let displayMin = values[lowIdx];
    let displayMax = values[highIdx];

    if (valueMapping === 1) {
      displayMin = Math.log(Math.max(displayMin, 1e-6));
      displayMax = Math.log(Math.max(displayMax, 1e-6));
    } else if (valueMapping === 2) {
      displayMin = 0.0;
      displayMax = mappingPeriod;
    }

    if (displayMin === displayMax) {
      return { min: displayMin - 0.5, max: displayMax + 0.5 };
    }

    return { min: displayMin, max: displayMax };
  }

  invalidateCache() {
    this.cachedFtleRange = null;
  }

  cleanup() {
    if (this.accumulatedFtleTexture) {
      this.textureManager.deleteTexture(this.accumulatedFtleTexture);
    }
    if (this.accumulatedFtleTextureAlt) {
      this.textureManager.deleteTexture(this.accumulatedFtleTextureAlt);
    }
    if (this.bob2DistanceTexture) {
      this.textureManager.deleteTexture(this.bob2DistanceTexture);
    }
    if (this.bob2DistanceTextureAlt) {
      this.textureManager.deleteTexture(this.bob2DistanceTextureAlt);
    }
    if (this.divergenceTimeTexture) {
      this.textureManager.deleteTexture(this.divergenceTimeTexture);
    }
    if (this.divergenceTimeTextureAlt) {
      this.textureManager.deleteTexture(this.divergenceTimeTextureAlt);
    }
    if (this.divergencePerturbedTexturesRead) {
      for (const tex of this.divergencePerturbedTexturesRead) {
        this.textureManager.deleteTexture(tex);
      }
    }
    if (this.divergencePerturbedTexturesWrite) {
      for (const tex of this.divergencePerturbedTexturesWrite) {
        this.textureManager.deleteTexture(tex);
      }
    }
    if (this.divergencePerturbedFramebuffers) {
      for (const fb of this.divergencePerturbedFramebuffers) {
        this.gl.deleteFramebuffer(fb);
      }
    }
    if (this.accumulateFramebuffer) {
      this.gl.deleteFramebuffer(this.accumulateFramebuffer);
    }
    if (this.accumulateFramebufferAlt) {
      this.gl.deleteFramebuffer(this.accumulateFramebufferAlt);
    }
    if (this.bob2DistanceFramebuffer) {
      this.gl.deleteFramebuffer(this.bob2DistanceFramebuffer);
    }
    if (this.bob2DistanceFramebufferAlt) {
      this.gl.deleteFramebuffer(this.bob2DistanceFramebufferAlt);
    }
    if (this.divergenceTimeFramebuffer) {
      this.gl.deleteFramebuffer(this.divergenceTimeFramebuffer);
    }
    if (this.divergenceTimeFramebufferAlt) {
      this.gl.deleteFramebuffer(this.divergenceTimeFramebufferAlt);
    }
    if (this.accumulateProgram) {
      this.gl.deleteProgram(this.accumulateProgram);
    }
    if (this.bob2DistanceProgram) {
      this.gl.deleteProgram(this.bob2DistanceProgram);
    }
    if (this.divergenceTimeProgram) {
      this.gl.deleteProgram(this.divergenceTimeProgram);
    }
    if (this.divergenceInitProgram) {
      this.gl.deleteProgram(this.divergenceInitProgram);
    }
    if (this.divergenceEvolvePrograms) {
      for (const system in this.divergenceEvolvePrograms) {
        this.gl.deleteProgram(this.divergenceEvolvePrograms[system]);
      }
    }
    if (this.positionRenderProgram) {
      this.gl.deleteProgram(this.positionRenderProgram);
    }
  }
}
