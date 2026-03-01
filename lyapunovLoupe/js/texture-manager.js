export class TextureManager {
  constructor(gl) {
    this.gl = gl;
    this.colorBufferFloatExt = gl.getExtension('EXT_color_buffer_float');
    this.floatRenderable = false;
    this.detectFloatRenderSupport();
  }

  detectFloatRenderSupport() {
    const gl = this.gl;
    
    const testFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, testFb);
    
    const testTex = gl.createTexture();
    
    const tryFormat = (internalFormat, type, name) => {
      gl.bindTexture(gl.TEXTURE_2D, testTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 1, 1, 0, gl.RGBA, type, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, testTex, 0);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      return status === gl.FRAMEBUFFER_COMPLETE;
    };
    
    if (tryFormat(gl.RGBA32F, gl.FLOAT, 'RGBA32F')) {
      this.floatFormat = gl.RGBA32F;
      this.floatType = gl.FLOAT;
      this.floatRenderable = true;
      console.log('Float render target: RGBA32F supported');
    } else if (tryFormat(gl.RGBA16F, gl.HALF_FLOAT, 'RGBA16F')) {
      this.floatFormat = gl.RGBA16F;
      this.floatType = gl.HALF_FLOAT;
      this.floatRenderable = true;
      console.log('Float render target: RGBA16F supported (half precision)');
    } else if (tryFormat(gl.RGBA16F, gl.FLOAT, 'RGBA16F+FLOAT')) {
      this.floatFormat = gl.RGBA16F;
      this.floatType = gl.FLOAT;
      this.floatRenderable = true;
      console.log('Float render target: RGBA16F with FLOAT type supported');
    } else {
      console.error('No float render target supported - this GPU may not support lyapunovLoupe');
    }
    
    gl.deleteTexture(testTex);
    gl.deleteFramebuffer(testFb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  createFloatTexture(width, height, data = null) {
    const texture = this.gl.createTexture();

    const internalFormat = this.floatFormat || this.gl.RGBA16F;
    let type = this.floatType || this.gl.FLOAT;
    
    if (data && type === this.gl.HALF_FLOAT) {
      type = this.gl.FLOAT;
    }
    
    const formatName = internalFormat === this.gl.RGBA32F ? 'RGBA32F' : 'RGBA16F';
    const typeName = type === this.gl.FLOAT ? 'FLOAT' : 'HALF_FLOAT';
    console.log(`Creating ${width}x${height} float texture: ${formatName}/${typeName}, id:`, texture);

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.bindBuffer(this.gl.PIXEL_UNPACK_BUFFER, null);

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      internalFormat,
      width,
      height,
      0,
      this.gl.RGBA,
      type,
      data
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);

    return texture;
  }

  createAccumulationTexture(width, height) {
    return this.createFloatTexture(width, height, null);
  }

  createFloatTextureFromData(width, height, data) {
    return this.createFloatTexture(width, height, data);
  }

  createFloatTextureArray(width, height, depth) {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, texture);
    this.gl.texImage3D(
      this.gl.TEXTURE_2D_ARRAY,
      0,
      this.gl.RGBA32F,
      width,
      height,
      depth,
      0,
      this.gl.RGBA,
      this.gl.FLOAT,
      null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D_ARRAY, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D_ARRAY, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D_ARRAY, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D_ARRAY, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D_ARRAY, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
    this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, null);

    return texture;
  }

  createTileTexture(width, height) {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    return texture;
  }

  deleteTileTexture(texture) {
    this.deleteTexture(texture);
  }

  deleteTexture(texture) {
    if (texture) {
      this.gl.deleteTexture(texture);
    }
  }
}

export class FramebufferManager {
  constructor(gl, textureManager) {
    this.gl = gl;
    this.textureManager = textureManager;
    this.framebuffers = new Map();
  }

  createFramebuffer(name, width, height, attachments) {
    const framebuffer = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);

    const textures = {};

    attachments.forEach((attachment, index) => {
      const texture = this.textureManager.createFloatTexture(width, height);
      textures[`color${index}`] = texture;

      this.gl.framebufferTexture2D(
        this.gl.FRAMEBUFFER,
        this.gl.COLOR_ATTACHMENT0 + index,
        this.gl.TEXTURE_2D,
        texture,
        0
      );
    });

    if (this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER) !== this.gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Framebuffer incomplete');
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

    this.framebuffers.set(name, { framebuffer, textures, width, height });
    return { framebuffer, textures };
  }

  getFramebuffer(name) {
    return this.framebuffers.get(name);
  }

  deleteFramebuffer(name) {
    const fb = this.framebuffers.get(name);
    if (fb) {
      Object.values(fb.textures).forEach(texture => this.textureManager.deleteTexture(texture));
      this.gl.deleteFramebuffer(fb.framebuffer);
      this.framebuffers.delete(name);
    }
  }

  deleteAll() {
    this.framebuffers.forEach((fb, name) => this.deleteFramebuffer(name));
  }
}

export class PingPongBuffers {
  constructor(gl, textureManager, width, height, numBuffers = 2, numColorAttachments = 3) {
    this.gl = gl;
    this.textureManager = textureManager;
    this.width = width;
    this.height = height;
    this.numColorAttachments = numColorAttachments;
    this.buffers = [];

    for (let i = 0; i < numBuffers; i++) {
      this.buffers.push(this.createFramebuffer(i));
    }

    this.readIndex = 0;
    this.writeIndex = 1;
  }

  getFramebufferStatusName(status) {
    const names = {
      [this.gl.FRAMEBUFFER_COMPLETE]: 'COMPLETE',
      [this.gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT]: 'INCOMPLETE_ATTACHMENT',
      [this.gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT]: 'INCOMPLETE_MISSING_ATTACHMENT',
      [this.gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS]: 'INCOMPLETE_DIMENSIONS',
      [this.gl.FRAMEBUFFER_UNSUPPORTED]: 'UNSUPPORTED'
    };
    return names[status] || 'UNKNOWN';
  }

  createFramebuffer(index) {
    const gl = this.gl;
    const framebuffer = gl.createFramebuffer();
    
    if (!framebuffer) {
      throw new Error('Failed to create framebuffer object');
    }
    
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    
    const bindError = gl.getError();
    if (bindError !== gl.NO_ERROR) {
      console.error('WebGL error after binding framebuffer:', bindError);
    }

    const textures = {};
    for (let i = 0; i < this.numColorAttachments; i++) {
      textures[`color${i}`] = this.textureManager.createFloatTexture(this.width, this.height);
      
      if (!textures[`color${i}`]) {
        throw new Error(`Failed to create texture color${i}`);
      }
      
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + i,
        gl.TEXTURE_2D,
        textures[`color${i}`],
        0
      );
      
      const attachError = gl.getError();
      if (attachError !== gl.NO_ERROR) {
        console.error(`WebGL error after attaching texture ${i}:`, attachError);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    
    console.log(`Framebuffer ${index} status: 0x${status.toString(16)} (expected 0x8CD5)`);
    
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      const statusName = this.getFramebufferStatusName(status);
      const glError = gl.getError();
      console.error('Additional GL error:', glError);
      throw new Error(`Framebuffer ${index} incomplete: ${statusName} (0x${status.toString(16)}), GL error: ${glError}`);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { framebuffer, textures };
  }

  swap() {
    const tmp = this.readIndex;
    this.readIndex = this.writeIndex;
    this.writeIndex = tmp;
  }

  getRead() {
    return this.buffers[this.readIndex];
  }

  getWrite() {
    return this.buffers[this.writeIndex];
  }

  resize(width, height) {
    this.width = width;
    this.height = height;

    this.buffers.forEach((buffer, index) => {
      this.gl.deleteFramebuffer(buffer.framebuffer);
      Object.values(buffer.textures).forEach(texture => this.textureManager.deleteTexture(texture));
      this.buffers[index] = this.createFramebuffer(index);
    });
  }

  cleanup() {
    this.buffers.forEach(buffer => {
      this.gl.deleteFramebuffer(buffer.framebuffer);
      Object.values(buffer.textures).forEach(texture => this.textureManager.deleteTexture(texture));
    });
    this.buffers = [];
  }
}
