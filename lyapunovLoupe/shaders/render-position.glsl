#version 300 es
precision highp float;

uniform sampler2D u_stateTexture;
uniform int u_positionMode;  // 0: theta1, 1: theta2, 2: bob1_x, 3: bob1_y, 4: bob2_x, 5: bob2_y
uniform float u_mappingMin;
uniform float u_mappingMax;
uniform int u_valueMapping;
uniform float u_mappingPeriod;

in vec2 v_uv;
out vec4 fragColor;

// System parameters for position calculation
float L1 = 1.0;
float L2 = 1.0;

float normalizeAngle(float a) {
  return a - 6.28318530718 * floor(a / 6.28318530718 + 0.5);
}

float applyMapping(float value) {
  float range = u_mappingMax - u_mappingMin;
  if (range < 1e-6) return 0.0;
  
  if (u_valueMapping == 0) {
    // Linear
    return (value - u_mappingMin) / range;
  } else if (u_valueMapping == 1) {
    // Logarithmic
    float v = max(value, 1e-6);
    float minV = max(u_mappingMin, 1e-6);
    float maxV = max(u_mappingMax, minV * 1.001);
    return (log(v) - log(minV)) / (log(maxV) - log(minV));
  } else {
    // Cyclical
    return fract(value / u_mappingPeriod);
  }
}

// 0: Viridis
vec3 colormapViridis(float t) {
  vec3 c0 = vec3(68.0/255.0, 1.0/255.0, 84.0/255.0);
  vec3 c1 = vec3(33.0/255.0, 145.0/255.0, 140.0/255.0);
  vec3 c2 = vec3(253.0/255.0, 231.0/255.0, 37.0/255.0);
  
  if (t < 0.5) {
    return mix(c0, c1, t * 2.0);
  } else {
    return mix(c1, c2, (t - 0.5) * 2.0);
  }
}

// 1: Magma
vec3 colormapMagma(float t) {
  vec3 c0 = vec3(4.0/255.0, 5.0/255.0, 9.0/255.0);
  vec3 c1 = vec3(148.0/255.0, 52.0/255.0, 110.0/255.0);
  vec3 c2 = vec3(252.0/255.0, 253.0/255.0, 191.0/255.0);
  
  if (t < 0.5) {
    return mix(c0, c1, t * 2.0);
  } else {
    return mix(c1, c2, (t - 0.5) * 2.0);
  }
}

// 2: Plasma
vec3 colormapPlasma(float t) {
  vec3 c0 = vec3(13.0/255.0, 8.0/255.0, 135.0/255.0);
  vec3 c1 = vec3(156.0/255.0, 23.0/255.0, 158.0/255.0);
  vec3 c2 = vec3(240.0/255.0, 249.0/255.0, 33.0/255.0);
  
  if (t < 0.5) {
    return mix(c0, c1, t * 2.0);
  } else {
    return mix(c1, c2, (t - 0.5) * 2.0);
  }
}

// 3: Inferno
vec3 colormapInferno(float t) {
  vec3 c0 = vec3(0.0/255.0, 0.0/255.0, 4.0/255.0);
  vec3 c1 = vec3(187.0/255.0, 55.0/255.0, 84.0/255.0);
  vec3 c2 = vec3(252.0/255.0, 255.0/255.0, 164.0/255.0);
  
  if (t < 0.5) {
    return mix(c0, c1, t * 2.0);
  } else {
    return mix(c1, c2, (t - 0.5) * 2.0);
  }
}

// 4: Turbo
vec3 colormapTurbo(float t) {
  float r = clamp((48.0 + 227.0 * sin((t - 0.5) * 3.14159265)) / 255.0, 0.0, 1.0);
  float g = clamp((t < 0.5 ? t * 400.0 : (1.0 - t) * 400.0) / 255.0, 0.0, 1.0);
  float b = clamp((128.0 + 127.0 * cos(t * 3.14159265)) / 255.0, 0.0, 1.0);
  return vec3(r, g, b);
}

// 5: Jet
vec3 colormapJet(float t) {
  float r = clamp(t < 0.5 ? 0.0 : (t - 0.5) * 2.0, 0.0, 1.0);
  float g = clamp(t < 0.25 ? t * 4.0 : t < 0.75 ? 1.0 : (1.0 - t) * 4.0, 0.0, 1.0);
  float b = clamp(t < 0.5 ? (0.5 - t) * 2.0 : 0.0, 0.0, 1.0);
  return vec3(r, g, b);
}

// 6: Rainbow
vec3 colormapRainbow(float t) {
  float r = clamp(sin(t * 3.14159265 * 2.0) * 0.5 + 0.5, 0.0, 1.0);
  float g = clamp(sin(t * 3.14159265 * 2.0 + 2.0) * 0.5 + 0.5, 0.0, 1.0);
  float b = clamp(sin(t * 3.14159265 * 2.0 + 4.0) * 0.5 + 0.5, 0.0, 1.0);
  return vec3(r, g, b);
}

// 7: Hot
vec3 colormapHot(float t) {
  float r = min(1.0, t * 3.0);
  float g = min(1.0, max(0.0, (t - 0.333) * 3.0));
  float b = min(1.0, max(0.0, (t - 0.666) * 3.0));
  return vec3(r, g, b);
}

// 8: Cool
vec3 colormapCool(float t) {
  return vec3(t, 1.0 - t, 1.0);
}

// 9: Spring
vec3 colormapSpring(float t) {
  return vec3(1.0, t, 1.0 - t);
}

// 10: Summer
vec3 colormapSummer(float t) {
  return vec3(t, 0.5 + t * 0.5, 0.4);
}

// 11: Autumn
vec3 colormapAutumn(float t) {
  return vec3(1.0, t, 0.0);
}

// 12: Winter
vec3 colormapWinter(float t) {
  return vec3(0.0, t, (1.0 - t) * 0.5 + 0.5);
}

// 13: Bone
vec3 colormapBone(float t) {
  float b = min(1.0, t * 1.5);
  return vec3(t, t, b);
}

// 14: Copper
vec3 colormapCopper(float t) {
  return vec3(min(1.0, t * 1.25), t * 0.78, t * 0.5);
}

// 15: Pink
vec3 colormapPink(float t) {
  return vec3(
    1.0 - 0.5 * (1.0 - t),
    1.0 - 0.75 * (1.0 - t),
    1.0 - 0.75 * (1.0 - t)
  );
}

// 16: HSV
vec3 colormapHSV(float t) {
  float r = clamp(abs(mod(t * 6.0, 2.0) - 1.0), 0.0, 1.0);
  float g = clamp(abs(mod(t * 6.0 + 2.0, 2.0) - 1.0), 0.0, 1.0);
  float b = clamp(abs(mod(t * 6.0 + 4.0, 2.0) - 1.0), 0.0, 1.0);
  return vec3(r, g, b);
}

// 17: Twilight
vec3 colormapTwilight(float t) {
  float v = 0.5 + 0.5 * cos(t * 3.14159265 * 2.0);
  return vec3(v, v, 0.5 + 0.25 * v);
}

// 18: Cubehelix
vec3 colormapCubehelix(float t) {
  float a = t * 2.0 * 3.14159265;
  return vec3(
    clamp(0.148 + 0.263 * cos(a) + 0.08 * sin(a), 0.0, 1.0),
    clamp(0.299 + 0.154 * cos(a) + 0.237 * sin(a), 0.0, 1.0),
    clamp(0.466 + 0.127 * cos(a) - 0.312 * sin(a), 0.0, 1.0)
  );
}

// 19: Cividis
vec3 colormapCividis(float t) {
  vec3 c0 = vec3(0.0, 32.0/255.0, 77.0/255.0);
  vec3 c1 = vec3(122.0/255.0, 144.0/255.0, 129.0/255.0);
  vec3 c2 = vec3(1.0, 232.0/255.0, 120.0/255.0);
  
  if (t < 0.5) {
    return mix(c0, c1, t * 2.0);
  } else {
    return mix(c1, c2, (t - 0.5) * 2.0);
  }
}

// Apply colormap based on mode
vec3 applyColormap(float t, int mode) {
  if (mode == 0) return colormapViridis(t);
  else if (mode == 1) return colormapMagma(t);
  else if (mode == 2) return colormapPlasma(t);
  else if (mode == 3) return colormapInferno(t);
  else if (mode == 4) return colormapTurbo(t);
  else if (mode == 5) return colormapJet(t);
  else if (mode == 6) return colormapRainbow(t);
  else if (mode == 7) return colormapHot(t);
  else if (mode == 8) return colormapCool(t);
  else if (mode == 9) return colormapSpring(t);
  else if (mode == 10) return colormapSummer(t);
  else if (mode == 11) return colormapAutumn(t);
  else if (mode == 12) return colormapWinter(t);
  else if (mode == 13) return colormapBone(t);
  else if (mode == 14) return colormapCopper(t);
  else if (mode == 15) return colormapPink(t);
  else if (mode == 16) return colormapHSV(t);
  else if (mode == 17) return colormapTwilight(t);
  else if (mode == 18) return colormapCubehelix(t);
  else if (mode == 19) return colormapCividis(t);
  else return vec3(t, t, t); // grayscale fallback
}

void main() {
  // Sample current state
  vec4 state = texture(u_stateTexture, v_uv);
  float theta1 = state.x;
  float theta2 = state.z;
  
  float value = 0.0;
  
  // Calculate position based on mode
  if (u_positionMode == 0) {
    // Theta 1 (angle 1) - normalize to [-PI, PI] range then map to [0, 1]
    value = (normalizeAngle(theta1) + 3.14159265) / (2.0 * 3.14159265);
  } else if (u_positionMode == 1) {
    // Theta 2 (angle 2)
    value = (normalizeAngle(theta2) + 3.14159265) / (2.0 * 3.14159265);
  } else if (u_positionMode == 2) {
    // Bob 1 X position
    value = (L1 * sin(theta1) + L1) / (2.0 * L1); // Normalize to [0, 1]
  } else if (u_positionMode == 3) {
    // Bob 1 Y position (inverted since y is down in pendulum coordinates)
    value = (-L1 * cos(theta1) + L1) / (2.0 * L1);
  } else if (u_positionMode == 4) {
    // Bob 2 X position
    float x1 = L1 * sin(theta1);
    float x2 = x1 + L2 * sin(theta2);
    value = (x2 + L1 + L2) / (2.0 * (L1 + L2));
  } else if (u_positionMode == 5) {
    // Bob 2 Y position
    float y1 = -L1 * cos(theta1);
    float y2 = y1 - L2 * cos(theta2);
    value = (y2 + L1 + L2) / (2.0 * (L1 + L2));
  } else if (u_positionMode == 6) {
    // Omega 1 (angular velocity 1)
    value = applyMapping(state.y);
  } else if (u_positionMode == 7) {
    // Omega 2 (angular velocity 2)
    value = applyMapping(state.w);
  } else if (u_positionMode == 8) {
    // Total energy approximation (for pendulum systems)
    float omega1 = state.y;
    float omega2 = state.w;
    float m1 = 1.0;
    float m2 = 1.0;
    float g = 9.81;
    
    float y1 = -L1 * cos(theta1);
    float y2 = y1 - L2 * cos(theta2);
    
    float kinetic = 0.5 * m1 * L1 * L1 * omega1 * omega1 + 
                    0.5 * m2 * (L1 * L1 * omega1 * omega1 + L2 * L2 * omega2 * omega2 + 
                               2.0 * L1 * L2 * omega1 * omega2 * cos(theta1 - theta2));
    float potential = m1 * g * y1 + m2 * g * y2;
    float totalEnergy = kinetic + potential;
    
    value = applyMapping(totalEnergy);
  }
  
  // For modes 0-5, value is already normalized to [0, 1]
  // For modes 6-8, applyMapping has already been called
  
  float norm = clamp(value, 0.0, 1.0);
  vec3 color = applyColormap(norm, 0); // Use Viridis by default for position
  
  fragColor = vec4(color, 1.0);
}
