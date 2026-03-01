/**
 * AnimationAssembler - Assembles stored animation frames into downloadable formats
 * Supports individual PNG downloads and batch generation
 */
export class AnimationAssembler {
  constructor(animationStorage) {
    this.storage = animationStorage;
    this.progressCallback = null;
    this.abortController = null;
  }

  /**
   * Set progress callback for assembly operations
   * @param {Function} callback - Receives {current, total, percent}
   */
  onProgress(callback) {
    this.progressCallback = callback;
  }

  /**
   * Report progress to callback
   * @private
   */
  reportProgress(current, total) {
    if (this.progressCallback) {
      const percent = total > 0 ? (current / total) * 100 : 0;
      this.progressCallback({ current, total, percent: Math.round(percent) });
    }
  }

  /**
   * Assemble and download all frames as individual PNGs
   * @returns {Promise<{success: boolean, downloaded: number, errors: string[]}>}
   */
  async assembleIndividualDownloads() {
    const frames = this.storage.getAllFrames();
    const errors = [];
    let downloaded = 0;

    if (frames.length === 0) {
      return { success: false, downloaded: 0, errors: ['No frames stored'] };
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) {
        errors.push('Assembly cancelled by user');
        break;
      }

      const { frameNumber, dataUrl } = frames[i];
      
      try {
        await this.downloadFrame(dataUrl, frameNumber);
        downloaded++;
        this.reportProgress(i + 1, frames.length);
        
        // Small delay to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (e) {
        errors.push(`Frame ${frameNumber}: ${e.message}`);
      }
    }

    this.abortController = null;
    
    return {
      success: errors.length === 0,
      downloaded,
      errors
    };
  }

  /**
   * Download a single frame
   * @private
   */
  downloadFrame(dataUrl, frameNumber) {
    return new Promise((resolve, reject) => {
      const link = document.createElement('a');
      link.download = `lyapunov_frame_${String(frameNumber).padStart(4, '0')}.png`;
      link.href = dataUrl;
      
      link.addEventListener('click', () => resolve(), { once: true });
      link.addEventListener('error', () => reject(new Error('Download failed')), { once: true });
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Fallback resolve in case events don't fire
      setTimeout(resolve, 100);
    });
  }

  /**
   * Generate a simple HTML gallery of all frames for easy viewing/saving
   * @returns {Promise<{success: boolean, html?: string, errors: string[]}>}
   */
  async generateGalleryHtml() {
    const frames = this.storage.getAllFrames();
    
    if (frames.length === 0) {
      return { success: false, errors: ['No frames stored'] };
    }

    const meta = this.storage.metadata || {};
    const storageInfo = this.storage.getStorageInfo();
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lyapunov Animation - ${frames.length} Frames</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; background: #1a1a2e; color: #eee; }
    h1 { margin-bottom: 0.5rem; }
    .meta { color: #888; margin-bottom: 2rem; font-size: 0.9rem; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
    .frame { background: #16213e; border-radius: 8px; overflow: hidden; }
    .frame img { width: 100%; height: auto; display: block; }
    .frame-label { padding: 0.5rem; text-align: center; font-size: 0.8rem; color: #aaa; }
    .download-all { margin-bottom: 2rem; }
    .btn { background: #0f3460; color: #fff; border: none; padding: 0.75rem 1.5rem; 
           border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
    .btn:hover { background: #1a4a7a; }
  </style>
</head>
<body>
  <h1>Lyapunov Animation Gallery</h1>
  <div class="meta">
    ${frames.length} frames | Resolution: ${meta.resolution || 'Unknown'} | 
    Total size: ${this.formatBytes(storageInfo.totalSizeBytes)} | 
    Created: ${new Date(meta.createdAt || Date.now()).toLocaleString()}
  </div>
  <div class="download-all">
    <button class="btn" onclick="downloadAll()">Download All Frames</button>
  </div>
  <div class="gallery">\n`;

    for (let i = 0; i < frames.length; i++) {
      const { frameNumber, dataUrl } = frames[i];
      html += `    <div class="frame">
      <img src="${dataUrl}" alt="Frame ${frameNumber}">
      <div class="frame-label">Frame ${String(frameNumber).padStart(4, '0')}</div>
    </div>\n`;
      
      this.reportProgress(i + 1, frames.length);
      
      // Yield to prevent blocking
      if (i % 10 === 0) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    }

    html += `  </div>
  <script>
    function downloadAll() {
      const frames = document.querySelectorAll('.frame img');
      frames.forEach((img, i) => {
        setTimeout(() => {
          const link = document.createElement('a');
          link.download = 'lyapunov_frame_' + String(i + 1).padStart(4, '0') + '.png';
          link.href = img.src;
          link.click();
        }, i * 100);
      });
    }
  </script>
</body>
</html>`;

    // Create downloadable HTML file
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = 'lyapunov_animation_gallery.html';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);

    return { success: true, html, errors: [] };
  }

  /**
   * Create a simple data URI manifest of all frames
   * Useful for importing into other tools
   */
  async generateManifest() {
    const frames = this.storage.getAllFrames();
    
    if (frames.length === 0) {
      return { success: false, errors: ['No frames stored'] };
    }

    const meta = this.storage.metadata || {};
    const storageInfo = this.storage.getStorageInfo();
    
    const manifest = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      originalCreatedAt: meta.createdAt ? new Date(meta.createdAt).toISOString() : null,
      frameCount: frames.length,
      resolution: meta.resolution,
      totalSizeBytes: storageInfo.totalSizeBytes,
      frames: frames.map(f => ({
        frameNumber: f.frameNumber,
        filename: `lyapunov_frame_${String(f.frameNumber).padStart(4, '0')}.png`,
        dataUrl: f.dataUrl
      }))
    };

    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = 'lyapunov_animation_manifest.json';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);

    return { success: true, manifest, errors: [] };
  }

  async assembleVideo(renderer, fps = 30) {
    const frames = this.storage.getAllFrames();
    const errors = [];

    if (frames.length === 0) {
      return { success: false, errors: ['No frames stored'] };
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const resolution = renderer.resolution;
      canvas.width = resolution;
      canvas.height = resolution;

      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];

      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      if (!selectedMimeType) {
        return {
          success: false,
          errors: ['Video recording not supported in this browser. Try Chrome or Firefox.']
        };
      }

      const stream = canvas.captureStream(fps);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 10000000
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      return new Promise(async (resolve) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: selectedMimeType });
          const url = URL.createObjectURL(blob);

          const link = document.createElement('a');
          link.download = `lyapunov_animation_${fps}fps.webm`;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          URL.revokeObjectURL(url);

          resolve({
            success: true,
            videoUrl: url,
            errors: errors
          });
        };

        mediaRecorder.start();

        const frameDuration = 1000 / fps;

        for (let i = 0; i < frames.length; i++) {
          const frame = frames[i];
          if (frame.instantTextureData) {
            const imageData = renderer.renderTextureDataToImageData(frame.instantTextureData);
            ctx.putImageData(imageData, 0, 0);
          }

          this.reportProgress(i + 1, frames.length);

          await new Promise(r => setTimeout(r, frameDuration));
        }

        mediaRecorder.stop();
      });
    } catch (e) {
      return { success: false, errors: [`Video generation failed: ${e.message}`] };
    }
  }

  async assembleVideoFromThumbnails(fps = 30) {
    const frames = this.storage.getAllFrames();
    const errors = [];

    if (frames.length === 0) {
      return { success: false, errors: ['No frames stored'] };
    }

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const firstImg = await this.loadImage(frames[0].dataUrl);
      canvas.width = firstImg.width;
      canvas.height = firstImg.height;

      const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
      ];

      let selectedMimeType = '';
      for (const type of mimeTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          selectedMimeType = type;
          break;
        }
      }

      if (!selectedMimeType) {
        return {
          success: false,
          errors: ['Video recording not supported in this browser. Try Chrome or Firefox.']
        };
      }

      const stream = canvas.captureStream(fps);
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 10000000
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      return new Promise(async (resolve) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: selectedMimeType });
          const url = URL.createObjectURL(blob);

          const link = document.createElement('a');
          link.download = `lyapunov_animation_${fps}fps.webm`;
          link.href = url;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          resolve({
            success: true,
            videoUrl: url,
            errors: errors
          });
        };

        mediaRecorder.start();

        const frameDuration = 1000 / fps;

        for (let i = 0; i < frames.length; i++) {
          const img = await this.loadImage(frames[i].dataUrl);
          ctx.drawImage(img, 0, 0);
          this.reportProgress(i + 1, frames.length);

          await new Promise(r => setTimeout(r, frameDuration));
        }

        mediaRecorder.stop();
      });
    } catch (e) {
      return { success: false, errors: [`Video generation failed: ${e.message}`] };
    }
  }

  loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    });
  }

  /**
   * Cancel any ongoing assembly operation
   */
  cancel() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Format bytes to human-readable string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
