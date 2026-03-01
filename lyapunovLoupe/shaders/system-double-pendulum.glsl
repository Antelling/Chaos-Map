#version 300 es
precision highp float;

vec4 systemDeriv(vec4 state, vec4 params) {
  float theta1 = state.x;
  float omega1 = state.y;
  float theta2 = state.z;
  float omega2 = state.w;

  float m1 = 1.0;
  float m2 = 1.0;
  float L1 = 1.0;
  float L2 = 1.0;
  float g = 9.81;

  float delta = theta1 - theta2;
  float sinDelta = sin(delta);
  float cosDelta = cos(delta);

  float alphaDenom = m1 + m2 * sinDelta * sinDelta;

  float num1 = -m2 * L1 * omega1 * omega1 * sinDelta * cosDelta
             - m2 * L2 * omega2 * omega2 * sinDelta
             - (m1 + m2) * g * sin(theta1)
             + m2 * g * sin(theta2) * cosDelta;

  float num2 = (m1 + m2) * L1 * omega1 * omega1 * sinDelta
             + m2 * L2 * omega2 * omega2 * sinDelta * cosDelta
             + (m1 + m2) * g * sin(theta1) * cosDelta
             - (m1 + m2) * g * sin(theta2);

  float alpha1 = num1 / (L1 * alphaDenom);
  float alpha2 = num2 / (L2 * alphaDenom);

  return vec4(omega1, alpha1, omega2, alpha2);
}
