#version 300 es
precision highp float;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 randGaussian(vec2 co) {
  float u1 = rand(co);
  float u2 = rand(co + 100.0);

  float z0 = sqrt(-2.0 * log(u1)) * cos(2.0 * 3.14159 * u2);
  float z1 = sqrt(-2.0 * log(u1)) * sin(2.0 * 3.14159 * u2);
  float z2 = sqrt(-2.0 * log(rand(co + 200.0))) * cos(2.0 * 3.14159 * rand(co + 300.0));

  return vec3(z0, z1, z2);
}
