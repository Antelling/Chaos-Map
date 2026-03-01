export class ColorMaps {
  static colormap(t, mode) {
    switch (mode) {
      case 0: return this.viridis(t);
      case 1: return this.magma(t);
      case 2: return this.plasma(t);
      case 3: return this.inferno(t);
      case 4: return this.turbo(t);
      case 5: return this.jet(t);
      case 6: return this.rainbow(t);
      case 7: return this.hot(t);
      case 8: return this.cool(t);
      case 9: return this.spring(t);
      case 10: return this.summer(t);
      case 11: return this.autumn(t);
      case 12: return this.winter(t);
      case 13: return this.bone(t);
      case 14: return this.copper(t);
      case 15: return this.pink(t);
      case 16: return this.hsv(t);
      case 17: return this.twilight(t);
      case 18: return this.cubehelix(t);
      case 19: return this.cividis(t);
      default: return [Math.floor(t * 255), Math.floor(t * 255), Math.floor(t * 255)];
    }
  }

  static viridis(t) {
    const c0 = [68, 1, 84];
    const c1 = [33, 145, 140];
    const c2 = [253, 231, 37];

    if (t < 0.5) {
      const s = t * 2;
      return [
        Math.floor(c0[0] + (c1[0] - c0[0]) * s),
        Math.floor(c0[1] + (c1[1] - c0[1]) * s),
        Math.floor(c0[2] + (c1[2] - c0[2]) * s)
      ];
    } else {
      const s = (t - 0.5) * 2;
      return [
        Math.floor(c1[0] + (c2[0] - c1[0]) * s),
        Math.floor(c1[1] + (c2[1] - c1[1]) * s),
        Math.floor(c1[2] + (c2[2] - c1[2]) * s)
      ];
    }
  }

  static magma(t) {
    const c0 = [4, 5, 9];
    const c1 = [148, 52, 110];
    const c2 = [252, 253, 191];

    if (t < 0.5) {
      const s = t * 2;
      return [
        Math.floor(c0[0] + (c1[0] - c0[0]) * s),
        Math.floor(c0[1] + (c1[1] - c0[1]) * s),
        Math.floor(c0[2] + (c1[2] - c0[2]) * s)
      ];
    } else {
      const s = (t - 0.5) * 2;
      return [
        Math.floor(c1[0] + (c2[0] - c1[0]) * s),
        Math.floor(c1[1] + (c2[1] - c1[1]) * s),
        Math.floor(c1[2] + (c2[2] - c1[2]) * s)
      ];
    }
  }

  static plasma(t) {
    const c0 = [13, 8, 135];
    const c1 = [156, 23, 158];
    const c2 = [240, 249, 33];

    if (t < 0.5) {
      const s = t * 2;
      return [
        Math.floor(c0[0] + (c1[0] - c0[0]) * s),
        Math.floor(c0[1] + (c1[1] - c0[1]) * s),
        Math.floor(c0[2] + (c1[2] - c0[2]) * s)
      ];
    } else {
      const s = (t - 0.5) * 2;
      return [
        Math.floor(c1[0] + (c2[0] - c1[0]) * s),
        Math.floor(c1[1] + (c2[1] - c1[1]) * s),
        Math.floor(c1[2] + (c2[2] - c1[2]) * s)
      ];
    }
  }

  static inferno(t) {
    const c0 = [0, 0, 4];
    const c1 = [187, 55, 84];
    const c2 = [252, 255, 164];

    if (t < 0.5) {
      const s = t * 2;
      return [
        Math.floor(c0[0] + (c1[0] - c0[0]) * s),
        Math.floor(c0[1] + (c1[1] - c0[1]) * s),
        Math.floor(c0[2] + (c1[2] - c0[2]) * s)
      ];
    } else {
      const s = (t - 0.5) * 2;
      return [
        Math.floor(c1[0] + (c2[0] - c1[0]) * s),
        Math.floor(c1[1] + (c2[1] - c1[1]) * s),
        Math.floor(c1[2] + (c2[2] - c1[2]) * s)
      ];
    }
  }

  static turbo(t) {
    const r = Math.floor(Math.max(0, Math.min(255, 48 + 227 * Math.sin((t - 0.5) * Math.PI))));
    const g = Math.floor(Math.max(0, Math.min(255, t < 0.5 ? t * 400 : (1 - t) * 400)));
    const b = Math.floor(Math.max(0, Math.min(255, 128 + 127 * Math.cos(t * Math.PI))));
    return [r, g, b];
  }

  static jet(t) {
    const r = Math.floor(Math.max(0, Math.min(255, t < 0.5 ? 0 : (t - 0.5) * 510)));
    const g = Math.floor(Math.max(0, Math.min(255, t < 0.25 ? t * 1020 : t < 0.75 ? 255 : (1 - t) * 1020)));
    const b = Math.floor(Math.max(0, Math.min(255, t < 0.5 ? (0.5 - t) * 510 : 0)));
    return [r, g, b];
  }

  static rainbow(t) {
    const r = Math.floor(Math.max(0, Math.min(255, Math.sin(t * Math.PI * 2) * 127 + 128)));
    const g = Math.floor(Math.max(0, Math.min(255, Math.sin(t * Math.PI * 2 + 2) * 127 + 128)));
    const b = Math.floor(Math.max(0, Math.min(255, Math.sin(t * Math.PI * 2 + 4) * 127 + 128)));
    return [r, g, b];
  }

  static hot(t) {
    return [
      Math.floor(Math.min(255, t * 3 * 255)),
      Math.floor(Math.min(255, Math.max(0, (t - 0.33) * 3 * 255))),
      Math.floor(Math.min(255, Math.max(0, (t - 0.66) * 3 * 255)))
    ];
  }

  static cool(t) {
    return [
      Math.floor(t * 255),
      Math.floor((1 - t) * 255),
      255
    ];
  }

  static spring(t) {
    return [255, Math.floor(t * 255), Math.floor((1 - t) * 255)];
  }

  static summer(t) {
    return [Math.floor(t * 255), Math.floor(0.5 + t * 0.5) * 255, Math.floor(0.4 * 255)];
  }

  static autumn(t) {
    return [255, Math.floor(t * 255), 0];
  }

  static winter(t) {
    return [0, Math.floor(t * 255), Math.floor((1 - t) * 127 + 128)];
  }

  static bone(t) {
    const v = Math.floor(t * 255);
    const b = Math.floor(Math.min(255, t * 1.5 * 255));
    return [v, v, b];
  }

  static copper(t) {
    const r = Math.floor(Math.min(255, t * 1.25 * 255));
    const g = Math.floor(t * 0.78 * 255);
    const b = Math.floor(t * 0.5 * 255);
    return [r, g, b];
  }

  static pink(t) {
    const v = Math.floor(t * 255);
    return [
      Math.floor(255 - 0.5 * (255 - v)),
      Math.floor(255 - 0.75 * (255 - v)),
      Math.floor(255 - 0.75 * (255 - v))
    ];
  }

  static hsv(t) {
    const r = Math.floor(Math.max(0, Math.min(255, Math.abs((t * 6) % 2 - 1) * 255)));
    const g = Math.floor(Math.max(0, Math.min(255, Math.abs(((t * 6 + 2) % 2 - 1)) * 255)));
    const b = Math.floor(Math.max(0, Math.min(255, Math.abs(((t * 6 + 4) % 2 - 1)) * 255)));
    return [r, g, b];
  }

  static twilight(t) {
    const v = 0.5 + 0.5 * Math.cos(t * Math.PI * 2);
    const c = Math.floor(v * 255);
    return [c, c, Math.floor(128 + 64 * v)];
  }

  static cubehelix(t) {
    const a = t * 2 * Math.PI;
    const r = Math.floor(255 * (0.148 + 0.263 * Math.cos(a) + 0.08 * Math.sin(a)));
    const g = Math.floor(255 * (0.299 + 0.154 * Math.cos(a) + 0.237 * Math.sin(a)));
    const b = Math.floor(255 * (0.466 + 0.127 * Math.cos(a) - 0.312 * Math.sin(a)));
    return [
      Math.max(0, Math.min(255, r)),
      Math.max(0, Math.min(255, g)),
      Math.max(0, Math.min(255, b))
    ];
  }

  static cividis(t) {
    const c0 = [0, 32, 77];
    const c1 = [122, 144, 129];
    const c2 = [255, 232, 120];

    if (t < 0.5) {
      const s = t * 2;
      return [
        Math.floor(c0[0] + (c1[0] - c0[0]) * s),
        Math.floor(c0[1] + (c1[1] - c0[1]) * s),
        Math.floor(c0[2] + (c1[2] - c0[2]) * s)
      ];
    } else {
      const s = (t - 0.5) * 2;
      return [
        Math.floor(c1[0] + (c2[0] - c1[0]) * s),
        Math.floor(c1[1] + (c2[1] - c1[1]) * s),
        Math.floor(c1[2] + (c2[2] - c1[2]) * s)
      ];
    }
  }
}
