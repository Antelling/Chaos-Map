export class ShaderCompiler {
  static createContext(canvas, options = {}) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      ...options
    });

    if (!gl) {
      const experimental = canvas.getContext('experimental-webgl2');
      if (experimental) {
        console.warn('Using experimental-webgl2 context');
        return experimental;
      }
      throw new Error('WebGL2 not supported - browser may have hit context limit or WebGL2 is disabled');
    }

    gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);

    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) {
      console.warn('EXT_color_buffer_float not supported, float rendering may fail');
    }

    gl.colorBufferFloat = ext;
    return gl;
  }

  static compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      const typeName = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      gl.deleteShader(shader);

      const errorDetails = `Shader compilation failed (${typeName}): ${info || 'unknown error'}\nSource:\n${source.substring(0, 1000)}`;
      throw new Error(errorDetails);
    }

    return shader;
  }

  static createProgram(gl, vertexShader, fragmentShader, transformFeedbackVaryings = null) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    if (transformFeedbackVaryings) {
      gl.transformFeedbackVaryings(program, transformFeedbackVaryings, gl.SEPARATE_ATTRIBS);
    }

    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      console.error('Program link failed:');
      console.error('Info log:', info || '(null)');
      gl.deleteProgram(program);
      throw new Error(`Program link error: ${info}`);
    }

    return program;
  }

  static createProgramFromSource(gl, vertexSource, fragmentSource, transformFeedbackVaryings = null) {
    const vertexShader = this.compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    return this.createProgram(gl, vertexShader, fragmentShader, transformFeedbackVaryings);
  }

  static createComputeProgram(gl, computeSource, transformFeedbackVaryings) {
    return this.createProgramFromSource(
      gl,
      computeSource,
      `#version 300 es
precision highp float;
void main() { discard; }`,
      transformFeedbackVaryings
    );
  }

  static getFullscreenQuadVertexShader() {
    return `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;
  }
}
