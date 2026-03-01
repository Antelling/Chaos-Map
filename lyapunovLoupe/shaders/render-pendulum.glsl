#version 300 es
precision highp float;

uniform sampler2D u_stateTexture;
uniform sampler2D u_trajectoryTexture;
uniform vec2 u_resolution;
uniform vec2 u_origin;
uniform float u_scale;

in vec2 v_uv;
out vec4 fragColor;

float circleSDF(vec2 p, float r) {
  return length(p) - r;
}

float lineSegmentSDF(vec2 p, vec2 a, vec2 b) {
  vec2 ba = b - a;
  vec2 pa = p - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - h * ba);
}

void main() {
  vec2 pixelCoord = gl_FragCoord.xy;
  vec2 worldPos = (pixelCoord - u_origin) / u_scale;

  vec4 state = texture(u_stateTexture, v_uv);
  float theta1 = state.x;
  float theta2 = state.z;

  float L1 = 1.0;
  float L2 = 1.0;

  vec2 pivot = vec2(0.0, 0.0);
  vec2 mass1Pos = vec2(L1 * sin(theta1), -L1 * cos(theta1));
  vec2 mass2Pos = mass1Pos + vec2(L2 * sin(theta2), -L2 * cos(theta2));

  float dPivot = circleSDF(worldPos - pivot, 0.05);
  float dMass1 = circleSDF(worldPos - mass1Pos, 0.08);
  float dMass2 = circleSDF(worldPos - mass2Pos, 0.08);
  float dRod1 = lineSegmentSDF(worldPos, pivot, mass1Pos);
  float dRod2 = lineSegmentSDF(worldPos, mass1Pos, mass2Pos);

  vec3 color = vec3(0.05, 0.05, 0.05);

  float rodWidth = 0.02;
  if (dRod1 < rodWidth) {
    float t = smoothstep(rodWidth, rodWidth * 0.5, abs(dRod1));
    color = mix(color, vec3(0.6, 0.6, 0.6), t);
  }
  if (dRod2 < rodWidth) {
    float t = smoothstep(rodWidth, rodWidth * 0.5, abs(dRod2));
    color = mix(color, vec3(0.6, 0.6, 0.6), t);
  }

  if (dPivot < 0.05) {
    float t = smoothstep(0.05, 0.03, dPivot);
    color = mix(color, vec3(0.3, 0.3, 0.3), t);
  }

  if (dMass1 < 0.08) {
    float t = smoothstep(0.08, 0.05, dMass1);
    color = mix(color, vec3(0.9, 0.4, 0.4), t);
  }

  if (dMass2 < 0.08) {
    float t = smoothstep(0.08, 0.05, dMass2);
    color = mix(color, vec3(0.4, 0.9, 0.4), t);
  }

  fragColor = vec4(color, 1.0);
}
