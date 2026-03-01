import { ShaderCompiler } from './webgl-utils.js';
import { TextureManager } from './texture-manager.js';
import { UI } from './ui.js';
import { DebugVisualizer } from './debug-visualizer.js';
import { AnimationStorage } from './animation-storage.js';
import { AnimationAssembler } from './animation-assembler.js';
import { ShaderLoader } from './utils/ShaderLoader.js';
import { ColorMaps } from './utils/ColorMaps.js';
import { SystemRegistry } from './systems/SystemRegistry.js';
import { StateGenerator } from './core/StateGenerator.js';
import { SimulationEngine } from './core/SimulationEngine.js';
import { RenderEngine } from './core/RenderEngine.js';
import { FrameManager } from './core/FrameManager.js';

export class ChaosRenderer {
  constructor(canvas, container) {
    this.canvas = canvas;
    this.container = container;

    if (!canvas) {
      throw new Error('Canvas element is null or undefined');
    }

    try {
      this.gl = ShaderCompiler.createContext(canvas);
    } catch (e) {
      console.error('Failed to create WebGL2 context:', e.message);
      throw e;
    }

    this.textureManager = new TextureManager(this.gl);
    this.shaderLoader = new ShaderLoader(new URL('..', import.meta.url).href);

    this.ui = new UI(canvas, document.body);
    this.debugVisualizer = new DebugVisualizer(this, this.ui);

    this.resolution = 512;
    this.viewMode = 'instant';
    this.isSimulationRunning = false;
    this.isAnimationPlaying = false;

    this.simulationEngine = new SimulationEngine(this.gl, this.textureManager);
    this.renderEngine = new RenderEngine(this.gl, this.textureManager);
    this.frameManager = new FrameManager();
    this.stateGenerator = new StateGenerator(this.resolution, this.ui);

    this.animationStorage = new AnimationStorage();
    this.animationAssembler = new AnimationAssembler(this.animationStorage);

    this.systemShaders = null;
    this.shaders = null;
    this.noiseTexture = null;
    this.noiseGridSize = 8;
    
    this.lastHoverUV = null;
    this.hoverUpdatePending = false;

    this.attachUIEvents();
    this.attachHoverHandler();
  }

  async initialize() {
    this.shaders = await this.shaderLoader.loadAll();
    this.systemShaders = this.loadSystemShaders();
    this.simulationEngine.setShaders(this.shaders, this.systemShaders);

    await this.renderEngine.compileRenderProgram(this.shaders.render);
    await this.renderEngine.compileAccumulateProgram(this.shaders.accumulate);
    await this.renderEngine.compileBob2DistanceProgram(this.shaders.bob2Distance);
    await this.renderEngine.compileDivergenceTimeProgram(this.shaders.divergenceTime);
    await this.renderEngine.compileDivergenceInitProgram(this.shaders.divergenceInit);
    // Divergence evolve is compiled per-system in compileSystemDivergenceProgram()
    await this.renderEngine.compilePositionRenderProgram(this.shaders.renderPosition);

    this.renderEngine.systemShaders = this.systemShaders;

    this.simulationEngine.initialize(this.resolution);
    this.renderEngine.initialize(this.resolution);

    // Compile divergence evolve for default system
    const defaultSystem = this.ui.getState().system || 'double-pendulum';
    await this.compileSystemDivergenceProgram(defaultSystem);
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.canvas.addEventListener('webglcontextlost', (e) => {
      console.warn('Main WebGL context lost');
      this.setButtonsState(true);
      e.preventDefault();
    });

    this.canvas.addEventListener('webglcontextrestored', async () => {
      console.log('Main WebGL context restored, recreating resources...');
      await this.handleContextRestored();
    });
  }

  loadSystemShaders() {
    const basePath = new URL('..', import.meta.url).href;
    return {
      'double-pendulum': basePath + 'shaders/system-double-pendulum.glsl',
      'elastic-pendulum': basePath + 'shaders/system-elastic-pendulum.glsl',
      'henon-heiles': basePath + 'shaders/system-henon-heiles.glsl',
      'duffing': basePath + 'shaders/system-duffing.glsl'
    };
  }

  async compileSystemDivergenceProgram(system) {
    const systemShaderPath = this.systemShaders[system];
    if (!systemShaderPath) return;

    const response = await fetch(systemShaderPath + '?v=' + Date.now());
    const systemSource = await response.text();
    await this.renderEngine.compileDivergenceEvolveProgramForSystem(system, systemSource);
  }

  resizeCanvas() {
    const rect = this.container.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    this.canvas.width = size;
    this.canvas.height = size;
    this.gl.viewport(0, 0, size, size);
  }

  async handleContextRestored() {
    try {
      this.gl = ShaderCompiler.createContext(this.canvas);
      this.textureManager = new TextureManager(this.gl);
      
      this.simulationEngine = new SimulationEngine(this.gl, this.textureManager);
      this.renderEngine = new RenderEngine(this.gl, this.textureManager);
      
      this.simulationEngine.setShaders(this.shaders, this.systemShaders);
      this.simulationEngine.initialize(this.resolution);
      this.renderEngine.initialize(this.resolution);
      
      await this.renderEngine.compileRenderProgram(this.shaders.render);
      await this.renderEngine.compileAccumulateProgram(this.shaders.accumulate);
      await this.renderEngine.compileBob2DistanceProgram(this.shaders.bob2Distance);
      await this.renderEngine.compileDivergenceTimeProgram(this.shaders.divergenceTime);
      await this.renderEngine.compileDivergenceInitProgram(this.shaders.divergenceInit);
      await this.renderEngine.compileDivergenceEvolveProgram(this.shaders.divergenceEvolve);
      await this.renderEngine.compilePositionRenderProgram(this.shaders.renderPosition);

      this.setButtonsState(false);
    } catch (error) {
      console.error('Failed to restore WebGL context:', error);
      alert('Failed to restore WebGL context. Please refresh the page.');
    }
  }

  async simulate() {
    if (this.isSimulationRunning) {
      this.stopSimulation();
      return;
    }

    const state = this.ui.getState();
    const iterationsPerSample = 1;
    const iterationsBetweenSamples = state.iterationsBetweenSamples || 5;
    const numPerturbations = state.numPerturbations || 32;
    const isVerlet = state.integrator === 'verlet';

    try {
      await this.initializeSimulation();

      this.isSimulationRunning = true;
      this.setButtonsState(true);

      const pixelCount = this.resolution * this.resolution;
      this.frameManager.initialize(pixelCount);

      await this.runSingleFrame(iterationsPerSample, iterationsBetweenSamples, numPerturbations, isVerlet);
      await this.accumulateFrame(true, iterationsPerSample);
      await this.saveCurrentFrame();
      
      this.updateThresholdData(1);
      this.render();
      
      this.ui.updateSampleCount(1);
      this.updateCurrentFrameDisplay(1, 1);
      this.addThumbnailForCurrentFrame(1);
    } catch (error) {
      console.error('Error during simulation:', error);
      this.stopSimulation();
      throw error;
    }
  }

  async initializeSimulation() {
    if (this.simulationEngine.simulationProgram) {
      return;
    }

    const state = this.ui.getState();
    const system = state.system;

    try {
      await this.simulationEngine.compileSimulationProgram(system);
      this.simulationEngine.setUniforms(state.dt, state.perturbationScale, this.noiseGridSize);

      const initialData = this.stateGenerator.generate();
      this.simulationEngine.copyInitialState(initialData);

      this.initializeNoiseTexture();

      this.simulationEngine.reset();
      this.renderEngine.accumulatedFrameCount = 0;
      this.renderEngine.invalidateCache();
    } catch (error) {
      console.error('Error initializing simulation:', error);
      throw error;
    }
  }

  initializeNoiseTexture() {
    if (this.noiseTexture) {
      this.textureManager.deleteTexture(this.noiseTexture);
    }
    const noiseData = this.stateGenerator.generateNoise();
    this.noiseTexture = this.textureManager.createFloatTexture(noiseData.width, noiseData.height, noiseData.data);
    this.noiseGridSize = noiseData.gridSize;
  }

  async runSingleFrame(iterationsPerSample, iterationsBetweenSamples, numPerturbations, isVerlet) {
    if (!this.simulationEngine.isFirstFrame) {
      this.simulationEngine.runStep(iterationsBetweenSamples, 0, this.noiseTexture, isVerlet);
    }

    this.simulationEngine.runStep(iterationsPerSample, numPerturbations, this.noiseTexture, isVerlet);
    this.simulationEngine.isFirstFrame = false;
  }

  async accumulateFrame(reset = false, actualIterations = 1) {
    const currentState = this.simulationEngine.getCurrentState();
    const state = this.ui.getState();

    await this.renderEngine.accumulateFrame(
      currentState.ftleTexture,
      actualIterations,
      state.dt,
      reset,
      this.resolution
    );

    await this.renderEngine.accumulateBob2Distance(currentState.stateTexture, reset, this.resolution);
  }

  async generateNextFrame() {
    this.showLiveCanvas();

    const state = this.ui.getState();
    const iterationsPerSample = 1;
    const iterationsBetweenSamples = state.iterationsBetweenSamples || 5;
    const numPerturbations = state.numPerturbations || 32;
    const isVerlet = state.integrator === 'verlet';
    const saveInterval = state.saveFrameInterval || 1;

    this.initializeNoiseTexture();

    try {
      await this.runSingleFrame(iterationsPerSample, iterationsBetweenSamples, numPerturbations, isVerlet);
      await this.accumulateFrame(this.renderEngine.accumulatedFrameCount === 0, iterationsPerSample);
      
      this.renderEngine.invalidateCache();
      this.frameManager.incrementFrameCounter();

      const shouldSaveFrame = this.frameManager.shouldSaveFrame(saveInterval);

      if (shouldSaveFrame) {
        await this.saveCurrentFrame();
        this.frameManager.resetFrameCounter();
      }

      this.render();
      this.updateThresholdData(this.frameManager.internalFrameCounter);

      if (shouldSaveFrame) {
        const sampleCount = this.frameManager.getFrameCount();
        this.frameManager.frameCount++;
        this.ui.updateSampleCount(sampleCount + 1);
        this.updateCurrentFrameDisplay(sampleCount + 1, sampleCount + 1);
        this.addThumbnailForCurrentFrame(sampleCount + 1);
        this.ui.updateAnimationStats(sampleCount + 1, sampleCount + 1, this.frameManager.getFrameCount());
      } else {
        this.ui.updateSampleCount(this.frameManager.getFrameCount());
        this.updateCurrentFrameDisplay(this.frameManager.getFrameCount(), this.frameManager.getFrameCount());
        this.ui.updateAnimationStats(this.frameManager.getFrameCount(), this.frameManager.getFrameCount(), this.frameManager.getFrameCount());
      }
    } catch (error) {
      console.error('Error during next frame:', error);
      throw error;
    }
  }

  updateThresholdData(currentFrameNumber) {
    const state = this.ui.getState();
    const threshold = state.threshold || 1.0;
    const totalTime = state.integrationSteps * state.dt;

    const currentState = this.simulationEngine.getCurrentState();
    const tempFb = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, tempFb);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, currentState.ftleTexture, 0);
    
    const instantData = new Float32Array(this.resolution * this.resolution * 4);
    this.gl.readPixels(0, 0, this.resolution, this.resolution, this.gl.RGBA, this.gl.FLOAT, instantData);
    
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.deleteFramebuffer(tempFb);

    this.frameManager.updateThresholdData(currentFrameNumber, instantData, totalTime, threshold, this.resolution);
  }

  async saveCurrentFrame() {
    const state = this.ui.getState();
    if (!state.saveAnimation) return;

    const currentState = this.simulationEngine.getCurrentState();
    
    const tempFb = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, tempFb);

    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, currentState.ftleTexture, 0);
    const instantData = new Float32Array(this.resolution * this.resolution * 4);
    this.gl.readPixels(0, 0, this.resolution, this.resolution, this.gl.RGBA, this.gl.FLOAT, instantData);

    const accumulatedTexture = this.renderEngine.accumulateReadIndex === 0 
      ? this.renderEngine.accumulatedFtleTexture 
      : this.renderEngine.accumulatedFtleTextureAlt;
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, accumulatedTexture, 0);
    const accumulatedData = new Float32Array(this.resolution * this.resolution * 4);
    this.gl.readPixels(0, 0, this.resolution, this.resolution, this.gl.RGBA, this.gl.FLOAT, accumulatedData);


    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, currentState.stateTexture, 0);
    const currentStateData = new Float32Array(this.resolution * this.resolution * 4);
    this.gl.readPixels(0, 0, this.resolution, this.resolution, this.gl.RGBA, this.gl.FLOAT, currentStateData);

    const bob2Texture = this.renderEngine.bob2DistanceReadIndex === 0
      ? this.renderEngine.bob2DistanceTexture
      : this.renderEngine.bob2DistanceTextureAlt;
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, bob2Texture, 0);
    const bob2Data = new Float32Array(this.resolution * this.resolution * 4);
    this.gl.readPixels(0, 0, this.resolution, this.resolution, this.gl.RGBA, this.gl.FLOAT, bob2Data);

    // Read divergence texture
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, currentState.divergenceTexture, 0);
    const divergenceData = new Float32Array(this.resolution * this.resolution * 4);
    this.gl.readPixels(0, 0, this.resolution, this.resolution, this.gl.RGBA, this.gl.FLOAT, divergenceData);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.deleteFramebuffer(tempFb);

    this.frameManager.addFrame(instantData, accumulatedData, bob2Data, currentStateData, this.resolution, divergenceData);
  }

  render() {
    const currentState = this.simulationEngine.getCurrentState();
    const state = this.ui.getState();
    
    this.renderEngine.render(
      currentState.ftleTexture,
      this.viewMode,
      state,
      this.canvas,
      this.resolution,
      currentState.stateTexture,
      currentState.divergenceTexture
    );
  }

  setViewMode(mode) {
    const validModes = ['instant', 'accumulated', 'threshold', 'bob2-distance', 'position', 'divergence-time'];
    if (!validModes.includes(mode)) {
      console.error('Invalid view mode:', mode);
      return;
    }

    this.viewMode = mode;
    this.renderEngine.invalidateCache();
    this.render();
  }

  setPositionMode(mode) {
    this.renderEngine.setPositionMode(mode);
    if (this.viewMode === 'position') {
      this.render();
    }
  }

  stopSimulation() {
    this.isSimulationRunning = false;
    this.setButtonsState(false);
    this.ui.hideProgress();
  }

  setButtonsState(simulating) {
    const simulateBtn = document.getElementById('simulate');
    const nextFrameBtn = document.getElementById('next-frame');

    if (simulateBtn) simulateBtn.disabled = simulating;
    if (nextFrameBtn) nextFrameBtn.disabled = !simulating;
  }

  async startAnimationLoop() {
    if (this.isAnimationPlaying) return;

    if (!this.shaders || !this.systemShaders) {
      console.warn('Cannot start animation: shaders not loaded yet');
      return;
    }

    this.isAnimationPlaying = true;
    this.updatePlayPauseButton();

    while (this.isAnimationPlaying) {
      if (!this.simulationEngine.simulationProgram) {
        await this.initializeAndGenerateFirstFrame();
      } else {
        await this.generateNextFrame();
      }
      const state = this.ui.getState();
      await this.sleep(state.animationPauseDuration || 1000);
    }
  }

  stopAnimationLoop() {
    this.isAnimationPlaying = false;
    this.updatePlayPauseButton();
  }

  toggleAnimation() {
    if (this.isAnimationPlaying) {
      this.stopAnimationLoop();
    } else {
      this.startAnimationLoop();
    }
  }

  updatePlayPauseButton() {
    const icon = document.getElementById('play-pause-icon');
    if (icon) {
      icon.textContent = this.isAnimationPlaying ? '⏸' : '▶';
    }
  }

  async initializeAndGenerateFirstFrame() {
    const state = this.ui.getState();
    const iterationsPerSample = 1;
    const iterationsBetweenSamples = state.iterationsBetweenSamples || 5;
    const numPerturbations = state.numPerturbations || 32;
    const isVerlet = state.integrator === 'verlet';

    try {
      await this.initializeSimulation();

      const pixelCount = this.resolution * this.resolution;
      this.frameManager.initialize(pixelCount);

      await this.runSingleFrame(iterationsPerSample, iterationsBetweenSamples, numPerturbations, isVerlet);
      await this.accumulateFrame(true, iterationsPerSample);
      await this.saveCurrentFrame();

      this.updateThresholdData(1);

      this.render();
      this.ui.updateSampleCount(1);
      this.updateCurrentFrameDisplay(1, 1);
      this.addThumbnailForCurrentFrame(1);
      this.ui.updateAnimationStats(1, 1, this.frameManager.getFrameCount());
    } catch (error) {
      console.error('Error during first frame:', error);
      throw error;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  downloadImage() {
    const link = document.createElement('a');
    link.download = 'chaos-map.png';
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }

  attachUIEvents() {
    this.ui.on('systemChange', async (system) => {
      this.simulationEngine.cleanup();
      this.simulationEngine.initialize(this.resolution);
      await this.simulationEngine.compileSimulationProgram(system);
      await this.compileSystemDivergenceProgram(system);
    });

    this.ui.on('integratorChange', async () => {
      const system = this.ui.getState().system;
      await this.simulationEngine.compileSimulationProgram(system);
    });

    this.ui.on('colorMapChange', () => {
      this.render();
    });

    this.ui.on('mappingChange', () => {
      this.renderEngine.invalidateCache();
      this.render();
    });

    this.ui.on('resolutionChange', (resolution) => {
      this.resolution = resolution;
      this.stateGenerator = new StateGenerator(resolution, this.ui);
      this.simulationEngine.resize(resolution, resolution);
      this.simulationEngine = new SimulationEngine(this.gl, this.textureManager);
      this.simulationEngine.setShaders(this.shaders, this.systemShaders);
      this.simulationEngine.initialize(resolution);
      this.renderEngine.initialize(resolution);
      this.stopSimulation();
    });

    this.ui.on('viewChange', () => {
      this.render();
    });

    this.ui.on('basisChange', () => {
      this.stopSimulation();
      this.simulationEngine.cleanup();
      this.simulationEngine.initialize(this.resolution);
      this.renderEngine.invalidateCache();
    });

    this.ui.on('generateFrame', async () => {
      if (!this.simulationEngine.simulationProgram) {
        await this.initializeAndGenerateFirstFrame();
      } else {
        await this.generateNextFrame();
      }
    });

    this.ui.on('download', () => {
      this.downloadImage();
    });

    this.ui.on('viewModeChange', (mode) => {
      this.setViewMode(mode);
    });

    this.ui.on('positionModeChange', (mode) => {
      this.setPositionMode(mode);
    });

    this.ui.on('divergenceThresholdChange', (threshold) => {
      this.renderEngine.invalidateCache();
    });

    this.ui.on('divergenceConfigChange', (config) => {
      const needsReinit = this.renderEngine.setDivergenceConfig(config.samples, config.scale);
      if (needsReinit) {
        this.renderEngine.initializeDivergenceTextures(this.resolution);
      }
      this.renderEngine.invalidateCache();
    });

    this.ui.on('assembleAnimation', async () => {
      const result = await this.animationAssembler.assembleVideo(this, 30);
      if (result.success) {
        console.log('Video generated successfully');
      } else {
        console.error('Video generation errors:', result.errors);
        alert('Failed to generate video: ' + result.errors.join(', '));
      }
    });

    this.ui.on('clearFrames', () => {
      this.clearAllFrames();
    });

    this.ui.on('toggleAnimation', () => {
      this.toggleAnimation();
      this.ui.setGenerateFrameEnabled(!this.isAnimationPlaying);
    });

    this.ui.on('prevFrame', () => {
      this.prevFrame();
    });

    this.ui.on('nextFrame', () => {
      this.nextFrame();
    });
  }

  clearAllFrames() {
    this.animationStorage.clearFrames();
    this.frameManager.clear();
    this.renderEngine.accumulatedFrameCount = 0;
    this.renderEngine.accumulateReadIndex = 0;
    this.renderEngine.bob2DistanceAccumulatedFrameCount = 0;
    this.renderEngine.bob2DistanceReadIndex = 0;
    this.renderEngine.divergenceTimeAccumulatedFrameCount = 0;
    this.renderEngine.divergenceTimeReadIndex = 0;

    const strip = document.getElementById('thumbnail-strip');
    if (strip) {
      strip.innerHTML = '';
    }

    this.showLiveCanvas();
    this.render();

    this.ui.updateAnimationStats(0, 0, 0);
  }

  showLiveCanvas() {
    this.frameManager.showLive();
    this.render();
  }

  updateCurrentFrameDisplay(current, total) {
    const counter = document.getElementById('frame-counter');
    if (counter) {
      counter.textContent = `${current} / ${total}`;
    }
  }

  prevFrame() {
    const frame = this.frameManager.prevFrame();
    if (frame) {
      const viewMode = this.frameManager.savedFrameViewType || this.viewMode;
      this.renderSavedFrameToCanvas(frame, viewMode);
      this.updateCurrentFrameDisplay(this.frameManager.currentFrameIndex + 1, this.frameManager.getFrameCount());
    }
  }

  nextFrame() {
    const frame = this.frameManager.nextFrame();
    if (frame) {
      const viewMode = this.frameManager.savedFrameViewType || this.viewMode;
      this.renderSavedFrameToCanvas(frame, viewMode);
      this.updateCurrentFrameDisplay(this.frameManager.currentFrameIndex + 1, this.frameManager.getFrameCount());
    }
  }

  addThumbnailForCurrentFrame(frameNumber) {
    const strip = document.getElementById('thumbnail-strip');
    if (!strip) return;
    
    const frameIndex = this.frameManager.getFrameCount() - 1;
    const frame = this.frameManager.getFrame(frameIndex);
    if (!frame) return;
    
    const container = document.createElement('div');
    container.className = 'frame-thumbnail-container';
    container.dataset.frameIndex = frameIndex;
    
    const modes = [
      { key: 'instant', label: 'F', data: frame.instantTextureData },
      { key: 'accumulated', label: 'A', data: frame.accumulatedTextureData },
      { key: 'bob2-distance', label: 'B', data: frame.bob2DistanceTextureData },
      { key: 'position', label: 'P', data: frame.currentStateData },
      { key: 'threshold', label: 'T', data: frame.instantTextureData }
    ];
    
    modes.forEach(mode => {
      const thumb = document.createElement('div');
      thumb.className = 'thumbnail-item';
      thumb.title = `Frame ${frameNumber} - ${mode.label}`;
      thumb.dataset.viewMode = mode.key;
      thumb.style.position = 'relative';
      
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      
      this.renderThumbnailData(canvas, mode.data, mode.key, frame);
      
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.style.width = '100%';
      img.style.height = '100%';
      thumb.appendChild(img);
      
      thumb.addEventListener('click', () => {
        this.loadSavedFrame(frameIndex, mode.key);
        document.querySelectorAll('.thumbnail-item').forEach(t => { t.classList.remove('active'); });
        thumb.classList.add('active');
      });
      
      container.appendChild(thumb);
    });
    
    strip.appendChild(container);
    strip.scrollLeft = strip.scrollWidth;
  }
  
  renderThumbnailData(canvas, data, viewMode, frame) {
    const ctx = canvas.getContext('2d');
    const uiState = this.ui.getState();
    
    let thumbnailData = data;
    if (viewMode === 'threshold' && this.frameManager.thresholdCrossedData) {
      thumbnailData = this.frameManager.buildThresholdTextureData(this.frameManager.internalFrameCounter, this.resolution);
    }
    
    const imageData = this.renderEngine.renderThumbnail(thumbnailData, viewMode, uiState, this.resolution);
    if (imageData) {
      ctx.putImageData(imageData, 0, 0);
    }
  }
  

  
  loadSavedFrame(frameIndex, viewMode) {
    const frame = this.frameManager.goToFrame(frameIndex, viewMode);
    if (!frame) return;
    
    this.viewMode = viewMode;
    this.frameManager.savedFrameViewType = viewMode;
    this.renderSavedFrameToCanvas(frame, viewMode);
  }
  
  computeRangeFromData(data, viewMode, resolution) {
    const state = this.ui.getState();
    const totalTime = state.integrationSteps * state.dt;
    const values = [];
    
    for (let i = 0; i < data.length; i += 4) {
      let rawValue = 0.0;
      
      if (viewMode === 'instant') {
        // Format: R=maxLogGrowth, G=hasValidData
        const maxLogGrowth = data[i];
        const hasValidData = data[i + 1];
        if (hasValidData > 0 && totalTime > 0) {
          rawValue = maxLogGrowth / totalTime;
        }
      } else if (viewMode === 'accumulated') {
        // Format: R=accumulatedFtle, G=frameCount
        const accumulatedFtle = data[i];
        const frameCount = data[i + 1];
        if (frameCount > 0) {
          rawValue = accumulatedFtle / frameCount;
        }
      } else if (viewMode === 'bob2-distance') {
        // Format: R=x2, G=y2, B=totalDistance, A=validFlag
        const totalDistance = data[i + 2];
        const hasValidData = data[i + 3];
        if (hasValidData > 0) {
          rawValue = totalDistance;
        }
      } else if (viewMode === 'divergence-time') {
        // Format: R=divergenceFrame, G=maxDistance
        const divergenceFrame = data[i];
        if (divergenceFrame > 0) {
          rawValue = divergenceFrame;
        }
      } else if (viewMode === 'position') {
        const theta1 = data[i];
        rawValue = (Math.atan2(Math.sin(theta1), Math.cos(theta1)) + Math.PI) / (2 * Math.PI);
      } else if (viewMode === 'threshold') {
        const frameCount = data[i];
        const hasValidData = data[i + 1];
        if (hasValidData > 0 && frameCount > 0) {
          rawValue = frameCount;
        }
      }
      if (isFinite(rawValue) && rawValue !== 0) {
        values.push(rawValue);
      }
    }
    
    if (values.length === 0) {
      return { min: 0.0, max: 1.0 };
    }
    
    values.sort((a, b) => a - b);
    
    const lowIdx = Math.floor(values.length * 0.02);
    const highIdx = Math.floor(values.length * 0.98);
    let displayMin = values[lowIdx] || 0;
    let displayMax = values[highIdx] || 1;
    
    if (displayMin === displayMax) {
      return { min: displayMin - 0.5, max: displayMax + 0.5 };
    }
    
    return { min: displayMin, max: displayMax };
  }
  
  renderSavedFrameToCanvas(frame, viewMode) {
    const gl = this.gl;
    const state = this.ui.getState();
    
    gl.clearColor(0.1, 0.1, 0.1, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    
    if (viewMode === 'position') {
      this.renderSavedPositionFrame(frame, state);
      return;
    }
    
    let textureData;
    let isAccumulated = viewMode === 'accumulated';
    let isBob2Distance = viewMode === 'bob2-distance';
    let isThreshold = viewMode === 'threshold';
    let isDivergenceTime = viewMode === 'divergence-time';
    
    switch (viewMode) {
      case 'instant':
        textureData = frame.instantTextureData;
        break;
      case 'accumulated':
        textureData = frame.accumulatedTextureData;
        break;
      case 'bob2-distance':
        textureData = frame.bob2DistanceTextureData;
        break;
      case 'divergence-time':
        textureData = frame.divergenceTextureData;
        break;
      case 'threshold':
        textureData = this.frameManager.buildThresholdTextureData(this.frameManager.internalFrameCounter, this.resolution);
        break;
      default:
        textureData = frame.instantTextureData;
    }
    
    const tempTexture = this.textureManager.createFloatTexture(this.resolution, this.resolution, textureData);
    
    const range = this.computeRangeFromData(textureData, viewMode, this.resolution);
    
    gl.useProgram(this.renderEngine.renderProgram);
    
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_ftleTexture'), 0);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_colorMode'), state.colorMode);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_valueMapping'), state.valueMapping);
    gl.uniform1f(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_mappingMin'), range.min);
    gl.uniform1f(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_mappingMax'), range.max);
    gl.uniform1f(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_mappingPeriod'), state.mappingPeriod || 1.0);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_isAccumulated'), isAccumulated ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_isThreshold'), isThreshold ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_isBob2Distance'), isBob2Distance ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_isDivergenceTime'), isDivergenceTime ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_accumulatedFrameCount'), 1);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_integrationSteps'), state.integrationSteps);
    gl.uniform1f(gl.getUniformLocation(this.renderEngine.renderProgram, 'u_dt'), state.dt);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.renderEngine.vertexBuffer.buffer);
    const posLoc = gl.getAttribLocation(this.renderEngine.renderProgram, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(posLoc);
    
    this.textureManager.deleteTexture(tempTexture);
  }
  
  renderSavedPositionFrame(frame, state) {
    const gl = this.gl;
    const textureData = frame.currentStateData;
    
    const tempTexture = this.textureManager.createFloatTexture(this.resolution, this.resolution, textureData);
    
    gl.useProgram(this.renderEngine.positionRenderProgram);
    
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.positionRenderProgram, 'u_stateTexture'), 0);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.positionRenderProgram, 'u_positionMode'), state.positionMode || 0);
    gl.uniform1f(gl.getUniformLocation(this.renderEngine.positionRenderProgram, 'u_mappingMin'), 0);
    gl.uniform1f(gl.getUniformLocation(this.renderEngine.positionRenderProgram, 'u_mappingMax'), 1);
    gl.uniform1i(gl.getUniformLocation(this.renderEngine.positionRenderProgram, 'u_valueMapping'), 0);
    gl.uniform1f(gl.getUniformLocation(this.renderEngine.positionRenderProgram, 'u_mappingPeriod'), 1.0);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tempTexture);
    
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.renderEngine.vertexBuffer.buffer);
    const posLoc = gl.getAttribLocation(this.renderEngine.positionRenderProgram, 'a_position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(posLoc);
    
    this.textureManager.deleteTexture(tempTexture);
  }

  attachHoverHandler() {
    this.canvas.addEventListener('mousemove', (e) => {
      if (this.hoverUpdatePending) return;
      
      this.hoverUpdatePending = true;
      requestAnimationFrame(() => {
        this.handleHover(e);
        this.hoverUpdatePending = false;
      });
    });
    
    this.canvas.addEventListener('mouseleave', () => {
      this.lastHoverUV = null;
      this.ui.updateHoverInfo(null);
    });
  }

  handleHover(event) {
    if (!this.simulationEngine.simulationProgram) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const u = x / rect.width;
    const v = 1.0 - y / rect.height;

    if (u < 0 || u > 1 || v < 0 || v > 1) return;

    const pixelX = Math.floor(u * this.resolution);
    const pixelY = Math.floor(v * this.resolution);

    if (pixelX < 0 || pixelX >= this.resolution || pixelY < 0 || pixelY >= this.resolution) return;

    const currentState = this.simulationEngine.getCurrentState();
    const uiState = this.ui.getState();

    const hoverData = {
      viewMode: this.viewMode,
      positionMode: uiState.positionMode,
      divergenceThreshold: uiState.divergenceThreshold
    };

    const tempFb = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, tempFb);

    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, currentState.stateTexture, 0);
    const stateData = new Float32Array(4);
    this.gl.readPixels(pixelX, pixelY, 1, 1, this.gl.RGBA, this.gl.FLOAT, stateData);
    hoverData.state = [stateData[0], stateData[1], stateData[2], stateData[3]];

    const basis = uiState.basisPoint;
    const initialState = {
      theta1: uiState.xDim === 'theta1' ? (uiState.deltaMode ? basis.theta1 + this.uvToRange(u, uiState.xRange) : this.uvToRange(u, uiState.xRange)) : basis.theta1,
      omega1: uiState.xDim === 'omega1' ? (uiState.deltaMode ? basis.omega1 + this.uvToRange(u, uiState.xRange) : this.uvToRange(u, uiState.xRange)) : basis.omega1,
      theta2: uiState.yDim === 'theta2' ? (uiState.deltaMode ? basis.theta2 + this.uvToRange(v, uiState.yRange) : this.uvToRange(v, uiState.yRange)) : basis.theta2,
      omega2: uiState.yDim === 'omega2' ? (uiState.deltaMode ? basis.omega2 + this.uvToRange(v, uiState.yRange) : this.uvToRange(v, uiState.yRange)) : basis.omega2
    };
    hoverData.initialState = initialState;

    if (uiState.system === 'double-pendulum' || uiState.system === 'elastic-pendulum') {
      hoverData.currentState = {
        theta1: stateData[0],
        omega1: stateData[1],
        theta2: stateData[2],
        omega2: stateData[3]
      };

      hoverData.params = {
        L1: basis.L1 || 1.0,
        L2: basis.L2 || 1.0,
        m1: basis.m1 || 1.0,
        m2: basis.m2 || 1.0
      };
    }

    if (this.viewMode === 'position') {
      hoverData.positionValue = this.computePositionValue(stateData, uiState.positionMode);
    } else if (this.viewMode === 'threshold') {
      const thresholdData = this.frameManager.buildThresholdTextureData(this.frameManager.internalFrameCounter, this.resolution);
      const pixelIdx = (pixelY * this.resolution + pixelX) * 4;

      hoverData.hasCrossed = this.frameManager.thresholdCrossedData[pixelIdx / 4] === 1;
      hoverData.frameCrossed = this.frameManager.thresholdFrameCrossedData[pixelIdx / 4];
    } else if (this.viewMode === 'divergence-time') {
      const divergenceTexture = this.renderEngine.divergenceTimeReadIndex === 0
        ? this.renderEngine.divergenceTimeTextureAlt
        : this.renderEngine.divergenceTimeTexture;

      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, divergenceTexture, 0);
      const pixelData = new Float32Array(4);
      this.gl.readPixels(pixelX, pixelY, 1, 1, this.gl.RGBA, this.gl.FLOAT, pixelData);

      const divergenceFrame = pixelData[0];
      const maxDistance = pixelData[1];

      hoverData.hasDiverged = divergenceFrame > 0.0;
      hoverData.divergenceFrame = divergenceFrame;
      hoverData.maxDistance = maxDistance;
      hoverData.euclideanDistance = maxDistance;
    } else if (this.viewMode === 'accumulated') {
      const accumulatedTexture = this.renderEngine.accumulateReadIndex === 0
        ? this.renderEngine.accumulatedFtleTextureAlt
        : this.renderEngine.accumulatedFtleTexture;

      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, accumulatedTexture, 0);
      const pixelData = new Float32Array(4);
      this.gl.readPixels(pixelX, pixelY, 1, 1, this.gl.RGBA, this.gl.FLOAT, pixelData);

      hoverData.accumulated = pixelData[0];
      hoverData.frameCount = pixelData[1];
    } else if (this.viewMode === 'bob2-distance') {
      const bob2Texture = this.renderEngine.bob2DistanceReadIndex === 0
        ? this.renderEngine.bob2DistanceTexture
        : this.renderEngine.bob2DistanceTextureAlt;

      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, bob2Texture, 0);
      const pixelData = new Float32Array(4);
      this.gl.readPixels(pixelX, pixelY, 1, 1, this.gl.RGBA, this.gl.FLOAT, pixelData);

      hoverData.totalDistance = pixelData[2];
      hoverData.frameCount = this.renderEngine.bob2DistanceAccumulatedFrameCount;
    } else {
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, currentState.ftleTexture, 0);
      const pixelData = new Float32Array(4);
      this.gl.readPixels(pixelX, pixelY, 1, 1, this.gl.RGBA, this.gl.FLOAT, pixelData);

      const maxLogGrowth = pixelData[0];
      const hasValidData = pixelData[1];
      const totalTime = uiState.integrationSteps * uiState.dt;

      hoverData.ftle = hasValidData > 0 && totalTime > 0 ? maxLogGrowth / totalTime : 0;
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.deleteFramebuffer(tempFb);

    this.ui.updateHoverInfo(hoverData);
  }
  
  uvToRange(uv, range) {
    return range[0] + uv * (range[1] - range[0]);
  }
  
  computePositionValue(stateData, positionMode) {
    const theta1 = stateData[0];
    const theta2 = stateData[2];
    const omega1 = stateData[1];
    const omega2 = stateData[3];
    const L1 = 1.0, L2 = 1.0, m1 = 1.0, m2 = 1.0, g = 9.81;
    
    switch (positionMode) {
      case 0: return theta1;
      case 1: return theta2;
      case 2: return L1 * Math.sin(theta1);
      case 3: return -L1 * Math.cos(theta1);
      case 4: {
        const x1 = L1 * Math.sin(theta1);
        return x1 + L2 * Math.sin(theta2);
      }
      case 5: {
        const y1 = -L1 * Math.cos(theta1);
        return y1 - L2 * Math.cos(theta2);
      }
      case 6: return omega1;
      case 7: return omega2;
      case 8: {
        const y1 = -L1 * Math.cos(theta1);
        const y2 = y1 - L2 * Math.cos(theta2);
        const kinetic = 0.5 * m1 * L1 * L1 * omega1 * omega1 + 
                        0.5 * m2 * (L1 * L1 * omega1 * omega1 + L2 * L2 * omega2 * omega2 + 
                                   2.0 * L1 * L2 * omega1 * omega2 * Math.cos(theta1 - theta2));
        const potential = m1 * g * y1 + m2 * g * y2;
        return kinetic + potential;
      }
      default: return 0;
    }
  }
}
