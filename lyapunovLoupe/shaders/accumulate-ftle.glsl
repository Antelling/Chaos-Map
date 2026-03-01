#version 300 es
precision highp float;

uniform sampler2D u_currentFtle;
uniform sampler2D u_accumulatedFtle;
uniform bool u_reset;
uniform int u_actualIterations;
uniform float u_dt;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Sample current frame's raw FTLE data
  vec4 currentData = texture(u_currentFtle, v_uv);
  float maxLogGrowth = currentData.r;
  float hasValidData = currentData.g;
  
  // Compute FTLE for this frame (max growth rate normalized by time)
  float totalTime = float(u_actualIterations) * u_dt;
  float currentFtle = 0.0;
  if (hasValidData > 0.0 && totalTime > 0.0) {
    currentFtle = maxLogGrowth / totalTime;  // FTLE = max growth / time
  }
  
  // Sample accumulated value from previous frames
  vec4 accumulated = texture(u_accumulatedFtle, v_uv);
  
  float newAccumulated;
  
  if (u_reset) {
    // Start fresh with current normalized FTLE value
    newAccumulated = currentFtle;
  } else {
    // Additive accumulation: new = old + current (now both are normalized FTLE)
    newAccumulated = accumulated.r + currentFtle;
  }
  
  // Output accumulated normalized FTLE in R channel
  // G channel now stores frame count for averaging (1 for reset, increment otherwise)
  float frameCount = u_reset ? 1.0 : accumulated.g + 1.0;
  fragColor = vec4(newAccumulated, frameCount, 0.0, 0.0);
}
