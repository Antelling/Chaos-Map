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
  float k = params.x;
  float L2_rest = params.y;
  float g = 9.81;

  // Position of second bob relative to first bob (in Cartesian)
  // First bob is at: (L1*sin(theta1), -L1*cos(theta1)) if y is up
  // But here we use: x = L*sin(theta), y = L*cos(theta) (y down)
  float x1 = L1 * sin(theta1);
  float y1 = L1 * cos(theta1);

  // Second bob position relative to pivot
  float x2 = x1 + L2_rest * sin(theta2);
  float y2 = y1 + L2_rest * cos(theta2);

  // Spring extension is based on angle difference and geometry
  // For small spring approximation, we compute the effective spring force
  float delta = theta1 - theta2;
  float sinDelta = sin(delta);
  float cosDelta = cos(delta);

  // Spring length depends on geometry: chord length between two angles at distance L2_rest
  float springExtension = L2_rest * sqrt(2.0 - 2.0 * cosDelta);
  float springForce = k * springExtension;

  // Standard double pendulum denominator
  float alphaDenom = m1 + m2 * sinDelta * sinDelta;

  // Elastic pendulum modifications to standard double pendulum equations
  // The spring provides a restoring torque
  float num1 = -m2 * L1 * omega1 * omega1 * sinDelta * cosDelta
             - m2 * L2_rest * omega2 * omega2 * sinDelta
             - (m1 + m2) * g * sin(theta1)
             + m2 * g * sin(theta2) * cosDelta
             - springForce * L2_rest * sinDelta / L1;

  float num2 = (m1 + m2) * L1 * omega1 * omega1 * sinDelta
             + m2 * L2_rest * omega2 * omega2 * sinDelta * cosDelta
             + (m1 + m2) * g * sin(theta1) * cosDelta
             - (m1 + m2) * g * sin(theta2)
             + (m1 + m2) * springForce * L2_rest * sinDelta / (m2 * L1);

  float alpha1 = num1 / (L1 * alphaDenom);
  float alpha2 = num2 / (L2_rest * alphaDenom);

  return vec4(omega1, alpha1, omega2, alpha2);
}
