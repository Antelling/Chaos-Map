#version 300 es
precision highp float;

vec4 systemDeriv(vec4 state, vec4 params) {
  float x = state.x;
  float px = state.y;
  float y = state.z;
  float py = state.w;

  float lambda = params.x;

  float dpx = -x - 2.0 * lambda * x * y;
  float dpy = -y - lambda * (x * x - y * y);

  return vec4(px, dpx, py, dpy);
}
