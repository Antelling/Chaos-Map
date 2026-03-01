#version 300 es
precision highp float;

uniform sampler2D u_trajectoryTexture;
uniform int u_trajectoryLength;
uniform vec2 u_minDomain;
uniform vec2 u_maxDomain;

in vec2 v_uv;
out vec4 fragColor;

void main() {
  vec2 pos = v_uv * (u_maxDomain - u_minDomain) + u_minDomain;

  vec3 color = vec3(0.1);

  for (int i = 0; i < 100; i++) {
    if (i >= u_trajectoryLength) break;

    vec4 point = texelFetch(u_trajectoryTexture, ivec2(i, 0), 0);
    vec2 trajPos = point.xy;

    float d = distance(pos, trajPos);
    float radius = 0.02 * (u_maxDomain.x - u_minDomain.x);
    float alpha = exp(-d * d / (radius * radius)) * (1.0 - float(i) / float(u_trajectoryLength));

    color += vec3(1.0, 0.6, 0.2) * alpha * 0.1;
  }

  color = clamp(color, 0.0, 1.0);

  fragColor = vec4(color, 1.0);
}
