#version 300 es
precision highp float;

uniform sampler2D u_referenceState;
uniform int u_sampleIndex;
uniform float u_perturbationScale;
uniform int u_numSamples;

in vec2 v_uv;
out vec4 fragColor;

// Hash function for pseudo-random numbers
float hash(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec4 hash4(vec2 p, float seed) {
    return vec4(
        hash(p + seed),
        hash(p + seed + 1.0),
        hash(p + seed + 2.0),
        hash(p + seed + 3.0)
    );
}

void main() {
    // Sample reference state
    vec4 refState = texture(u_referenceState, v_uv);
    
    // Generate deterministic random direction for this sample index and pixel
    float seed = float(u_sampleIndex) * 123.456;
    vec4 randDir = hash4(v_uv, seed);
    
    // Convert to [-1, 1] range and normalize
    randDir = randDir * 2.0 - 1.0;
    float len = length(randDir);
    if (len > 0.0) {
        randDir = randDir / len;
    }
    
    // Apply perturbation
    vec4 perturbedState = refState + randDir * u_perturbationScale;
    
    fragColor = perturbedState;
}
