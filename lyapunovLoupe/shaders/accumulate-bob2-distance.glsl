#version 300 es
precision highp float;

uniform sampler2D u_stateTexture;
uniform sampler2D u_accumulatedDistance;
uniform bool u_reset;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  // Sample current state (theta1, omega1, theta2, omega2)
  vec4 state = texture(u_stateTexture, v_uv);
  float theta1 = state.x;
  float theta2 = state.z;
  
  // System parameters (default values)
  float L1 = 1.0;
  float L2 = 1.0;
  
  // Calculate current bob2 position
  float x1 = L1 * sin(theta1);
  float y1 = -L1 * cos(theta1);
  float x2 = x1 + L2 * sin(theta2);
  float y2 = y1 - L2 * cos(theta2);
  
  // Sample accumulated data from previous frame
  vec4 accumulated = texture(u_accumulatedDistance, v_uv);
  float prevX = accumulated.r;
  float prevY = accumulated.g;
  float totalDistance = accumulated.b;
  float hasValidData = accumulated.a;
  
  float newDistance;
  
  if (u_reset || hasValidData < 0.5) {
    // First frame - initialize with zero distance, store current position
    newDistance = 0.0;
  } else {
    // Calculate distance increment from previous position
    float dx = x2 - prevX;
    float dy = y2 - prevY;
    float stepDistance = sqrt(dx * dx + dy * dy);
    newDistance = totalDistance + stepDistance;
  }
  
  // Output: current position (x2, y2) and accumulated distance
  // Alpha channel indicates valid data
  fragColor = vec4(x2, y2, newDistance, 1.0);
}
