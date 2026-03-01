export class FrameManager {
  constructor() {
    this.savedFrames = [];
    this.frameCount = 0;
    this.internalFrameCounter = 0;
    this.framesSinceLastSave = 0;
    this.currentFrameIndex = 0;
    this.viewingSavedFrame = false;
    this.savedFrameViewType = null;
    this.initialStateData = null;
    
    this.thresholdAccumulatedData = null;
    this.thresholdCrossedData = null;
    this.thresholdFrameCrossedData = null;
  }

  initialize(pixelCount) {
    this.thresholdAccumulatedData = new Float32Array(pixelCount);
    this.thresholdCrossedData = new Int8Array(pixelCount);
    this.thresholdFrameCrossedData = new Int16Array(pixelCount);
    this.internalFrameCounter = 1;
    this.framesSinceLastSave = 1;
  }

  updateThresholdData(currentFrameNumber, instantData, totalTime, threshold, resolution) {
    if (!this.thresholdAccumulatedData || !instantData) return;

    const pixelCount = resolution * resolution;

    for (let pixelIdx = 0; pixelIdx < pixelCount; pixelIdx++) {
      if (this.thresholdCrossedData[pixelIdx]) continue;

      const texIdx = pixelIdx * 4;
      const maxLogGrowth = instantData[texIdx];
      const hasValidData = instantData[texIdx + 1];

      if (hasValidData > 0 && totalTime > 0) {
        const ftle = maxLogGrowth / totalTime;
        this.thresholdAccumulatedData[pixelIdx] += ftle;

        if (this.thresholdAccumulatedData[pixelIdx] >= threshold) {
          this.thresholdCrossedData[pixelIdx] = 1;
          this.thresholdFrameCrossedData[pixelIdx] = currentFrameNumber;
        }
      }
    }
  }

  buildThresholdTextureData(currentFrameNumber, resolution) {
    const pixelCount = resolution * resolution;
    const result = new Float32Array(pixelCount * 4);

    if (!this.thresholdCrossedData || !this.thresholdFrameCrossedData || !this.thresholdAccumulatedData) {
      return result;
    }

    for (let pixelIdx = 0; pixelIdx < pixelCount; pixelIdx++) {
      const crossed = this.thresholdCrossedData[pixelIdx];
      const frameCrossed = this.thresholdFrameCrossedData[pixelIdx];
      const accumulated = this.thresholdAccumulatedData[pixelIdx];

      const rgbaIdx = pixelIdx * 4;
      if (crossed && frameCrossed <= currentFrameNumber) {
        result[rgbaIdx] = frameCrossed;
        result[rgbaIdx + 1] = 1;
      } else {
        result[rgbaIdx] = 0;
        result[rgbaIdx + 1] = 0;
      }
      result[rgbaIdx + 2] = accumulated;
      result[rgbaIdx + 3] = 0;
    }

    return result;
  }

  addFrame(instantData, accumulatedData, bob2DistanceData, currentStateData, resolution, divergenceData = null) {
    if (!this.savedFrames) {
      this.savedFrames = [];
    }

    const frameIndex = this.savedFrames.length;

    if (frameIndex === 0 && currentStateData) {
      this.initialStateData = new Float32Array(currentStateData);
    }

    this.savedFrames.push({
      instantTextureData: instantData,
      accumulatedTextureData: accumulatedData,
      bob2DistanceTextureData: bob2DistanceData,
      currentStateData: currentStateData,
      divergenceTextureData: divergenceData
    });

    return frameIndex;
  }

  clear() {
    this.savedFrames = [];
    this.frameCount = 0;
    this.internalFrameCounter = 0;
    this.framesSinceLastSave = 0;
    this.currentFrameIndex = 0;
    this.viewingSavedFrame = false;
    this.savedFrameViewType = null;
    this.initialStateData = null;

    this.thresholdAccumulatedData = null;
    this.thresholdCrossedData = null;
    this.thresholdFrameCrossedData = null;
  }

  goToFrame(frameIndex, viewType) {
    const frame = this.savedFrames?.[frameIndex];
    if (!frame) return null;

    this.currentFrameIndex = frameIndex;
    this.viewingSavedFrame = true;
    this.savedFrameViewType = viewType;

    return frame;
  }

  showLive() {
    this.viewingSavedFrame = false;
    this.savedFrameViewType = null;
  }

  nextFrame() {
    if (this.savedFrames && this.currentFrameIndex < this.savedFrames.length - 1) {
      return this.goToFrame(this.currentFrameIndex + 1, this.savedFrameViewType || 'instant');
    }
    return null;
  }

  prevFrame() {
    if (this.savedFrames && this.savedFrames.length > 0) {
      return this.goToFrame(Math.max(0, this.currentFrameIndex - 1), this.savedFrameViewType || 'instant');
    }
    return null;
  }

  getFrame(frameIndex) {
    return this.savedFrames?.[frameIndex] || null;
  }

  getAllFrames() {
    return this.savedFrames || [];
  }

  getFrameCount() {
    return this.savedFrames?.length || 0;
  }

  shouldSaveFrame(saveInterval) {
    return this.framesSinceLastSave >= saveInterval;
  }

  incrementFrameCounter() {
    this.internalFrameCounter++;
    this.framesSinceLastSave++;
  }

  resetFrameCounter() {
    this.framesSinceLastSave = 0;
  }
}
