export class ShaderLoader {
  constructor(basePath) {
    this.basePath = basePath;
  }

  async load(shaderPath) {
    const cacheBuster = `?v=${Date.now()}`;
    const response = await fetch(this.basePath + shaderPath + cacheBuster);
    if (!response.ok) {
      throw new Error(`Failed to load shader: ${shaderPath} (${response.status})`);
    }
    return await response.text();
  }

  async loadAll() {
    const paths = {
      common: 'shaders/common.glsl',
      rk4: 'shaders/integrator-rk4.glsl',
      verlet: 'shaders/integrator-verlet.glsl',
      render: 'shaders/render-ftle.glsl',
      accumulate: 'shaders/accumulate-ftle.glsl',
      bob2Distance: 'shaders/accumulate-bob2-distance.glsl',
      divergenceTime: 'shaders/accumulate-divergence-time.glsl',
      divergenceInit: 'shaders/init-divergence-perturbed.glsl',
      divergenceEvolve: 'shaders/evolve-divergence-perturbed.glsl',
      renderPosition: 'shaders/render-position.glsl',
      renderTile: 'shaders/render-tile.glsl',
      renderPendulum: 'shaders/render-pendulum.glsl',
      renderPhaseSpace: 'shaders/render-phase-space.glsl'
    };

    const shaders = {};
    for (const [key, path] of Object.entries(paths)) {
      shaders[key] = await this.load(path);
    }
    return shaders;
  }

  getSystemShaderPath(system) {
    const systemMap = {
      'double-pendulum': 'shaders/system-double-pendulum.glsl',
      'elastic-pendulum': 'shaders/system-elastic-pendulum.glsl',
      'henon-heiles': 'shaders/system-henon-heiles.glsl',
      'duffing': 'shaders/system-duffing.glsl'
    };
    return this.basePath + (systemMap[system] || systemMap['double-pendulum']);
  }
}
