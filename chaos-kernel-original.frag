// Original Chaos Map Fragment Shader - WebGL 1.0 Compatible
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_tileOffset;
uniform vec2 u_tileSize;
uniform float u_l1;
uniform float u_l2;
uniform float u_m1;
uniform float u_m2;
uniform float u_g;
uniform float u_dt;
uniform int u_maxIter;
uniform float u_threshold;
uniform float u_perturbation;
uniform int u_mode;
uniform vec4 u_fixedState;
uniform float u_velocityScale;

const float PI = 3.14159265359;
const int MAX_ITERATIONS = 10000;

struct State {
    float theta1;
    float theta2;
    float omega1;
    float omega2;
};

void computeAccelerations(State s, out float alpha1, out float alpha2) {
    float M = u_m1 + u_m2;
    float delta = s.theta1 - s.theta2;
    float sinDelta = sin(delta);
    float cosDelta = cos(delta);
    
    float alpha_denom = u_m1 + u_m2 * sinDelta * sinDelta;
    
    float num1 = -u_m2 * u_l1 * s.omega1 * s.omega1 * sinDelta * cosDelta
               - u_m2 * u_l2 * s.omega2 * s.omega2 * sinDelta
               - M * u_g * sin(s.theta1)
               + u_m2 * u_g * sin(s.theta2) * cosDelta;
    
    float num2 = M * u_l1 * s.omega1 * s.omega1 * sinDelta
               + u_m2 * u_l2 * s.omega2 * s.omega2 * sinDelta * cosDelta
               + M * u_g * sin(s.theta1) * cosDelta
               - M * u_g * sin(s.theta2);
    
    alpha1 = num1 / (u_l1 * alpha_denom);
    alpha2 = num2 / (u_l2 * alpha_denom);
}

State stepPhysicsRK4(State s) {
    State k1, k2, k3, k4, temp;
    float dt = u_dt;
    
    computeAccelerations(s, k1.omega1, k1.omega2);
    k1.theta1 = s.omega1;
    k1.theta2 = s.omega2;
    
    temp.theta1 = s.theta1 + 0.5 * dt * k1.theta1;
    temp.theta2 = s.theta2 + 0.5 * dt * k1.theta2;
    temp.omega1 = s.omega1 + 0.5 * dt * k1.omega1;
    temp.omega2 = s.omega2 + 0.5 * dt * k1.omega2;
    computeAccelerations(temp, k2.omega1, k2.omega2);
    k2.theta1 = temp.omega1;
    k2.theta2 = temp.omega2;
    
    temp.theta1 = s.theta1 + 0.5 * dt * k2.theta1;
    temp.theta2 = s.theta2 + 0.5 * dt * k2.theta2;
    temp.omega1 = s.omega1 + 0.5 * dt * k2.omega1;
    temp.omega2 = s.omega2 + 0.5 * dt * k2.omega2;
    computeAccelerations(temp, k3.omega1, k3.omega2);
    k3.theta1 = temp.omega1;
    k3.theta2 = temp.omega2;
    
    temp.theta1 = s.theta1 + dt * k3.theta1;
    temp.theta2 = s.theta2 + dt * k3.theta2;
    temp.omega1 = s.omega1 + dt * k3.omega1;
    temp.omega2 = s.omega2 + dt * k3.omega2;
    computeAccelerations(temp, k4.omega1, k4.omega2);
    k4.theta1 = temp.omega1;
    k4.theta2 = temp.omega2;
    
    State next;
    next.theta1 = s.theta1 + dt * (k1.theta1 + 2.0 * k2.theta1 + 2.0 * k3.theta1 + k4.theta1) / 6.0;
    next.theta2 = s.theta2 + dt * (k1.theta2 + 2.0 * k2.theta2 + 2.0 * k3.theta2 + k4.theta2) / 6.0;
    next.omega1 = s.omega1 + dt * (k1.omega1 + 2.0 * k2.omega1 + 2.0 * k3.omega1 + k4.omega1) / 6.0;
    next.omega2 = s.omega2 + dt * (k1.omega2 + 2.0 * k2.omega2 + 2.0 * k3.omega2 + k4.omega2) / 6.0;
    
    return next;
}

float circularDiff(float a, float b) {
    float d = a - b;
    if (d > PI) d -= 2.0 * PI;
    if (d < -PI) d += 2.0 * PI;
    return d;
}

float measureDivergence(State s1, State s2) {
    float dTheta = circularDiff(s1.theta1, s2.theta1);
    float dTheta2 = circularDiff(s1.theta2, s2.theta2);
    float dOmega = s1.omega1 - s2.omega1;
    float dOmega2 = s1.omega2 - s2.omega2;
    return sqrt(dTheta * dTheta + dTheta2 * dTheta2 + dOmega * dOmega + dOmega2 * dOmega2);
}

void main() {
    vec2 fragCoord = vec2(gl_FragCoord.x, u_tileSize.y - gl_FragCoord.y);
    vec2 pixelCoord = fragCoord + u_tileOffset;
    vec2 normalizedCoord = pixelCoord / u_resolution;
    
    State s1, s2;
    
    if (u_mode == 0) {
        s1.theta1 = (normalizedCoord.x * 2.0 - 1.0) * PI;
        s1.theta2 = (normalizedCoord.y * 2.0 - 1.0) * PI;
        s1.omega1 = 0.0;
        s1.omega2 = 0.0;
    } else {
        s1.theta1 = u_fixedState.x;
        s1.theta2 = u_fixedState.y;
        s1.omega1 = (normalizedCoord.x * 2.0 - 1.0) * u_velocityScale;
        s1.omega2 = (normalizedCoord.y * 2.0 - 1.0) * u_velocityScale;
    }
    
    s2 = s1;
    s2.omega1 += u_perturbation;
    s2.omega2 += u_perturbation * 0.7;
    
    int divergenceIter = u_maxIter;
    bool diverged = false;
    
    for (int i = 0; i < MAX_ITERATIONS; i++) {
        if (i >= u_maxIter) break;
        
        s1 = stepPhysicsRK4(s1);
        s2 = stepPhysicsRK4(s2);
        
        float dist = measureDivergence(s1, s2);
        
        if (dist > u_threshold && !diverged) {
            divergenceIter = i;
            diverged = true;
            break;
        }
    }
    
    vec3 color;
    if (!diverged) {
        color = vec3(1.0, 1.0, 1.0);
    } else {
        float t = float(divergenceIter) / float(u_maxIter);
        float hue = (1.0 - t) * 0.85;
        float c = 1.0;
        float x = c * (1.0 - abs(mod(hue * 6.0, 2.0) - 1.0));
        float m = 0.0;
        
        vec3 rgb;
        if (hue < 1.0/6.0) rgb = vec3(c, x, 0.0);
        else if (hue < 2.0/6.0) rgb = vec3(x, c, 0.0);
        else if (hue < 3.0/6.0) rgb = vec3(0.0, c, x);
        else if (hue < 4.0/6.0) rgb = vec3(0.0, x, c);
        else if (hue < 5.0/6.0) rgb = vec3(x, 0.0, c);
        else rgb = vec3(c, 0.0, x);
        
        color = rgb + m;
    }
    
    gl_FragColor = vec4(color, 1.0);
}
