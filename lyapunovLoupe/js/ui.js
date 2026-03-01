export class UI {
  constructor(canvas, container, options = {}) {
    this.canvas = canvas;
    this.container = container;
    this.options = options;
    this.callbacks = {};

    this.systemConfigs = {
      'double-pendulum': {
        state: [
          { id: 'theta1', label: 'θ₁', default: 0, unit: 'rad' },
          { id: 'omega1', label: 'ω₁', default: 0, unit: 'rad/s' },
          { id: 'theta2', label: 'θ₂', default: 0, unit: 'rad' },
          { id: 'omega2', label: 'ω₂', default: 0, unit: 'rad/s' }
        ],
        params: [
          { id: 'm1', label: 'm₁', default: 1.0, unit: 'kg' },
          { id: 'm2', label: 'm₂', default: 1.0, unit: 'kg' },
          { id: 'L1', label: 'L₁', default: 1.0, unit: 'm' },
          { id: 'L2', label: 'L₂', default: 1.0, unit: 'm' },
          { id: 'g', label: 'g', default: 9.81, unit: 'm/s²' }
        ],
        dimensions: ['theta1', 'omega1', 'theta2', 'omega2', 'm1', 'm2', 'L1', 'L2'],
        dimensionLabels: {
          theta1: 'θ₁ (Angle 1)',
          omega1: 'ω₁ (Velocity 1)',
          theta2: 'θ₂ (Angle 2)',
          omega2: 'ω₂ (Velocity 2)',
          m1: 'm₁ (Mass 1)',
          m2: 'm₂ (Mass 2)',
          L1: 'L₁ (Length 1)',
          L2: 'L₂ (Length 2)'
        },
        defaultMapping: { x: 'theta1', y: 'theta2' },
        defaultRange: { x: [-Math.PI, Math.PI], y: [-Math.PI, Math.PI] }
      },
      'elastic-pendulum': {
        state: [
          { id: 'theta1', label: 'θ₁', default: 0, unit: 'rad' },
          { id: 'omega1', label: 'ω₁', default: 0, unit: 'rad/s' },
          { id: 'theta2', label: 'θ₂', default: 0, unit: 'rad' },
          { id: 'omega2', label: 'ω₂', default: 0, unit: 'rad/s' }
        ],
        params: [
          { id: 'm1', label: 'm₁', default: 1.0, unit: 'kg' },
          { id: 'm2', label: 'm₂', default: 1.0, unit: 'kg' },
          { id: 'L1', label: 'L₁', default: 1.0, unit: 'm' },
          { id: 'k', label: 'k', default: 10.0, unit: 'N/m' },
          { id: 'L2_rest', label: 'L₂₀', default: 1.0, unit: 'm' },
          { id: 'g', label: 'g', default: 9.81, unit: 'm/s²' }
        ],
        dimensions: ['theta1', 'omega1', 'theta2', 'omega2', 'm1', 'm2', 'L1', 'k', 'L2_rest'],
        dimensionLabels: {
          theta1: 'θ₁ (Angle 1)',
          omega1: 'ω₁ (Velocity 1)',
          theta2: 'θ₂ (Angle 2)',
          omega2: 'ω₂ (Velocity 2)',
          m1: 'm₁ (Mass 1)',
          m2: 'm₂ (Mass 2)',
          L1: 'L₁ (Length 1)',
          k: 'k (Spring Const)',
          L2_rest: 'L₂₀ (Rest Length)'
        },
        defaultMapping: { x: 'theta1', y: 'theta2' },
        defaultRange: { x: [-Math.PI, Math.PI], y: [-Math.PI, Math.PI] }
      },
      'henon-heiles': {
        state: [
          { id: 'x', label: 'x', default: 0, unit: '' },
          { id: 'px', label: 'px', default: 0, unit: '' },
          { id: 'y', label: 'y', default: 0, unit: '' },
          { id: 'py', label: 'py', default: 0, unit: '' }
        ],
        params: [
          { id: 'lambda', label: 'λ', default: 1.0, unit: '' }
        ],
        dimensions: ['x', 'px', 'y', 'py', 'lambda'],
        dimensionLabels: {
          x: 'x (Position)',
          px: 'px (Momentum)',
          y: 'y (Position)',
          py: 'py (Momentum)',
          lambda: 'λ (Lambda)'
        },
        defaultMapping: { x: 'x', y: 'y' },
        defaultRange: { x: [-1, 1], y: [-1, 1] }
      },
      'duffing': {
        state: [
          { id: 'x', label: 'x', default: 0, unit: '' },
          { id: 'v', label: 'v', default: 0, unit: '' },
          { id: 't', label: 't', default: 0, unit: '' }
        ],
        params: [
          { id: 'alpha', label: 'α', default: -1.0, unit: '' },
          { id: 'beta', label: 'β', default: 1.0, unit: '' },
          { id: 'gamma', label: 'γ', default: 0.3, unit: '' },
          { id: 'delta', label: 'δ', default: 0.5, unit: '' },
          { id: 'omega', label: 'ω', default: 0.5, unit: '' }
        ],
        dimensions: ['x', 'v', 't', 'alpha', 'beta', 'gamma', 'delta', 'omega'],
        dimensionLabels: {
          x: 'x (Position)',
          v: 'v (Velocity)',
          t: 't (Time)',
          alpha: 'α (Alpha)',
          beta: 'β (Beta)',
          gamma: 'γ (Gamma)',
          delta: 'δ (Delta)',
          omega: 'ω (Omega)'
        },
        defaultMapping: { x: 'x', y: 'v' },
        defaultRange: { x: [-2, 2], y: [-2, 2] }
      }
    };

    this.state = {
      system: 'double-pendulum',
      integrator: 'verlet',
      dt: 0.002,
      integrationSteps: 1,
      iterationsBetweenSamples: 5,
      numPerturbations: 32,
      resolution: 512,
      chunkSize: 64,
      viewMode: 'instant',
      threshold: 300,
      saveAnimation: true,
      colorMode: 0,
      valueMapping: 0,
      mappingPeriod: 1.0,
      perturbationScale: 0.001,
      zoom: 1.0,
      pan: { x: 0, y: 0 },
      deltaMode: false,
      xDim: 'theta1',
      yDim: 'theta2',
      xRange: [-Math.PI, Math.PI],
      yRange: [-Math.PI, Math.PI],
      basisPoint: {},
      hover: null,
      animationPauseDuration: 1000,
      saveFrameInterval: 1,
      positionMode: 0,
      divergenceThreshold: 0.5,
      divergenceSamples: 8,
      divergencePerturbationScale: 0.001
    };

    this.initializeBasisPoint();
    this.attachEvents();
  }

  initializeBasisPoint() {
    const config = this.systemConfigs[this.state.system];
    this.state.basisPoint = {};
    [...config.state, ...config.params].forEach(p => {
      this.state.basisPoint[p.id] = p.default;
    });
  }

  attachEvents() {
    this.elements = {
      systemSelect: document.getElementById('system-select'),
      integratorSelect: document.getElementById('integrator-select'),
      basisPointContent: document.getElementById('basis-point-content'),
      xDimSelect: document.getElementById('x-dim-select'),
      yDimSelect: document.getElementById('y-dim-select'),
      xMin: document.getElementById('x-min'),
      xMax: document.getElementById('x-max'),
      yMin: document.getElementById('y-min'),
      yMax: document.getElementById('y-max'),
      deltaMode: document.getElementById('delta-mode'),
      dtInput: document.getElementById('dt-input'),
      numPertInput: document.getElementById('num-pert-input'),
      pertInput: document.getElementById('pert-input'),
      colormapSelect: document.getElementById('colormap-select'),
      valueMappingSelect: document.getElementById('value-mapping-select'),
      mappingPeriod: document.getElementById('mapping-period'),
      mappingPeriodGroup: document.getElementById('mapping-period-group'),
      download: document.getElementById('download'),
      hoverData: document.getElementById('hover-data'),
      resolutionSelect: document.getElementById('resolution-select'),
      debugPanel: document.getElementById('debug-panel'),
      chunkSizeSelect: document.getElementById('chunk-size-select'),
      viewModeSelect: document.getElementById('view-mode-select'),
      thresholdInput: document.getElementById('threshold-input'),
      frameCounter: document.getElementById('frame-counter'),
      storedFramesCounter: document.getElementById('stored-frames-counter'),
      assembleAnimationBtn: document.getElementById('assemble-animation'),
      clearFramesBtn: document.getElementById('clear-frames'),
      animPrevFrame: document.getElementById('anim-prev-frame'),
      animPlayPause: document.getElementById('anim-play-pause'),
      animNextFrame: document.getElementById('anim-next-frame'),
      animGenerateFrame: document.getElementById('anim-generate-frame'),
      animPauseDuration: document.getElementById('anim-pause-duration'),
      generateFrameGroup: document.getElementById('generate-frame-group'),
      animationFrameDisplay: document.getElementById('animation-frame-display'),
      saveFrameInterval: document.getElementById('save-frame-interval'),
      positionModeSelect: document.getElementById('position-mode-select'),
      positionModeGroup: document.getElementById('position-mode-group'),
      divergenceThresholdInput: document.getElementById('divergence-threshold-input'),
      divergenceThresholdGroup: document.getElementById('divergence-threshold-group'),
      divergenceControlsGroup: document.getElementById('divergence-controls-group'),
      divergenceSamplesInput: document.getElementById('divergence-samples-input'),
      divergencePerturbationScaleInput: document.getElementById('divergence-perturbation-scale-input')
    };

    this.attachPanelCollapse();
    this.buildBasisPointEditor();
    this.buildDimensionSelectors();

    this.elements.systemSelect.addEventListener('change', (e) => {
      this.state.system = e.target.value;
      this.initializeBasisPoint();
      this.buildBasisPointEditor();
      this.buildDimensionSelectors();
      this.trigger('systemChange', this.state.system);
    });

    this.elements.integratorSelect.addEventListener('change', (e) => {
      this.state.integrator = e.target.value;
      this.trigger('integratorChange', this.state.integrator);
    });

    this.elements.deltaMode.addEventListener('change', (e) => {
      this.state.deltaMode = e.target.checked;
      this.trigger('mappingChange', { deltaMode: this.state.deltaMode });
    });

    this.elements.xDimSelect.addEventListener('change', (e) => {
      this.state.xDim = e.target.value;
      this.trigger('mappingChange', { xDim: this.state.xDim });
    });

    this.elements.yDimSelect.addEventListener('change', (e) => {
      this.state.yDim = e.target.value;
      this.trigger('mappingChange', { yDim: this.state.yDim });
    });

    this.elements.xMin.addEventListener('change', (e) => {
      this.state.xRange[0] = parseFloat(e.target.value);
      this.trigger('mappingChange', { xRange: this.state.xRange });
    });

    this.elements.xMax.addEventListener('change', (e) => {
      this.state.xRange[1] = parseFloat(e.target.value);
      this.trigger('mappingChange', { xRange: this.state.xRange });
    });

    this.elements.yMin.addEventListener('change', (e) => {
      this.state.yRange[0] = parseFloat(e.target.value);
      this.trigger('mappingChange', { yRange: this.state.yRange });
    });

    this.elements.yMax.addEventListener('change', (e) => {
      this.state.yRange[1] = parseFloat(e.target.value);
      this.trigger('mappingChange', { yRange: this.state.yRange });
    });

    this.elements.dtInput.addEventListener('change', (e) => {
      this.state.dt = parseFloat(e.target.value);
      this.trigger('parameterChange', { dt: this.state.dt });
    });

    const iterBetweenInput = document.getElementById('iter-between-input');
    if (iterBetweenInput) {
      iterBetweenInput.addEventListener('change', (e) => {
        this.state.iterationsBetweenSamples = parseInt(e.target.value);
        this.trigger('parameterChange', { iterationsBetweenSamples: this.state.iterationsBetweenSamples });
      });
    }

    const numPertInput = document.getElementById('num-pert-input');
    if (numPertInput) {
      numPertInput.addEventListener('change', (e) => {
        this.state.numPerturbations = parseInt(e.target.value);
        this.trigger('parameterChange', { numPerturbations: this.state.numPerturbations });
      });
    }

    this.elements.pertInput.addEventListener('change', (e) => {
      this.state.perturbationScale = parseFloat(e.target.value);
      this.trigger('parameterChange', { perturbationScale: this.state.perturbationScale });
    });

    this.elements.colormapSelect.addEventListener('change', (e) => {
      this.state.colorMode = parseInt(e.target.value);
      this.trigger('colorMapChange', this.state.colorMode);
    });

    if (this.elements.valueMappingSelect) {
      this.elements.valueMappingSelect.addEventListener('change', (e) => {
        this.state.valueMapping = parseInt(e.target.value);
        this.updateMappingUI();
        this.trigger('mappingChange', { valueMapping: this.state.valueMapping });
      });
    }

    if (this.elements.mappingMin) {
      this.elements.mappingMin.addEventListener('change', (e) => {
        this.state.mappingMin = parseFloat(e.target.value);
        this.trigger('mappingChange', { mappingMin: this.state.mappingMin });
      });
    }

    if (this.elements.mappingMax) {
      this.elements.mappingMax.addEventListener('change', (e) => {
        this.state.mappingMax = parseFloat(e.target.value);
        this.trigger('mappingChange', { mappingMax: this.state.mappingMax });
      });
    }

    if (this.elements.mappingPeriod) {
      this.elements.mappingPeriod.addEventListener('change', (e) => {
        this.state.mappingPeriod = parseFloat(e.target.value);
        this.trigger('mappingChange', { mappingPeriod: this.state.mappingPeriod });
      });
    }

    this.elements.download.addEventListener('click', () => this.trigger('download'));

    this.elements.resolutionSelect.addEventListener('change', (e) => {
      this.state.resolution = parseInt(e.target.value, 10);
      this.trigger('resolutionChange', this.state.resolution);
    });

    this.elements.chunkSizeSelect.addEventListener('change', (e) => {
      this.state.chunkSize = parseInt(e.target.value, 10);
      this.trigger('chunkSizeChange', this.state.chunkSize);
    });

    this.elements.viewModeSelect.addEventListener('change', (e) => {
      this.state.viewMode = e.target.value;
      this.updateViewModeUI();
      this.trigger('viewModeChange', this.state.viewMode);
    });

    if (this.elements.positionModeSelect) {
      this.elements.positionModeSelect.addEventListener('change', (e) => {
        this.state.positionMode = parseInt(e.target.value, 10);
        this.trigger('positionModeChange', this.state.positionMode);
      });
    }

    if (this.elements.divergenceThresholdInput) {
      this.elements.divergenceThresholdInput.addEventListener('change', (e) => {
        this.state.divergenceThreshold = parseFloat(e.target.value);
        this.trigger('divergenceThresholdChange', this.state.divergenceThreshold);
      });
    }

    if (this.elements.divergenceSamplesInput) {
      this.elements.divergenceSamplesInput.addEventListener('change', (e) => {
        this.state.divergenceSamples = parseInt(e.target.value, 10) || 8;
        this.trigger('divergenceConfigChange', {
          samples: this.state.divergenceSamples,
          scale: this.state.divergencePerturbationScale
        });
      });
    }

    if (this.elements.divergencePerturbationScaleInput) {
      this.elements.divergencePerturbationScaleInput.addEventListener('change', (e) => {
        this.state.divergencePerturbationScale = parseFloat(e.target.value) || 0.001;
        this.trigger('divergenceConfigChange', {
          samples: this.state.divergenceSamples,
          scale: this.state.divergencePerturbationScale
        });
      });
    }

    this.elements.thresholdInput?.addEventListener('change', (e) => {
      this.state.threshold = parseFloat(e.target.value);
      this.trigger('thresholdChange', this.state.threshold);
    });

    this.elements.assembleAnimationBtn.addEventListener('click', () => {
      this.trigger('assembleAnimation');
    });

    this.elements.clearFramesBtn.addEventListener('click', () => {
      this.trigger('clearFrames');
      this.updateAnimationStats(0, 0);
    });

    this.elements.animPrevFrame?.addEventListener('click', () => this.trigger('prevFrame'));
    this.elements.animNextFrame?.addEventListener('click', () => this.trigger('nextFrame'));
    this.elements.animPlayPause?.addEventListener('click', () => this.trigger('toggleAnimation'));
    this.elements.animGenerateFrame?.addEventListener('click', () => this.trigger('generateFrame'));

    this.elements.animPauseDuration?.addEventListener('change', (e) => {
      this.state.animationPauseDuration = parseInt(e.target.value, 10) || 1000;
      this.trigger('pauseDurationChange', this.state.animationPauseDuration);
    });

    this.elements.saveFrameInterval?.addEventListener('change', (e) => {
      this.state.saveFrameInterval = parseInt(e.target.value, 10) || 1;
      this.trigger('saveFrameIntervalChange', this.state.saveFrameInterval);
    });

    if (this.elements.valueMappingSelect) {
      this.elements.valueMappingSelect.value = this.state.valueMapping;
    }
    if (this.elements.mappingPeriod) {
      this.elements.mappingPeriod.value = this.state.mappingPeriod;
    }
    this.updateAnimationStats();
    this.updateMappingUI();
    this.updateViewModeUI();

    const enableDebugBtn = document.getElementById('enable-debug');
    if (enableDebugBtn) {
      enableDebugBtn.addEventListener('click', () => {
        this.elements.debugPanel.style.display = 'block';
        enableDebugBtn.style.display = 'none';
      });
    }
  }

  attachPanelCollapse() {
    document.querySelectorAll('.panel-header').forEach(header => {
      header.addEventListener('click', () => {
        const panel = header.closest('.panel');
        panel.classList.toggle('collapsed');
      });
    });
  }

  buildBasisPointEditor() {
    const config = this.systemConfigs[this.state.system];
    let html = '';

    html += '<div style="font-size: 0.7rem; color: #888; margin-bottom: 0.5rem;">State Variables</div>';
    config.state.forEach(p => {
      const value = this.state.basisPoint[p.id] !== undefined ? this.state.basisPoint[p.id] : p.default;
      html += `
        <div class="basis-param">
          <label>${p.label}</label>
          <input type="number" id="basis-${p.id}" value="${value}" step="0.1">
          <span class="param-unit">${p.unit}</span>
        </div>
      `;
    });

    html += '<div style="font-size: 0.7rem; color: #888; margin: 0.5rem 0;">System Parameters</div>';
    config.params.forEach(p => {
      const value = this.state.basisPoint[p.id] !== undefined ? this.state.basisPoint[p.id] : p.default;
      html += `
        <div class="basis-param">
          <label>${p.label}</label>
          <input type="number" id="basis-${p.id}" value="${value}" step="0.1">
          <span class="param-unit">${p.unit}</span>
        </div>
      `;
    });

    this.elements.basisPointContent.innerHTML = html;

    [...config.state, ...config.params].forEach(p => {
      const input = document.getElementById(`basis-${p.id}`);
      if (input) {
        input.addEventListener('change', (e) => {
          this.state.basisPoint[p.id] = parseFloat(e.target.value);
          this.trigger('basisChange', { id: p.id, value: this.state.basisPoint[p.id] });
        });
      }
    });
  }

  buildDimensionSelectors() {
    const config = this.systemConfigs[this.state.system];

    let optionsHtml = '';
    config.dimensions.forEach(dim => {
      optionsHtml += `<option value="${dim}">${config.dimensionLabels[dim]}</option>`;
    });

    this.elements.xDimSelect.innerHTML = optionsHtml;
    this.elements.yDimSelect.innerHTML = optionsHtml;

    this.state.xDim = config.defaultMapping.x;
    this.state.yDim = config.defaultMapping.y;
    this.state.xRange = [...config.defaultRange.x];
    this.state.yRange = [...config.defaultRange.y];

    this.elements.xDimSelect.value = this.state.xDim;
    this.elements.yDimSelect.value = this.state.yDim;
    this.elements.xMin.value = this.state.xRange[0];
    this.elements.xMax.value = this.state.xRange[1];
    this.elements.yMin.value = this.state.yRange[0];
    this.elements.yMax.value = this.state.yRange[1];
  }

  attachZoomPanControls() {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.trigger('viewChange', { zoom: this.state.zoom });
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        this.trigger('viewChange', { pan: this.state.pan });
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
      }
    });
  }

  updateMappingUI() {
    if (this.elements.mappingPeriodGroup) {
      this.elements.mappingPeriodGroup.style.display = this.state.valueMapping === 2 ? 'block' : 'none';
    }
  }

  updateViewModeUI() {
    const isPositionMode = this.state.viewMode === 'position';
    const isDivergenceTimeMode = this.state.viewMode === 'divergence-time';

    if (this.elements.positionModeGroup) {
      this.elements.positionModeGroup.style.display = isPositionMode ? 'block' : 'none';
    }
    if (this.elements.divergenceControlsGroup) {
      this.elements.divergenceControlsGroup.style.display = isDivergenceTimeMode ? 'block' : 'none';
    }
  }

  updateHoverInfo(data) {
    if (!data) {
      this.elements.hoverData.textContent = 'Hover over the map to see details';
      this.clearPendulumVisualization();
      return;
    }

    let html = '';

    if (data.viewMode === 'threshold') {
      if (data.hasCrossed !== undefined) {
        if (data.hasCrossed) {
          html += `<div>Frame crossed: ${data.frameCrossed}</div>`;
        } else {
          html += `<div>Not crossed yet</div>`;
        }
        if (data.euclideanDistance !== undefined) {
          html += `<div>Euclidean dist: ${data.euclideanDistance.toFixed(4)}</div>`;
        }
      }
    } else if (data.viewMode === 'accumulated') {
      const avg = data.frameCount > 0 ? data.accumulated / data.frameCount : 0;
      html += `<div>Total: ${data.accumulated.toFixed(4)}</div><div>Avg: ${avg.toFixed(4)} (${data.frameCount} frames)</div>`;
    } else if (data.viewMode === 'bob2-distance') {
      html += `<div>Total Distance: ${data.totalDistance?.toFixed(4) || 'N/A'}</div><div>Frames: ${data.frameCount || 0}</div>`;
    } else if (data.viewMode === 'position') {
      const modeLabels = [
        'Angle 1 (θ₁)', 'Angle 2 (θ₂)',
        'Bob 1 X', 'Bob 1 Y',
        'Bob 2 X', 'Bob 2 Y',
        'Velocity 1 (ω₁)', 'Velocity 2 (ω₂)',
        'Total Energy'
      ];
      html += `<div>Mode: ${modeLabels[data.positionMode || 0]}</div>`;
      if (data.positionValue !== undefined) {
        html += `<div>Value: ${data.positionValue.toFixed(4)}</div>`;
      }
    } else if (data.viewMode === 'divergence-time') {
      if (data.hasDiverged) {
        html += `<div>Diverged at frame: ${data.divergenceFrame}</div>`;
      } else {
        html += `<div>Not yet diverged</div>`;
      }
      if (data.maxDistance !== undefined) {
        html += `<div>Max distance: ${data.maxDistance.toFixed(6)}</div>`;
      }
      html += `<div>Threshold: ${data.divergenceThreshold}</div>`;
    } else {
      html += `
        <div>FTLE: ${data.ftle.toFixed(6)}</div>
        <div>State: (${data.state.map(v => v.toFixed(4)).join(', ')})</div>
      `;
    }

    this.elements.hoverData.innerHTML = html;

    if (data.initialState && data.currentState && data.params) {
      this.updatePendulumVisualization(data.initialState, data.currentState, data.params);
    }
  }

  setMode(mode) {
    this.elements.modeIndicator.textContent = mode;
  }

  on(event, callback) {
    if (!this.callbacks[event]) {
      this.callbacks[event] = [];
    }
    this.callbacks[event].push(callback);
  }

  trigger(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(cb => cb(data));
    }
  }

  getState() {
    return {
      ...this.state,
      basisPoint: { ...this.state.basisPoint },
      pan: { ...this.state.pan },
      xRange: [...this.state.xRange],
      yRange: [...this.state.yRange]
    };
  }

  updateIterationProgress(percent, current, total) {
    const fillEl = document.getElementById('iteration-progress-fill');
    const textEl = document.getElementById('iteration-progress-text');
    const panelEl = document.getElementById('progress-panel');

    if (panelEl) panelEl.style.display = 'block';
    if (fillEl) fillEl.style.width = `${percent}%`;
    if (textEl) textEl.textContent = `${Math.round(percent)}% (${current.toLocaleString()}/${total.toLocaleString()})`;
  }

  updateTileProgress(percent, current, total) {
    const fillEl = document.getElementById('tile-progress-fill');
    const textEl = document.getElementById('tile-progress-text');

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (textEl) textEl.textContent = `${Math.round(percent)}% (${current}/${total})`;
  }

  updateSampleCount(count) {
    const textEl = document.getElementById('sample-count-text');
    if (textEl) textEl.textContent = count.toLocaleString();
  }

  hideProgress() {
    const panelEl = document.getElementById('progress-panel');
    if (panelEl) panelEl.style.display = 'none';

    const iterFill = document.getElementById('iteration-progress-fill');
    const tileFill = document.getElementById('tile-progress-fill');
    if (iterFill) iterFill.style.width = '0%';
    if (tileFill) tileFill.style.width = '0%';
  }

  updateAnimationStats(currentFrame = 0, totalFrames = 0, storedCount = 0) {
    if (this.elements.frameCounter) {
      this.elements.frameCounter.textContent = `${currentFrame} / ${totalFrames}`;
    }
    if (this.elements.storedFramesCounter) {
      this.elements.storedFramesCounter.textContent = `${storedCount}`;
    }
  }

  setGenerateFrameEnabled(enabled) {
    if (this.elements.animGenerateFrame) {
      this.elements.animGenerateFrame.disabled = !enabled;
    }
    if (this.elements.generateFrameGroup) {
      this.elements.generateFrameGroup.style.opacity = enabled ? '1' : '0.5';
    }
  }

  initializePendulumCanvases() {
    this.pendulumElements = {
      initialCanvas: document.getElementById('pendulum-initial-canvas'),
      currentCanvas: document.getElementById('pendulum-current-canvas')
    };
    
    this.pendulumAnimation = {
      timer: null,
      animationId: null,
      initialState: null,
      currentState: null,
      params: null,
      initialPath: [],
      currentPath: [],
      maxPathLength: 500
    };
  }

  drawPendulum(ctx, width, height, state, params, colors, path = null, clearCanvas = true) {
    if (clearCanvas) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, width, height);
    }

    if (!state || !params) return;

    const { L1 = 1.0, L2 = 1.0, m1 = 1.0, m2 = 1.0 } = params;
    const { theta1 = 0, theta2 = 0 } = state;

    const maxReach = L1 + L2;
    const scale = (Math.min(width, height) * 0.4) / maxReach;
    const cx = width / 2;
    const cy = height / 2;

    const x1 = cx + scale * L1 * Math.sin(theta1);
    const y1 = cy + scale * L1 * Math.cos(theta1);
    const x2 = x1 + scale * L2 * Math.sin(theta2);
    const y2 = y1 + scale * L2 * Math.cos(theta2);

    if (path) {
      path.push({ x2, y2 });
      if (path.length > this.pendulumAnimation.maxPathLength) {
        path.shift();
      }

      ctx.strokeStyle = colors.path || 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < path.length; i++) {
        if (i === 0) {
          ctx.moveTo(path[i].x2, path[i].y2);
        } else {
          ctx.lineTo(path[i].x2, path[i].y2);
        }
      }
      ctx.stroke();
    }

    ctx.strokeStyle = colors.rod || 'rgba(100, 200, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const r1 = Math.max(4, Math.sqrt(m1) * 8);
    const r2 = Math.max(4, Math.sqrt(m2) * 8);

    ctx.fillStyle = colors.bob1 || 'rgba(100, 200, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x1, y1, r1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = colors.bob2 || 'rgba(150, 220, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(x2, y2, r2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  updatePendulumVisualization(initialState, currentState, params) {
    if (!this.pendulumElements) {
      this.initializePendulumCanvases();
    }

    this.pendulumAnimation.initialState = initialState ? { ...initialState } : null;
    this.pendulumAnimation.currentState = currentState ? { ...currentState } : null;
    this.pendulumAnimation.params = params ? { ...params } : null;

    this.drawStaticPendulums();

    if (this.pendulumAnimation.timer) {
      clearTimeout(this.pendulumAnimation.timer);
    }
    this.stopPendulumAnimation();

    this.pendulumAnimation.timer = setTimeout(() => {
      this.startPendulumAnimation();
    }, 500);
  }

  drawStaticPendulums() {
    if (!this.pendulumElements) return;

    const { initialCanvas, currentCanvas } = this.pendulumElements;
    const { initialState, currentState, params } = this.pendulumAnimation;

    this.pendulumAnimation.initialPath = [];
    this.pendulumAnimation.currentPath = [];

    if (initialCanvas && initialState) {
      const ctx = initialCanvas.getContext('2d');
      this.drawPendulum(ctx, initialCanvas.width, initialCanvas.height, initialState, params, {
        rod: 'rgba(100, 255, 150, 0.8)',
        bob1: 'rgba(100, 255, 150, 0.9)',
        bob2: 'rgba(150, 255, 180, 0.9)'
      });
    }

    if (currentCanvas && currentState) {
      const ctx = currentCanvas.getContext('2d');
      this.drawPendulum(ctx, currentCanvas.width, currentCanvas.height, currentState, params, {
        rod: 'rgba(100, 180, 255, 0.8)',
        bob1: 'rgba(100, 180, 255, 0.9)',
        bob2: 'rgba(150, 200, 255, 0.9)'
      });
    }
  }

  startPendulumAnimation() {
    if (!this.pendulumElements || !this.pendulumAnimation.initialState || !this.pendulumAnimation.currentState) {
      return;
    }

    const dt = 0.016;
    const g = 9.81;
    const { L1 = 1.0, L2 = 1.0, m1 = 1.0, m2 = 1.0 } = this.pendulumAnimation.params || {};

    let state1 = { ...this.pendulumAnimation.initialState };
    let state2 = { ...this.pendulumAnimation.currentState };

    this.pendulumAnimation.initialPath = [];
    this.pendulumAnimation.currentPath = [];

    const animate = () => {
      state1 = this.stepPendulum(state1, dt, g, L1, L2, m1, m2);
      state2 = this.stepPendulum(state2, dt, g, L1, L2, m1, m2);

      const { initialCanvas, currentCanvas } = this.pendulumElements;
      
      if (initialCanvas) {
        const ctx = initialCanvas.getContext('2d');
        this.drawPendulum(ctx, initialCanvas.width, initialCanvas.height, state1, this.pendulumAnimation.params, {
          rod: 'rgba(100, 255, 150, 0.8)',
          bob1: 'rgba(100, 255, 150, 0.9)',
          bob2: 'rgba(150, 255, 180, 0.9)',
          path: 'rgba(100, 255, 150, 0.15)'
        }, this.pendulumAnimation.initialPath);
      }

      if (currentCanvas) {
        const ctx = currentCanvas.getContext('2d');
        this.drawPendulum(ctx, currentCanvas.width, currentCanvas.height, state2, this.pendulumAnimation.params, {
          rod: 'rgba(100, 180, 255, 0.8)',
          bob1: 'rgba(100, 180, 255, 0.9)',
          bob2: 'rgba(150, 200, 255, 0.9)',
          path: 'rgba(100, 180, 255, 0.15)'
        }, this.pendulumAnimation.currentPath);
      }

      this.pendulumAnimation.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  stepPendulum(state, dt, g, L1, L2, m1, m2) {
    const halfDt = 0.5 * dt;
    let { theta1, theta2, omega1, omega2 } = state;

    const computeAcc = (t1, t2, w1, w2) => {
      const delta = t1 - t2;
      const sinDelta = Math.sin(delta);
      const cosDelta = Math.cos(delta);
      const alphaDenom = m1 + m2 * sinDelta * sinDelta;

      const num1 = -m2 * L1 * w1 * w1 * sinDelta * cosDelta
                 - m2 * L2 * w2 * w2 * sinDelta
                 - (m1 + m2) * g * Math.sin(t1)
                 + m2 * g * Math.sin(t2) * cosDelta;

      const num2 = (m1 + m2) * L1 * w1 * w1 * sinDelta
                 + m2 * L2 * w2 * w2 * sinDelta * cosDelta
                 + (m1 + m2) * g * Math.sin(t1) * cosDelta
                 - (m1 + m2) * g * Math.sin(t2);

      return {
        alpha1: num1 / (L1 * alphaDenom),
        alpha2: num2 / (L2 * alphaDenom)
      };
    };

    const acc1 = computeAcc(theta1, theta2, omega1, omega2);

    const omega1Half = omega1 + halfDt * acc1.alpha1;
    const omega2Half = omega2 + halfDt * acc1.alpha2;

    theta1 = theta1 + dt * omega1Half;
    theta2 = theta2 + dt * omega2Half;
    theta1 = theta1 - 2 * Math.PI * Math.floor(theta1 / (2 * Math.PI) + 0.5);
    theta2 = theta2 - 2 * Math.PI * Math.floor(theta2 / (2 * Math.PI) + 0.5);

    omega1 = omega1Half;
    omega2 = omega2Half;

    const acc2 = computeAcc(theta1, theta2, omega1, omega2);

    omega1 = omega1 + halfDt * acc2.alpha1;
    omega2 = omega2 + halfDt * acc2.alpha2;

    return { theta1, theta2, omega1, omega2 };
  }

  stopPendulumAnimation() {
    if (this.pendulumAnimation?.animationId) {
      cancelAnimationFrame(this.pendulumAnimation.animationId);
      this.pendulumAnimation.animationId = null;
    }
  }

  clearPendulumVisualization() {
    this.stopPendulumAnimation();
    if (this.pendulumAnimation?.timer) {
      clearTimeout(this.pendulumAnimation.timer);
      this.pendulumAnimation.timer = null;
    }

    if (!this.pendulumElements) return;

    const { initialCanvas, currentCanvas } = this.pendulumElements;
    
    if (initialCanvas) {
      const ctx = initialCanvas.getContext('2d');
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, initialCanvas.width, initialCanvas.height);
    }
    
    if (currentCanvas) {
      const ctx = currentCanvas.getContext('2d');
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, currentCanvas.width, currentCanvas.height);
    }
  }
}
