export class DebugVisualizer {
  constructor(renderer, ui) {
    this.renderer = renderer;
    this.ui = ui;
    this.isVisible = false;
    this.isRunning = false;
    this.animationId = null;

    this.pin = {
      element: document.getElementById('debug-pin'),
      isVisible: false,
      isDragging: false,
      dragOffset: { x: 0, y: 0 },
      uvX: 0.5,
      uvY: 0.5
    };

    this.elements = {
      panel: document.getElementById('debug-panel'),
      visualization: document.getElementById('debug-visualization'),
      perturbation: document.getElementById('debug-perturbation'),
      totalSamples: document.getElementById('debug-total-samples'),
      iterPerSample: document.getElementById('debug-iter-per-sample'),
      iterBetween: document.getElementById('debug-iter-between'),
      integrator: document.getElementById('debug-integrator'),
      dt: document.getElementById('debug-dt'),
      runButton: document.getElementById('debug-run'),
      toggleButton: document.getElementById('debug-toggle'),
      pendulumPreview: document.getElementById('pendulum-preview'),
      pendulumState: document.getElementById('pendulum-state'),
      orbitPlot: document.getElementById('orbit-plot'),
      ftleMatrix: document.getElementById('ftle-matrix'),
      matrixIndicator: document.getElementById('matrix-indicator'),
      ftleLegend: document.getElementById('ftle-legend')
    };

    this.canvases = {
      pendulum: this.elements.pendulumPreview.getContext('2d'),
      orbit: this.elements.orbitPlot.getContext('2d'),
      matrix: this.elements.ftleMatrix.getContext('2d')
    };

    this.ftleData = null;
    this.orbitHistory = [];
    this.currentSampleIndex = 0;
    this.perturbationDefinitions = this.createPerturbationDefinitions();

    this.attachEventListeners();
    this.renderFtleMatrixEmpty();
  }

  createPerturbationDefinitions() {
    return [
      { id: 'theta1+', name: '+θ₁', dim: 0, sign: 1 },
      { id: 'theta1-', name: '-θ₁', dim: 0, sign: -1 },
      { id: 'omega1+', name: '+ω₁', dim: 1, sign: 1 },
      { id: 'omega1-', name: '-ω₁', dim: 1, sign: -1 },
      { id: 'theta2+', name: '+θ₂', dim: 2, sign: 1 },
      { id: 'theta2-', name: '-θ₂', dim: 2, sign: -1 },
      { id: 'omega2+', name: '+ω₂', dim: 3, sign: 1 },
      { id: 'omega2-', name: '-ω₂', dim: 3, sign: -1 },
      { id: 'm1+', name: '+m₁', dim: 4, sign: 1 },
      { id: 'm1-', name: '-m₁', dim: 4, sign: -1 },
      { id: 'm2+', name: '+m₂', dim: 5, sign: 1 },
      { id: 'm2-', name: '-m₂', dim: 5, sign: -1 },
      { id: 'L1+', name: '+L₁', dim: 6, sign: 1 },
      { id: 'L1-', name: '-L₁', dim: 6, sign: -1 },
      { id: 'L2+', name: '+L₂', dim: 7, sign: 1 },
      { id: 'L2-', name: '-L₂', dim: 7, sign: -1 }
    ];
  }

  attachEventListeners() {
    this.elements.toggleButton.addEventListener('click', () => this.toggleVisibility());
    this.elements.runButton.addEventListener('click', () => this.runDebugSimulation());

    this.renderer.canvas.addEventListener('click', (e) => this.handleMainMapClick(e));

    this.pin.element.addEventListener('mousedown', (e) => this.handlePinDragStart(e));
    window.addEventListener('mousemove', (e) => this.handlePinDrag(e));
    window.addEventListener('mouseup', (e) => this.handlePinDragEnd(e));

    this.elements.ftleMatrix.addEventListener('mousemove', (e) => this.handleMatrixHover(e));
  }

  toggleVisibility() {
    this.isVisible = !this.isVisible;
    this.elements.visualization.style.display = this.isVisible ? 'flex' : 'none';
    this.elements.toggleButton.textContent = this.isVisible ? 'Hide Debug View' : 'Toggle Debug View';

    this.pin.element.style.display = this.isVisible ? 'block' : 'none';

    if (this.isVisible) {
      if (!this.pin.isVisible) {
        this.placePinAt(0.5, 0.5);
      }
      this.updatePendulumPreview();
    }
  }

  handleMainMapClick(event) {
    if (this.pin.isDragging) return;

    const rect = this.renderer.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const uvX = x / rect.width;
    const uvY = 1.0 - y / rect.height;

    this.placePinAt(uvX, uvY);

    if (this.isVisible) {
      this.updatePendulumPreview();
    }
  }

  placePinAt(uvX, uvY) {
    this.pin.uvX = uvX;
    this.pin.uvY = uvY;
    this.pin.isVisible = true;

    const rect = this.renderer.canvas.getBoundingClientRect();
    const pixelX = uvX * rect.width;
    const pixelY = (1.0 - uvY) * rect.height;

    this.pin.element.style.left = `${pixelX}px`;
    this.pin.element.style.top = `${pixelY}px`;
    this.pin.element.style.display = 'block';

    console.log('Pin placed at UV:', uvX.toFixed(4), uvY.toFixed(4), 'Pixel:', pixelX.toFixed(0), pixelY.toFixed(0));
  }

  handlePinDragStart(event) {
    if (!this.isVisible) return;
    event.preventDefault();
    event.stopPropagation();

    this.pin.isDragging = true;
    this.pin.element.classList.add('dragging');

    const rect = this.pin.element.getBoundingClientRect();
    this.pin.dragOffset = {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top
    };

    console.log('Pin drag started');
  }

  handlePinDrag(event) {
    if (!this.pin.isDragging) return;

    const rect = this.renderer.canvas.getBoundingClientRect();
    let newX = event.clientX - rect.left - this.pin.dragOffset.x;
    let newY = event.clientY - rect.top - this.pin.dragOffset.y;

    newX = Math.max(0, Math.min(rect.width, newX));
    newY = Math.max(0, Math.min(rect.height, newY));

    this.pin.element.style.left = `${newX}px`;
    this.pin.element.style.top = `${newY}px`;

    this.pin.uvX = newX / rect.width;
    this.pin.uvY = 1.0 - newY / rect.height;

    if (this.isVisible) {
      this.updatePendulumPreview();
    }
  }

  handlePinDragEnd(event) {
    if (!this.pin.isDragging) return;

    this.pin.isDragging = false;
    this.pin.element.classList.remove('dragging');

    console.log('Pin dragged to:', this.pin.uvX.toFixed(4), this.pin.uvY.toFixed(4));
  }

  handleMatrixHover(event) {
    const rect = this.elements.ftleMatrix.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const col = Math.floor(x / (rect.width / this.elements.totalSamples.value));

    if (this.orbitHistory && this.orbitHistory[col]) {
      const state = this.orbitHistory[col];
      this.updatePendulumPreviewFromState(state);
    }
  }

  getInitialStateFromTexture() {
    if (!this.pin.isVisible) return null;

    const state = this.ui.getState();
    const xDim = state.xDim;
    const yDim = state.yDim;
    const xRange = state.xRange;
    const yRange = state.yRange;
    const basis = state.basisPoint;

    const u = this.pin.uvX;
    const v = this.pin.uvY;

    const xVal = xRange[0] + u * (xRange[1] - xRange[0]);
    const yVal = yRange[0] + v * (yRange[1] - yRange[0]);

    let theta1, omega1, theta2, omega2;

    if (state.system === 'double-pendulum' || state.system === 'elastic-pendulum') {
      theta1 = state.deltaMode ? basis.theta1 + xVal : xVal;
      omega1 = basis.omega1;
      theta2 = state.deltaMode ? basis.theta2 + yVal : yVal;
      omega2 = basis.omega2;

      if (xDim === 'omega1') omega1 = state.deltaMode ? basis.omega1 + xVal : xVal;
      else if (xDim === 'omega2') omega2 = state.deltaMode ? basis.omega2 + xVal : xVal;

      if (yDim === 'omega1') omega1 = state.deltaMode ? basis.omega1 + yVal : yVal;
      else if (yDim === 'omega2') omega2 = state.deltaMode ? basis.omega2 + yVal : yVal;
    } else {
      theta1 = xVal;
      omega1 = 0;
      theta2 = yVal;
      omega2 = 0;
    }

    return {
      theta1,
      omega1,
      theta2,
      omega2,
      m1: basis.m1 || 1.0,
      m2: basis.m2 || 1.0,
      L1: basis.L1 || 1.0,
      L2: basis.L2 || 1.0,
      g: basis.g || 9.81
    };
  }

  async runDebugSimulation() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.elements.runButton.disabled = true;
    this.elements.runButton.textContent = 'Running...';

    const initialState = this.getInitialStateFromTexture();
    if (!initialState) {
      console.warn('No pin placed. Click on the map to place a pin first.');
      alert('Please click on the chaos map to place a pin, then click "Run Debug Simulation".');
      this.isRunning = false;
      this.elements.runButton.disabled = false;
      this.elements.runButton.textContent = 'Run Debug Simulation';
      return;
    }

    const perturbationScale = parseFloat(this.elements.perturbation.value);
    const totalSamples = parseInt(this.elements.totalSamples.value);
    const iterPerSample = parseInt(this.elements.iterPerSample.value);
    const iterBetween = parseInt(this.elements.iterBetween.value);
    const dt = parseFloat(this.elements.dt.value);
    const integrator = this.elements.integrator.value;

    this.ftleData = [];
    this.orbitHistory = [];
    this.currentSampleIndex = 0;

    for (let s = 0; s < totalSamples; s++) {
      const sampleTime = s * (iterBetween + iterPerSample) * dt;
      const sampleData = await this.computeFtleAtTime(
        initialState,
        sampleTime,
        perturbationScale,
        iterPerSample,
        dt,
        integrator
      );

      this.ftleData.push(sampleData);
      this.orbitHistory.push({ ...initialState, time: sampleTime });
      this.currentSampleIndex = s;

      this.updateFtleMatrix();
      this.updateOrbitPlot();
      this.updateMatrixIndicator();

      await new Promise(r => requestAnimationFrame(r));
    }

    this.isRunning = false;
    this.elements.runButton.disabled = false;
    this.elements.runButton.textContent = 'Run Debug Simulation';
    console.log('Debug simulation complete');
  }

  async computeFtleAtTime(state, targetTime, perturbationScale, numIterations, dt, integrator) {
    const perturbations = this.perturbationDefinitions.map(p => ({
      ...p,
      ftleValues: []
    }));

    for (const perturbation of perturbations) {
      const perturbedState = this.applyPerturbation(state, perturbation, perturbationScale);

      const trajectory = this.integrateTrajectory(
        state,
        perturbedState,
        targetTime,
        dt,
        integrator
      );

      perturbation.ftleValues = trajectory.ftleHistory;
    }

    return {
      time: targetTime,
      perturbations
    };
  }

  applyPerturbation(state, perturbationDef, scale) {
    const perturbedState = { ...state };
    const { dim, sign } = perturbationDef;

    switch (dim) {
      case 0: perturbedState.theta1 += sign * scale; break;
      case 1: perturbedState.omega1 += sign * scale; break;
      case 2: perturbedState.theta2 += sign * scale; break;
      case 3: perturbedState.omega2 += sign * scale; break;
      case 4: perturbedState.m1 = Math.max(0.1, perturbedState.m1 + sign * scale); break;
      case 5: perturbedState.m2 = Math.max(0.1, perturbedState.m2 + sign * scale); break;
      case 6: perturbedState.L1 = Math.max(0.1, perturbedState.L1 + sign * scale); break;
      case 7: perturbedState.L2 = Math.max(0.1, perturbedState.L2 + sign * scale); break;
    }

    return perturbedState;
  }

  integrateTrajectory(nominalState, perturbedState, targetTime, dt, integrator) {
    const nominalTrajectory = [this.stateToVector(nominalState)];
    const perturbedTrajectory = [this.stateToVector(perturbedState)];
    const ftleHistory = [];

    const initialDist = this.stateDistance(nominalState, perturbedState);

    let currentNominal = { ...nominalState };
    let currentPerturbed = { ...perturbedState };
    let currentTime = 0;

    while (currentTime < targetTime) {
      const steps = Math.min(Math.ceil((targetTime - currentTime) / dt), 1000);

      for (let i = 0; i < steps && currentTime < targetTime; i++) {
        if (integrator === 'rk4') {
          currentNominal = this.rk4Step(currentNominal, dt);
          currentPerturbed = this.rk4Step(currentPerturbed, dt);
        } else {
          currentNominal = this.verletStep(currentNominal, dt);
          currentPerturbed = this.verletStep(currentPerturbed, dt);
        }

        currentTime += dt;

        nominalTrajectory.push(this.stateToVector(currentNominal));
        perturbedTrajectory.push(this.stateToVector(currentPerturbed));

        const currentDist = this.stateDistance(currentNominal, currentPerturbed);
        const ftle = Math.log(Math.max(currentDist / initialDist, 1e-10)) / currentTime;
        ftleHistory.push(ftle);
      }
    }

    return {
      nominalTrajectory,
      perturbedTrajectory,
      ftleHistory
    };
  }

  stateToVector(state) {
    return [state.theta1, state.omega1, state.theta2, state.omega2];
  }

  stateDistance(s1, s2) {
    const dTheta1 = this.circularDiff(s1.theta1, s2.theta1);
    const dOmega1 = s1.omega1 - s2.omega1;
    const dTheta2 = this.circularDiff(s1.theta2, s2.theta2);
    const dOmega2 = s1.omega2 - s2.omega2;

    return Math.sqrt(dTheta1 * dTheta1 + dOmega1 * dOmega1 + dTheta2 * dTheta2 + dOmega2 * dOmega2);
  }

  circularDiff(a, b) {
    let d = a - b;
    d = d - 2 * Math.PI * Math.floor(d / (2 * Math.PI) + 0.5);
    return d;
  }

  rk4Step(state, dt) {
    const k1 = this.doublePendulumDerivs(state);
    const s2 = this.stateAdd(state, this.stateScale(k1, 0.5 * dt));
    const k2 = this.doublePendulumDerivs(s2);
    const s3 = this.stateAdd(state, this.stateScale(k2, 0.5 * dt));
    const k3 = this.doublePendulumDerivs(s3);
    const s4 = this.stateAdd(state, this.stateScale(k3, dt));
    const k4 = this.doublePendulumDerivs(s4);

    const k = this.stateScale(this.stateAdd(this.stateAdd(k1, this.stateScale(k2, 2)), this.stateAdd(this.stateScale(k3, 2), k4)), dt / 6);
    const result = this.stateAdd(state, k);
    result.theta1 = this.normalizeAngle(result.theta1);
    result.theta2 = this.normalizeAngle(result.theta2);
    return result;
  }

  verletStep(state, dt) {
    const deriv = this.doublePendulumDerivs(state);
    const vHalf = {
      omega1: state.omega1 + 0.5 * dt * deriv.domega1,
      omega2: state.omega2 + 0.5 * dt * deriv.domega2
    };
    const qNext = {
      theta1: this.normalizeAngle(state.theta1 + dt * vHalf.omega1),
      theta2: this.normalizeAngle(state.theta2 + dt * vHalf.omega2)
    };
    const stateTemp = { ...state, theta1: qNext.theta1, theta2: qNext.theta2, omega1: vHalf.omega1, omega2: vHalf.omega2 };
    const derivNext = this.doublePendulumDerivs(stateTemp);
    const vNext = {
      omega1: vHalf.omega1 + 0.5 * dt * derivNext.domega1,
      omega2: vHalf.omega2 + 0.5 * dt * derivNext.domega2
    };

    return {
      ...state,
      theta1: qNext.theta1,
      theta2: qNext.theta2,
      omega1: vNext.omega1,
      omega2: vNext.omega2
    };
  }

  normalizeAngle(a) {
    return a - 2 * Math.PI * Math.floor(a / (2 * Math.PI) + 0.5);
  }

  doublePendulumDerivs(state) {
    const { theta1, omega1, theta2, omega2, m1, m2, L1, L2, g } = state;
    const delta = theta1 - theta2;
    const sinDelta = Math.sin(delta);
    const cosDelta = Math.cos(delta);

    const alphaDenom = m1 + m2 * sinDelta * sinDelta;

    const num1 = -m2 * L1 * omega1 * omega1 * sinDelta * cosDelta
               - m2 * L2 * omega2 * omega2 * sinDelta
               - (m1 + m2) * g * Math.sin(theta1)
               + m2 * g * Math.sin(theta2) * cosDelta;

    const num2 = (m1 + m2) * L1 * omega1 * omega1 * sinDelta
               + m2 * L2 * omega2 * omega2 * sinDelta * cosDelta
               + (m1 + m2) * g * Math.sin(theta1) * cosDelta
               - (m1 + m2) * g * Math.sin(theta2);

    const domega1 = num1 / (L1 * alphaDenom);
    const domega2 = num2 / (L2 * alphaDenom);

    return { domega1, domega2 };
  }

  stateAdd(s1, s2) {
    if (s1.domega1 !== undefined) {
      return { domega1: s1.domega1 + s2.domega1, domega2: s1.domega2 + s2.domega2 };
    }
    return {
      theta1: s1.theta1 + s2.theta1,
      omega1: s1.omega1 + s2.omega1,
      theta2: s1.theta2 + s2.theta2,
      omega2: s1.omega2 + s2.omega2
    };
  }

  stateScale(s, scale) {
    if (s.domega1 !== undefined) {
      return { domega1: s.domega1 * scale, domega2: s.domega2 * scale };
    }
    return {
      theta1: s.theta1 * scale,
      omega1: s.omega1 * scale,
      theta2: s.theta2 * scale,
      omega2: s.omega2 * scale
    };
  }

  updatePendulumPreview() {
    const state = this.getInitialStateFromTexture();
    if (!state) {
      const ctx = this.canvases.pendulum;
      const canvas = this.elements.pendulumPreview;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Click on map to place pin', canvas.width / 2, canvas.height / 2);

      this.elements.pendulumState.innerHTML = '<em>Click on chaos map to place pin</em>';
      return;
    }

    this.updatePendulumPreviewFromState(state);
  }

  updatePendulumPreviewFromState(state) {
    const ctx = this.canvases.pendulum;
    const canvas = this.elements.pendulumPreview;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 3;
    const scale = Math.min(canvas.width, canvas.height) / (2.5 * (state.L1 + state.L2));

    const x1 = centerX + state.L1 * scale * Math.sin(state.theta1);
    const y1 = centerY + state.L1 * scale * Math.cos(state.theta1);

    const x2 = x1 + state.L2 * scale * Math.sin(state.theta2);
    const y2 = y1 + state.L2 * scale * Math.cos(state.theta2);

    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 3, 0, 2 * Math.PI);
    ctx.stroke();

    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.fillStyle = '#4a9eff';
    ctx.beginPath();
    ctx.arc(x1, y1, 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(x2, y2, 5, 0, 2 * Math.PI);
    ctx.fill();

    this.elements.pendulumState.innerHTML = `
      θ₁: ${state.theta1.toFixed(3)} rad<br>
      ω₁: ${state.omega1.toFixed(3)} rad/s<br>
      θ₂: ${state.theta2.toFixed(3)} rad<br>
      ω₂: ${state.omega2.toFixed(3)} rad/s<br>
      m₁: ${state.m1.toFixed(2)} kg<br>
      m₂: ${state.m2.toFixed(2)} kg<br>
      L₁: ${state.L1.toFixed(2)} m<br>
      L₂: ${state.L2.toFixed(2)} m
    `;
  }

  updateOrbitPlot() {
    const ctx = this.canvases.orbit;
    const canvas = this.elements.orbitPlot;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.orbitHistory.length === 0) return;

    const scaleX = canvas.width / (2 * Math.PI);
    const scaleY = canvas.height / (2 * Math.PI);
    const offsetX = canvas.width / 2;
    const offsetY = canvas.height / 2;

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();

    for (let i = 0; i < this.orbitHistory.length; i++) {
      const state = this.orbitHistory[i];
      const x = offsetX + state.theta1 * scaleX;
      const y = offsetY + state.theta2 * scaleY;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(
      offsetX + this.orbitHistory[this.currentSampleIndex].theta1 * scaleX,
      offsetY + this.orbitHistory[this.currentSampleIndex].theta2 * scaleY,
      4, 0, 2 * Math.PI
    );
    ctx.stroke();
  }

  updateFtleMatrix() {
    if (!this.ftleData || this.ftleData.length === 0) {
      this.renderFtleMatrixEmpty();
      return;
    }

    const ctx = this.canvases.matrix;
    const canvas = this.elements.ftleMatrix;

    const numPerturbations = this.perturbationDefinitions.length;
    const numSamples = this.ftleData.length;

    const cellWidth = canvas.width / numSamples;
    const cellHeight = canvas.height / numPerturbations;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let minFtle = Infinity;
    let maxFtle = -Infinity;

    for (const sample of this.ftleData) {
      for (const pert of sample.perturbations) {
        for (const ftle of pert.ftleValues) {
          if (isFinite(ftle)) {
            minFtle = Math.min(minFtle, ftle);
            maxFtle = Math.max(maxFtle, ftle);
          }
        }
      }
    }

    if (!isFinite(minFtle)) {
      minFtle = -2.0;
      maxFtle = 2.0;
    }

    for (let s = 0; s < numSamples; s++) {
      const sample = this.ftleData[s];
      const ftle = sample.perturbations.reduce((sum, p) => {
        const avgFtle = p.ftleValues.length > 0
          ? p.ftleValues.reduce((a, b) => a + b, 0) / p.ftleValues.length
          : 0;
        return sum + avgFtle;
      }, 0) / sample.perturbations.length;

      const norm = isFinite(ftle) ? (ftle - minFtle) / (maxFtle - minFtle + 1e-10) : 0.5;
      const color = this.colormap(norm);

      for (let p = 0; p < numPerturbations; p++) {
        const y = canvas.height - (p + 1) * cellHeight;
        ctx.fillStyle = color;
        ctx.fillRect(s * cellWidth, y, cellWidth, cellHeight);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(s * cellWidth, y, cellWidth, cellHeight);
      }
    }

    this.renderLegend(minFtle, maxFtle);
  }

  renderFtleMatrixEmpty() {
    const ctx = this.canvases.matrix;
    const canvas = this.elements.ftleMatrix;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#333';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Run debug simulation to see FTLE matrix', canvas.width / 2, canvas.height / 2);
  }

  updateMatrixIndicator() {
    if (!this.ftleData || this.ftleData.length === 0) return;

    const totalSamples = parseInt(this.elements.totalSamples.value);
    const xPos = (this.currentSampleIndex / totalSamples) * 100;
    this.elements.matrixIndicator.style.left = `${xPos}%`;
  }

  renderLegend(minFtle, maxFtle) {
    this.elements.ftleLegend.innerHTML = `
      <div class="ftle-legend-item">
        <div class="ftle-legend-color" style="background: rgb(68, 1, 84)"></div>
        <span>${minFtle.toFixed(2)}</span>
      </div>
      <div class="ftle-legend-item">
        <div class="ftle-legend-color" style="background: rgb(253, 231, 37)"></div>
        <span>${maxFtle.toFixed(2)}</span>
      </div>
      <div class="ftle-legend-item">
        <span>Columns: Time samples, Rows: Perturbations</span>
      </div>
    `;
  }

  colormap(t) {
    const c0 = [68, 1, 84];
    const c1 = [33, 145, 140];
    const c2 = [253, 231, 37];

    if (t < 0.5) {
      const s = t * 2;
      return [
        Math.floor(c0[0] + (c1[0] - c0[0]) * s),
        Math.floor(c0[1] + (c1[1] - c0[1]) * s),
        Math.floor(c0[2] + (c1[2] - c0[2]) * s)
      ];
    } else {
      const s = (t - 0.5) * 2;
      return [
        Math.floor(c1[0] + (c2[0] - c1[0]) * s),
        Math.floor(c1[1] + (c2[1] - c1[1]) * s),
        Math.floor(c1[2] + (c2[2] - c1[2]) * s)
      ];
    }
  }
}
