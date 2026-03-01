#version 300 es
precision highp float;

vec4 systemDeriv(vec4 state, vec4 params) {
  float x = state.x;
  float v = state.y;
  float t = state.z;

  float alpha = params.x;
  float beta = params.y;
  float gamma = params.z;
  float delta = params.w;
  float omega = 0.5;

  float a = -delta * v - alpha * x - beta * x * x * x + gamma * cos(omega * t);

  return vec4(v, a, 1.0, 0.0);
}
