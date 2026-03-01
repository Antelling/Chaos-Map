#version 300 es
precision highp float;

uniform sampler2D u_stateTexture;
uniform sampler2D u_accumulatedDivergence;
uniform sampler2D u_perturbedState0;
uniform sampler2D u_perturbedState1;
uniform sampler2D u_perturbedState2;
uniform sampler2D u_perturbedState3;
uniform sampler2D u_perturbedState4;
uniform sampler2D u_perturbedState5;
uniform sampler2D u_perturbedState6;
uniform sampler2D u_perturbedState7;
uniform bool u_reset;
uniform float u_divergenceThreshold;
uniform int u_numSamples;
uniform int u_iteration;

in vec2 v_uv;
out vec4 fragColor;

float circularDiff(float a, float b) {
    float d = a - b;
    d = d - 6.28318530718 * floor(d / 6.28318530718 + 0.5);
    return d;
}

vec4 getPerturbedState(int index) {
    if (index == 0) return texture(u_perturbedState0, v_uv);
    if (index == 1) return texture(u_perturbedState1, v_uv);
    if (index == 2) return texture(u_perturbedState2, v_uv);
    if (index == 3) return texture(u_perturbedState3, v_uv);
    if (index == 4) return texture(u_perturbedState4, v_uv);
    if (index == 5) return texture(u_perturbedState5, v_uv);
    if (index == 6) return texture(u_perturbedState6, v_uv);
    if (index == 7) return texture(u_perturbedState7, v_uv);
    return vec4(0.0);
}

void main() {
    vec4 refState = texture(u_stateTexture, v_uv);
    vec4 accumulated = texture(u_accumulatedDivergence, v_uv);
    
    float divergenceFrame = accumulated.r;
    float maxDistance = accumulated.g;
    float currentMax = 0.0;
    
    // Check all perturbed states
    for (int i = 0; i < 8; i++) {
        if (i >= u_numSamples) break;
        
        vec4 perturbedState = getPerturbedState(i);
        
        // Compute Euclidean distance with circular diff for angles
        vec4 diff;
        diff.x = circularDiff(perturbedState.x, refState.x);
        diff.y = perturbedState.y - refState.y;
        diff.z = circularDiff(perturbedState.z, refState.z);
        diff.w = perturbedState.w - refState.w;
        
        float dist = length(diff);
        currentMax = max(currentMax, dist);
        
        // Check for divergence if not already diverged
        if (divergenceFrame == 0.0 && dist > u_divergenceThreshold) {
            divergenceFrame = float(u_iteration);
        }
    }
    
    // Always accumulate max distance across all iterations
    maxDistance = max(maxDistance, currentMax);
    
    fragColor = vec4(divergenceFrame, maxDistance, 0.0, 0.0);
}
