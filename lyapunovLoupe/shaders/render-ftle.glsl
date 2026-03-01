#version 300 es
precision highp float;

uniform sampler2D u_ftleTexture;
uniform int u_colorMode;
uniform int u_valueMapping;
uniform float u_mappingMin;
uniform float u_mappingMax;
uniform float u_mappingPeriod;
uniform bool u_isAccumulated;
uniform bool u_isThreshold;
uniform bool u_isBob2Distance;
uniform bool u_isDivergenceTime;
uniform int u_accumulatedFrameCount;
uniform int u_integrationSteps;
uniform float u_dt;

in vec2 v_uv;
out vec4 fragColor;

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

float applyMapping(float value) {
  float range = u_mappingMax - u_mappingMin;
  if (range < 1e-6) return 0.0;

  if (u_valueMapping == 0) {
    return (value - u_mappingMin) / range;
  } else if (u_valueMapping == 1) {
    float v = max(value, 1e-6);
    float minV = max(u_mappingMin, 1e-6);
    float maxV = max(u_mappingMax, minV * 1.001);
    return (log(v) - log(minV)) / (log(maxV) - log(minV));
  } else {
    return fract(value / u_mappingPeriod);
  }
}

void main() {
  vec4 texValue = texture(u_ftleTexture, v_uv);
  float ftle = 0.0;

  if (u_isThreshold) {
    float frameCount = texValue.r;
    float hasValidData = texValue.g;
    if (hasValidData > 0.0) {
      ftle = frameCount;
    }
  } else if (u_isBob2Distance) {
    // Bob2 distance texture format: R=x2, G=y2, B=totalDistance, A=validFlag
    float totalDistance = texValue.b;
    float hasValidData = texValue.a;
    if (hasValidData > 0.0) {
      ftle = totalDistance;
    }
  } else if (u_isDivergenceTime) {
    // Divergence time texture: R=divergenceFrame (0=not diverged), G=maxDistance
    float divergenceFrame = texValue.r;
    if (divergenceFrame > 0.0) {
      ftle = divergenceFrame;
    } else {
      ftle = 0.0;
    }
  } else if (u_isAccumulated) {
    // Accumulated FTLE format: R=accumulatedFtle, G=frameCount
    float accumulatedFtle = texValue.r;
    float frameCount = texValue.g;
    if (frameCount > 0.0) {
      ftle = accumulatedFtle / frameCount;
    }
  } else {
    // Instant FTLE format: R=maxLogGrowth, G=hasValidData
    float maxLogGrowth = texValue.r;
    float hasValidData = texValue.g;
    float totalTime = float(u_integrationSteps) * u_dt;
    if (hasValidData > 0.0 && totalTime > 0.0) {
      ftle = maxLogGrowth / totalTime;
    }
  }

  float norm = clamp(applyMapping(ftle), 0.0, 1.0);
  vec3 color = applyColormap(norm, u_colorMode);

  fragColor = vec4(color, 1.0);
}
