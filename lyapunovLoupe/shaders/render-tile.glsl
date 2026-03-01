// Tile Rendering Shader - WebGL1 Compatible
// Maps FTLE values to colors using various colormaps
// This shader does NOT compute physics - only renders pre-computed FTLE values

// ============================================================================
// VERTEX SHADER
// ============================================================================
/*
attribute vec2 a_position;
varying vec2 v_texCoord;

void main() {
    v_texCoord = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
*/

// ============================================================================
// FRAGMENT SHADER
// ============================================================================
#version 100
precision highp float;

uniform sampler2D u_ftleTexture;
uniform int u_colorMode;
uniform float u_minFtle;
uniform float u_maxFtle;
uniform int u_ftleChannel;  // 0 = .r (RK4), 3 = .a (Verlet)
uniform int u_integrationSteps;
uniform float u_dt;
uniform bool u_isAccumulated;

varying vec2 v_texCoord;

// HSV to RGB conversion for rainbow colormap
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Viridis colormap - perceptually uniform, colorblind friendly
vec3 colormapViridis(float t) {
    return mix(
        mix(vec3(0.267, 0.004, 0.329), vec3(0.282, 0.140, 0.458), t * 4.0),
        mix(vec3(0.324, 0.467, 0.580), vec3(0.993, 0.906, 0.144), (t - 0.5) * 2.0),
        step(0.5, t)
    );
}

// Magma colormap - dark to bright, good for dark backgrounds
vec3 colormapMagma(float t) {
    return mix(
        mix(vec3(0.001, 0.000, 0.013), vec3(0.405, 0.125, 0.425), t * 3.0),
        mix(vec3(0.829, 0.287, 0.356), vec3(0.987, 0.991, 0.745), (t - 0.5) * 2.0),
        step(0.5, t)
    );
}

// Jet/Rainbow colormap - classic scientific visualization
vec3 colormapRainbow(float t) {
    vec3 a = vec3(0.0, 0.0, 0.5);
    vec3 b = vec3(0.0, 0.5, 1.0);
    vec3 c = vec3(0.5, 1.0, 0.5);
    vec3 d = vec3(1.0, 0.5, 0.0);
    vec3 e = vec3(1.0, 0.0, 0.0);

    vec3 result;
    result.r = mix(a.r, b.r, t * 4.0);
    result.g = mix(a.g, b.g, t * 4.0);
    result.b = mix(a.b, b.b, t * 4.0);

    if (t >= 0.25) {
        result.r = mix(b.r, c.r, (t - 0.25) * 4.0);
        result.g = mix(b.g, c.g, (t - 0.25) * 4.0);
        result.b = mix(b.b, c.b, (t - 0.25) * 4.0);
    }
    if (t >= 0.5) {
        result.r = mix(c.r, d.r, (t - 0.5) * 4.0);
        result.g = mix(c.g, d.g, (t - 0.5) * 4.0);
        result.b = mix(c.b, d.b, (t - 0.5) * 4.0);
    }
    if (t >= 0.75) {
        result.r = mix(d.r, e.r, (t - 0.75) * 4.0);
        result.g = mix(d.g, e.g, (t - 0.75) * 4.0);
        result.b = mix(d.b, e.b, (t - 0.75) * 4.0);
    }

    return result;
}

// Grayscale colormap - simple linear mapping
vec3 colormapGrayscale(float t) {
    return vec3(t);
}

void main() {
    vec4 ftleData = texture2D(u_ftleTexture, v_texCoord);
    float ftle = 0.0;
    
    if (u_isAccumulated) {
        // For accumulated view: R = summed normalized FTLE, G = frame count
        float accumulatedFtle = (u_ftleChannel == 3) ? ftleData.a : ftleData.r;
        float frameCount = ftleData.g;
        if (frameCount > 0.0) {
            ftle = accumulatedFtle / frameCount;
        }
    } else {
        // For instant view: R = avgLogGrowth, G = numSamples
        float avgLogGrowth = (u_ftleChannel == 3) ? ftleData.a : ftleData.r;
        float numSamples = ftleData.g;
        float totalTime = float(u_integrationSteps) * u_dt;
        if (numSamples > 0.0 && totalTime > 0.0) {
            ftle = avgLogGrowth / numSamples / totalTime;
        }
    }
    
    // Normalize FTLE value to [0, 1] range
    float range = u_maxFtle - u_minFtle + 1e-6;
    float normalized = clamp((ftle - u_minFtle) / range, 0.0, 1.0);
    
    // Apply colormap based on u_colorMode
    vec3 color;
    if (u_colorMode == 0) {
        // Viridis - perceptually uniform
        color = colormapViridis(normalized);
    } else if (u_colorMode == 1) {
        // Magma - dark to bright
        color = colormapMagma(normalized);
    } else if (u_colorMode == 2) {
        // Rainbow/Jet - classic scientific
        color = colormapRainbow(normalized);
    } else if (u_colorMode == 3) {
        // Grayscale
        color = colormapGrayscale(normalized);
    } else {
        // HSV rainbow fallback
        color = hsv2rgb(vec3(0.7 * (1.0 - normalized), 1.0, 1.0));
    }
    
    gl_FragColor = vec4(color, 1.0);
}
