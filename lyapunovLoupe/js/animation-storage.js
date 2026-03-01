/**
 * AnimationStorage - Manages saving animation frames in RAM (no localStorage)
 * Stores PNG data URLs in memory
 */
export class AnimationStorage {
  constructor() {
    // In-memory storage - Map of frameNumber -> dataUrl
    this.frames = new Map();
    this.metadata = {
      frameCount: 0,
      createdAt: Date.now(),
      resolution: null
    };
    this.maxMemoryBytes = 500 * 1024 * 1024; // 500MB limit for RAM
    this.warningThreshold = 0.85; // Warn at 85% capacity
  }

  /**
   * Save a frame to RAM
   * @param {number} frameNumber - Frame number (1-based)
   * @param {string} canvasDataUrl - PNG data URL from canvas.toDataURL()
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async saveFrame(frameNumber, canvasDataUrl) {
    const dataSize = new Blob([canvasDataUrl]).size;
    const currentUsage = this.calculateTotalSize();
    const projectedUsage = currentUsage + dataSize;

    if (projectedUsage > this.maxMemoryBytes) {
      return {
        success: false,
        error: `Memory limit reached (${this.formatBytes(this.maxMemoryBytes)}). Cannot save frame ${frameNumber}.`
      };
    }

    try {
      // Store in RAM
      this.frames.set(frameNumber, canvasDataUrl);
      
      // Update frame count if this is a new frame
      if (frameNumber > this.metadata.frameCount) {
        this.metadata.frameCount = frameNumber;
      }

      // Check if we're near the warning threshold
      const usagePercent = this.calculateTotalSize() / this.maxMemoryBytes;
      if (usagePercent > this.warningThreshold) {
        console.warn(`Animation storage at ${(usagePercent * 100).toFixed(1)}% capacity`);
      }

      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: `Failed to save frame ${frameNumber}: ${e.message}`
      };
    }
  }

  /**
   * Get a specific frame
   * @param {number} frameNumber - Frame number (1-based)
   * @returns {string|null} PNG data URL or null if not found
   */
  getFrame(frameNumber) {
    return this.frames.get(frameNumber) || null;
  }

  /**
   * Get all stored frames
   * @returns {Array<{frameNumber: number, dataUrl: string}>}
   */
  getAllFrames() {
    const frames = [];
    // Sort by frame number
    const sortedKeys = Array.from(this.frames.keys()).sort((a, b) => a - b);
    for (const frameNumber of sortedKeys) {
      const data = this.frames.get(frameNumber);
      if (data) {
        frames.push({
          frameNumber,
          dataUrl: data
        });
      }
    }
    return frames;
  }

  /**
   * Clear all stored animation frames
   */
  clearFrames() {
    this.frames.clear();
    this.metadata = {
      frameCount: 0,
      createdAt: Date.now(),
      resolution: null
    };
    console.log('Animation frames cleared from RAM');
  }

  /**
   * Calculate total memory size used by animation frames
   * @returns {number} Total bytes used
   */
  calculateTotalSize() {
    let total = 0;
    for (const [_, dataUrl] of this.frames) {
      total += new Blob([dataUrl]).size;
    }
    // Include metadata size
    total += new Blob([JSON.stringify(this.metadata)]).size;
    return total;
  }

  /**
   * Format bytes to human-readable string
   * @param {number} bytes
   * @returns {string}
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get storage information
   * @returns {{frameCount: number, totalSizeBytes: number, estimatedPercentUsed: number}}
   */
  getStorageInfo() {
    const totalSize = this.calculateTotalSize();
    const estimatedPercentUsed = Math.min(100, (totalSize / this.maxMemoryBytes) * 100);
    
    return {
      frameCount: this.frames.size,
      totalSizeBytes: totalSize,
      estimatedPercentUsed: parseFloat(estimatedPercentUsed.toFixed(2))
    };
  }

  /**
   * Set resolution in metadata
   * @param {number} resolution - Canvas resolution
   */
  setResolution(resolution) {
    this.metadata.resolution = resolution;
  }

  /**
   * Check if saving animation is enabled (based on checkbox state)
   * @returns {boolean}
   */
  static isSaveEnabled() {
    const checkbox = document.getElementById('save-animation-check');
    return checkbox ? checkbox.checked : false;
  }
}
