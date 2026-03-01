#version 300 es
precision highp float;

uniform sampler2D u_perturbedState;
uniform float u_dt;

in vec2 v_uv;
out vec4 fragColor;

// System parameters (should match main simulation)
float L1 = 1.0;
float L2 = 1.0;
float m1 = 1.0;
float m2 = 1.0;
float g = 9.81;

vec4 systemDeriv(vec4 state) {
    float theta1 = state.x;
    float omega1 = state.y;
    float theta2 = state.z;
    float omega2 = state.w;
    
    float delta = theta2 - theta1;
    float sinDelta = sin(delta);
    float cosDelta = cos(delta);
    
    float denom1 = (m1 + m2) * L1 - m2 * L1 * cosDelta * cosDelta;
    float denom2 = (L2 / L1) * denom1;
    
    float alpha1 = (m2 * L1 * omega1 * omega1 * sinDelta * cosDelta +
                    m2 * g * sin(theta2) * cosDelta +
                    m2 * L2 * omega2 * omega2 * sinDelta -
                    (m1 + m2) * g * sin(theta1)) / denom1;
    
    float alpha2 = (-m2 * L2 * omega2 * omega2 * sinDelta * cosDelta -
                    (m1 + m2) * g * sin(theta1) * cosDelta -
                    (m1 + m2) * L1 * omega1 * omega1 * sinDelta +
                    (m1 + m2) * g * sin(theta2)) / denom2;
    
    return vec4(omega1, alpha1, omega2, alpha2);
}

vec4 rk4Step(vec4 state, float dt) {
    vec4 k1 = systemDeriv(state);
    vec4 k2 = systemDeriv(state + 0.5 * dt * k1);
    vec4 k3 = systemDeriv(state + 0.5 * dt * k2);
    vec4 k4 = systemDeriv(state + dt * k3);
    
    vec4 result = state + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
    
    // Normalize angles to [-π, π]
    result.x = result.x - 6.28318530718 * floor(result.x / 6.28318530718 + 0.5);
    result.z = result.z - 6.28318530718 * floor(result.z / 6.28318530718 + 0.5);
    
    return result;
}

void main() {
    vec4 state = texture(u_perturbedState, v_uv);
    vec4 newState = rk4Step(state, u_dt);
    fragColor = newState;
}
