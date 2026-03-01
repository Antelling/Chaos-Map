export class StateGenerator {
  constructor(resolution, ui) {
    this.resolution = resolution;
    this.ui = ui;
  }

  generate() {
    const data = new Float32Array(this.resolution * this.resolution * 4);
    const state = this.ui.getState();
    const system = state.system;
    const basis = state.basisPoint;
    const xDim = state.xDim;
    const yDim = state.yDim;
    const xRange = state.xRange;
    const yRange = state.yRange;
    const deltaMode = state.deltaMode;

    for (let y = 0; y < this.resolution; y++) {
      for (let x = 0; x < this.resolution; x++) {
        const i = (y * this.resolution + x) * 4;

        const u = x / this.resolution;
        const v = 1.0 - y / this.resolution;

        const xVal = xRange[0] + u * (xRange[1] - xRange[0]);
        const yVal = yRange[0] + v * (yRange[1] - yRange[0]);

        let s1, s2, s3, s4;

        if (system === 'double-pendulum' || system === 'elastic-pendulum') {
          s1 = deltaMode ? basis.theta1 + xVal : xVal;
          s2 = basis.omega1;
          s3 = deltaMode ? basis.theta2 + yVal : yVal;
          s4 = basis.omega2;

          if (xDim === 'omega1') s2 = deltaMode ? basis.omega1 + xVal : xVal;
          else if (xDim === 'omega2') s4 = deltaMode ? basis.omega2 + xVal : xVal;

          if (yDim === 'omega1') s2 = deltaMode ? basis.omega1 + yVal : yVal;
          else if (yDim === 'omega2') s4 = deltaMode ? basis.omega2 + yVal : yVal;

        } else if (system === 'henon-heiles') {
          s1 = deltaMode ? basis.x + xVal : xVal;
          s2 = basis.px;
          s3 = deltaMode ? basis.y + yVal : yVal;
          s4 = basis.py;

          if (xDim === 'px') s2 = deltaMode ? basis.px + xVal : xVal;
          else if (xDim === 'py') s4 = deltaMode ? basis.py + xVal : xVal;

          if (yDim === 'px') s2 = deltaMode ? basis.px + yVal : yVal;
          else if (yDim === 'py') s4 = deltaMode ? basis.py + yVal : yVal;

        } else if (system === 'duffing') {
          s1 = deltaMode ? basis.x + xVal : xVal;
          s2 = deltaMode ? basis.v + yVal : yVal;
          s3 = basis.t;
          s4 = 0.0;

          if (xDim === 'v') s2 = deltaMode ? basis.v + xVal : xVal;
          else if (xDim === 't') s3 = deltaMode ? basis.t + xVal : xVal;

          if (yDim === 'x') s1 = deltaMode ? basis.x + yVal : yVal;
          else if (yDim === 't') s3 = deltaMode ? basis.t + yVal : yVal;
        }

        data[i] = s1;
        data[i + 1] = s2;
        data[i + 2] = s3;
        data[i + 3] = s4;
      }
    }

    return data;
  }

  generateChunk(chunkX, chunkY, chunkSize) {
    const data = new Float32Array(chunkSize * chunkSize * 4);
    const state = this.ui.getState();
    const system = state.system;
    const basis = state.basisPoint;
    const xDim = state.xDim;
    const yDim = state.yDim;
    const xRange = state.xRange;
    const yRange = state.yRange;
    const deltaMode = state.deltaMode;
    const chunkOffsetX = chunkX * chunkSize;
    const chunkOffsetY = chunkY * chunkSize;

    for (let y = 0; y < chunkSize; y++) {
      for (let x = 0; x < chunkSize; x++) {
        const i = (y * chunkSize + x) * 4;
        const globalX = chunkOffsetX + x;
        const globalY = chunkOffsetY + y;

        if (globalX >= this.resolution || globalY >= this.resolution) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
          continue;
        }

        const u = globalX / this.resolution;
        const v = 1.0 - globalY / this.resolution;

        const xVal = xRange[0] + u * (xRange[1] - xRange[0]);
        const yVal = yRange[0] + v * (yRange[1] - yRange[0]);

        let s1, s2, s3, s4;

        if (system === 'double-pendulum' || system === 'elastic-pendulum') {
          s1 = deltaMode ? basis.theta1 + xVal : xVal;
          s2 = basis.omega1;
          s3 = deltaMode ? basis.theta2 + yVal : yVal;
          s4 = basis.omega2;

          if (xDim === 'omega1') s2 = deltaMode ? basis.omega1 + xVal : xVal;
          else if (xDim === 'omega2') s4 = deltaMode ? basis.omega2 + xVal : xVal;

          if (yDim === 'omega1') s2 = deltaMode ? basis.omega1 + yVal : yVal;
          else if (yDim === 'omega2') s4 = deltaMode ? basis.omega2 + yVal : yVal;

        } else if (system === 'henon-heiles') {
          s1 = deltaMode ? basis.x + xVal : xVal;
          s2 = basis.px;
          s3 = deltaMode ? basis.y + yVal : yVal;
          s4 = basis.py;

          if (xDim === 'px') s2 = deltaMode ? basis.px + xVal : xVal;
          else if (xDim === 'py') s4 = deltaMode ? basis.py + xVal : xVal;

          if (yDim === 'px') s2 = deltaMode ? basis.px + yVal : yVal;
          else if (yDim === 'py') s4 = deltaMode ? basis.py + yVal : yVal;

        } else if (system === 'duffing') {
          s1 = deltaMode ? basis.x + xVal : xVal;
          s2 = deltaMode ? basis.v + yVal : yVal;
          s3 = basis.t;
          s4 = 0.0;

          if (xDim === 'v') s2 = deltaMode ? basis.v + xVal : xVal;
          else if (xDim === 't') s3 = deltaMode ? basis.t + xVal : xVal;

          if (yDim === 'x') s1 = deltaMode ? basis.x + yVal : yVal;
          else if (yDim === 't') s3 = deltaMode ? basis.t + yVal : yVal;
        }

        data[i] = s1;
        data[i + 1] = s2;
        data[i + 2] = s3;
        data[i + 3] = s4;
      }
    }

    return data;
  }

  generatePerturbation(scale) {
    const data = new Float32Array(this.resolution * this.resolution * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (Math.random() - 0.5) * scale;
      data[i + 1] = (Math.random() - 0.5) * scale;
      data[i + 2] = (Math.random() - 0.5) * scale;
      data[i + 3] = (Math.random() - 0.5) * scale;
    }
    return data;
  }

  generateNoise(maxPerturbations = 64) {
    const gridSize = Math.ceil(Math.sqrt(maxPerturbations));
    const textureWidth = this.resolution * gridSize;
    const textureHeight = this.resolution * gridSize;
    
    const data = new Float32Array(textureWidth * textureHeight * 4);
    
    for (let p = 0; p < maxPerturbations; p++) {
      const gridX = p % gridSize;
      const gridY = Math.floor(p / gridSize);
      
      for (let y = 0; y < this.resolution; y++) {
        for (let x = 0; x < this.resolution; x++) {
          const texX = gridX * this.resolution + x;
          const texY = gridY * this.resolution + y;
          const i = (texY * textureWidth + texX) * 4;
          data[i] = Math.random();
          data[i + 1] = Math.random();
          data[i + 2] = Math.random();
          data[i + 3] = Math.random();
        }
      }
    }
    
    return { data, gridSize, width: textureWidth, height: textureHeight };
  }
}
