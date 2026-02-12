// CPU-Based Chaos Map Renderer with 64-bit Double Precision (WebWorker-based)
// Generates chaos maps using CPU computation in WebWorkers for maximum precision without blocking UI

class CPUChaosMapRenderer {
    constructor(resolution = 1024) {
        this.resolution = resolution;
        this.maxIter = 20000;
        this.threshold = 0.05;
        this.dt = 0.002;
        this.g = 9.81;
        this.integrator = 'rk4'; // 'rk4' or 'verlet'
        this.perturbMode = 'fixed'; // 'fixed' or 'random'
        this.colorMapping = 0; // 0=rainbow, 1=heatmap, 2=viridis, 3=grayscale, 4=cyclic
        this.cyclePeriod = 500;
        this.hueMapping = 0;
        
        this.perturbFixed = {
            theta1: 0.00001, theta2: 0.00001, omega1: 0.00001, omega2: 0.00001,
            l1: 0.00001, l2: 0.00001, m1: 0.00001, m2: 0.00001
        };
        
        this.shouldStop = false;
        this.isRendering = false;
        
        // Worker pool
        this.workers = [];
        this.maxWorkers = navigator.hardwareConcurrency || 4;
        this.pendingTiles = 0;
    }
    
    // Initialize worker pool
    initWorkers() {
        // Terminate existing workers
        this.terminateWorkers();
        
        // Create new workers
        for (let i = 0; i < this.maxWorkers; i++) {
            const worker = new Worker('js/chaos-renderer-cpu-worker.js');
            worker.onmessage = this.handleWorkerMessage.bind(this);
            worker.isBusy = false;
            this.workers.push(worker);
        }
    }
    
    // Terminate all workers
    terminateWorkers() {
        for (const worker of this.workers) {
            worker.terminate();
        }
        this.workers = [];
    }
    
    // Handle messages from workers
    handleWorkerMessage(e) {
        const { action, params } = e.data;
        
        if (action === 'tileComplete') {
            this.pendingTiles--;
            
            // Find the worker that sent this message and mark as free
            for (const worker of this.workers) {
                if (worker.isBusy) {
                    worker.isBusy = false;
                    break;
                }
            }
            
            // Store the completed tile data for later retrieval
            if (this.onTileComplete) {
                this.onTileComplete(params);
            }
        }
    }
    
    // Get an available worker
    getAvailableWorker() {
        for (const worker of this.workers) {
            if (!worker.isBusy) {
                return worker;
            }
        }
        return null;
    }
    
    // Render a single tile using a worker
    async renderTile(offsetX, offsetY, width, height, shaderParams) {
        return new Promise((resolve, reject) => {
            const tryRender = () => {
                const worker = this.getAvailableWorker();
                
                if (!worker) {
                    // No worker available, wait and retry
                    setTimeout(tryRender, 10);
                    return;
                }
                
                worker.isBusy = true;
                this.pendingTiles++;
                
                // Set up one-time handler for this tile
                const handler = (e) => {
                    const { action, params } = e.data;
                    if (action === 'tileComplete' && 
                        params.offsetX === offsetX && 
                        params.offsetY === offsetY) {
                        worker.removeEventListener('message', handler);
                        resolve(params.imageData);
                    }
                };
                worker.addEventListener('message', handler);
                
                // Send render task to worker
                worker.postMessage({
                    action: 'renderTile',
                    params: {
                        offsetX, offsetY, width, height,
                        resolution: this.resolution,
                        shaderParams,
                        config: {
                            maxIter: this.maxIter,
                            threshold: this.threshold,
                            dt: this.dt,
                            g: this.g,
                            integrator: this.integrator,
                            colorMapping: this.colorMapping,
                            cyclePeriod: this.cyclePeriod,
                            perturbFixed: this.perturbFixed
                        }
                    }
                });
            };
            
            tryRender();
        });
    }
    
    // Stop rendering
    stop() {
        this.shouldStop = true;
        for (const worker of this.workers) {
            worker.postMessage({ action: 'stop' });
        }
    }
    
    // Cleanup
    destroy() {
        this.terminateWorkers();
    }
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CPUChaosMapRenderer };
}
