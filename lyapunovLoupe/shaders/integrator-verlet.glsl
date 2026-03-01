#version 300 es
precision highp float;

uniform sampler2D u_stateTexture;
uniform sampler2D u_prevStateTexture;
uniform sampler2D u_noiseTexture;
uniform float u_noiseGridSize;
uniform float u_dt;
uniform int u_maxIterations;
uniform int u_numPerturbations;
uniform float u_perturbationScale;
uniform float u_renormScale;
uniform int u_chunkStart;
uniform int u_chunkIterations;
uniform int u_isFirstChunk;
uniform sampler2D u_runningFtleTexture;
uniform sampler2D u_runningDivergenceTexture;
uniform float u_divergenceThreshold;

in vec2 v_uv;
layout(location = 0) out vec4 v_outputState;
layout(location = 1) out vec4 v_outputPrevState;
layout(location = 2) out vec4 v_outputFtle;
layout(location = 3) out vec4 v_outputDivergence;

float circularDiff(float a, float b) {
  float d = a - b;
  d = d - 6.28318530718 * floor(d / 6.28318530718 + 0.5);
  return d;
}

float normalizeAngle(float a) {
  return a - 6.28318530718 * floor(a / 6.28318530718 + 0.5);
}

vec4 randomGaussian(vec2 uv, int perturbationIndex) {
  float gridSize = u_noiseGridSize > 0.0 ? u_noiseGridSize : 8.0;
  float gridX = float(perturbationIndex % int(gridSize));
  float gridY = float(perturbationIndex / int(gridSize));
  vec2 noiseUv = vec2((uv.x + gridX) / gridSize, (uv.y + gridY) / gridSize);
  vec4 noiseVal = texture(u_noiseTexture, noiseUv);

  float u1 = max(noiseVal.x, 0.0001);
  float u2 = noiseVal.y;
  float u3 = max(noiseVal.z, 0.0001);
  float u4 = noiseVal.w;

  float r = sqrt(-2.0 * log(u1));
  float theta = 2.0 * 3.14159265359 * u2;
  float z0 = r * cos(theta);
  float z1 = r * sin(theta);

  float r2 = sqrt(-2.0 * log(u3));
  float theta2 = 2.0 * 3.14159265359 * u4;
  float z2 = r2 * cos(theta2);
  float z3 = r2 * sin(theta2);

  return vec4(z0, z1, z2, z3);
}

vec4 systemDeriv(vec4 state, vec4 params);

vec4 initializePrevState(vec4 state, float dt, vec4 params) {
  vec4 deriv = systemDeriv(state, params);
  return state - dt * deriv;
}

void verletStep(inout vec4 state, float dt, vec4 params) {
  vec4 deriv = systemDeriv(state, params);
  vec2 v_half = state.yw + 0.5 * dt * deriv.yw;
  vec2 q_next = state.xz + dt * v_half;
  q_next.x = normalizeAngle(q_next.x);
  q_next.y = normalizeAngle(q_next.y);
  vec4 state_temp = vec4(q_next.x, v_half.x, q_next.y, v_half.y);
  vec4 deriv_next = systemDeriv(state_temp, params);
  vec2 v_next = v_half + 0.5 * dt * deriv_next.yw;
  state = vec4(q_next.x, v_next.x, q_next.y, v_next.y);
}

void main() {
  vec4 state = texture(u_stateTexture, v_uv);
  vec4 params = vec4(0.0);

  float maxLogGrowth = -1e30;
  vec4 prevState;
  vec4 currentState;

  // Divergence tracking
  float divergenceIteration = 0.0;
  float maxDivergenceDistance = 0.0;
  float divergenceValid = 0.0;

  if (u_isFirstChunk == 1) {
    prevState = initializePrevState(state, u_dt, params);
    currentState = state;
  } else {
    prevState = texture(u_prevStateTexture, v_uv);
    vec4 prevData = texture(u_runningFtleTexture, v_uv);
    maxLogGrowth = prevData.r;
    currentState = state;
    
    vec4 prevDivergence = texture(u_runningDivergenceTexture, v_uv);
    divergenceIteration = prevDivergence.r;
    maxDivergenceDistance = prevDivergence.g;
    divergenceValid = prevDivergence.a;
  }
  divergenceValid = 1.0;

  float scale = u_perturbationScale > 0.0 ? u_perturbationScale : 1e-6;

  // Initialize perturbed states for per-iteration divergence tracking
  vec4 perturbedStates[8];
  vec4 perturbedPrevStates[8];
  for (int p = 0; p < 8; p++) {
    if (p >= u_numPerturbations) break;
    vec4 randVec = randomGaussian(v_uv, p);
    float randMag = length(randVec);
    vec4 perturbation = (randMag > 1e-9) ? (randVec / randMag) * scale : vec4(scale);
    perturbedStates[p] = state + perturbation;
    perturbedPrevStates[p] = perturbedStates[p] - u_dt * systemDeriv(perturbedStates[p], params);
  }

  // Evolve base state step-by-step, tracking divergence per iteration
  vec4 baseState = state;
  vec4 basePrevState = prevState;
  for (int iter = 0; iter < 1000; iter++) {
    if (iter >= u_chunkIterations) break;
    verletStep(baseState, u_dt, params);
    verletStep(basePrevState, u_dt, params);

    // Evolve perturbed states and check for divergence
    for (int p = 0; p < 8; p++) {
      if (p >= u_numPerturbations) break;
      verletStep(perturbedStates[p], u_dt, params);

      if (divergenceIteration == 0.0) {
        vec4 diff;
        diff.x = circularDiff(perturbedStates[p].x, baseState.x);
        diff.y = perturbedStates[p].y - baseState.y;
        diff.z = circularDiff(perturbedStates[p].z, baseState.z);
        diff.w = perturbedStates[p].w - baseState.w;

        float dist = length(diff);
        maxDivergenceDistance = max(maxDivergenceDistance, dist);

        if (dist > u_divergenceThreshold) {
          divergenceIteration = float(u_chunkStart + iter + 1);
        }
      }
    }
  }

  // Compute FTLE from final divergence
  for (int p = 0; p < 64; p++) {
    if (p >= u_numPerturbations) break;

    vec4 randVec = randomGaussian(v_uv, p);
    float randMag = length(randVec);
    vec4 perturbation = (randMag > 1e-9) ? (randVec / randMag) * scale : vec4(scale);

    vec4 perturbedState = state + perturbation;
    vec4 perturbedPrevState = perturbedState - u_dt * systemDeriv(perturbedState, params);

    for (int i = 0; i < 1000; i++) {
      if (i >= u_chunkIterations) break;
      verletStep(perturbedState, u_dt, params);
    }

    vec4 finalPerturbation;
    finalPerturbation.x = circularDiff(perturbedState.x, baseState.x);
    finalPerturbation.y = perturbedState.y - baseState.y;
    finalPerturbation.z = circularDiff(perturbedState.z, baseState.z);
    finalPerturbation.w = perturbedState.w - baseState.w;

    float finalMag = length(finalPerturbation);
    float initialMag = length(perturbation);

    if (finalMag > 0.0 && initialMag > 0.0) {
      float growthRatio = finalMag / initialMag;
      if (growthRatio > 0.0) {
        maxLogGrowth = max(maxLogGrowth, log(growthRatio));
      }
    }
  }

  v_outputState = baseState;
  v_outputPrevState = basePrevState;
  v_outputFtle = vec4(maxLogGrowth, 1.0, 0.0, 0.0);
  v_outputDivergence = vec4(divergenceIteration, maxDivergenceDistance, 0.0, divergenceValid);
}
