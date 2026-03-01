export const SystemRegistry = {
  configs: {
    'double-pendulum': {
      state: [
        { id: 'theta1', label: 'θ₁', default: 0, unit: 'rad' },
        { id: 'omega1', label: 'ω₁', default: 0, unit: 'rad/s' },
        { id: 'theta2', label: 'θ₂', default: 0, unit: 'rad' },
        { id: 'omega2', label: 'ω₂', default: 0, unit: 'rad/s' }
      ],
      params: [
        { id: 'm1', label: 'm₁', default: 1.0, unit: 'kg' },
        { id: 'm2', label: 'm₂', default: 1.0, unit: 'kg' },
        { id: 'L1', label: 'L₁', default: 1.0, unit: 'm' },
        { id: 'L2', label: 'L₂', default: 1.0, unit: 'm' },
        { id: 'g', label: 'g', default: 9.81, unit: 'm/s²' }
      ],
      dimensions: ['theta1', 'omega1', 'theta2', 'omega2', 'm1', 'm2', 'L1', 'L2'],
      dimensionLabels: {
        theta1: 'θ₁ (Angle 1)',
        omega1: 'ω₁ (Velocity 1)',
        theta2: 'θ₂ (Angle 2)',
        omega2: 'ω₂ (Velocity 2)',
        m1: 'm₁ (Mass 1)',
        m2: 'm₂ (Mass 2)',
        L1: 'L₁ (Length 1)',
        L2: 'L₂ (Length 2)'
      },
      defaultMapping: { x: 'theta1', y: 'theta2' },
      defaultRange: { x: [-Math.PI, Math.PI], y: [-Math.PI, Math.PI] }
    },

    'elastic-pendulum': {
      state: [
        { id: 'theta1', label: 'θ₁', default: 0, unit: 'rad' },
        { id: 'omega1', label: 'ω₁', default: 0, unit: 'rad/s' },
        { id: 'theta2', label: 'θ₂', default: 0, unit: 'rad' },
        { id: 'omega2', label: 'ω₂', default: 0, unit: 'rad/s' }
      ],
      params: [
        { id: 'm1', label: 'm₁', default: 1.0, unit: 'kg' },
        { id: 'm2', label: 'm₂', default: 1.0, unit: 'kg' },
        { id: 'L1', label: 'L₁', default: 1.0, unit: 'm' },
        { id: 'k', label: 'k', default: 10.0, unit: 'N/m' },
        { id: 'L2_rest', label: 'L₂₀', default: 1.0, unit: 'm' },
        { id: 'g', label: 'g', default: 9.81, unit: 'm/s²' }
      ],
      dimensions: ['theta1', 'omega1', 'theta2', 'omega2', 'm1', 'm2', 'L1', 'k', 'L2_rest'],
      dimensionLabels: {
        theta1: 'θ₁ (Angle 1)',
        omega1: 'ω₁ (Velocity 1)',
        theta2: 'θ₂ (Angle 2)',
        omega2: 'ω₂ (Velocity 2)',
        m1: 'm₁ (Mass 1)',
        m2: 'm₂ (Mass 2)',
        L1: 'L₁ (Length 1)',
        k: 'k (Spring Const)',
        L2_rest: 'L₂₀ (Rest Length)'
      },
      defaultMapping: { x: 'theta1', y: 'theta2' },
      defaultRange: { x: [-Math.PI, Math.PI], y: [-Math.PI, Math.PI] }
    },

    'henon-heiles': {
      state: [
        { id: 'x', label: 'x', default: 0, unit: '' },
        { id: 'px', label: 'px', default: 0, unit: '' },
        { id: 'y', label: 'y', default: 0, unit: '' },
        { id: 'py', label: 'py', default: 0, unit: '' }
      ],
      params: [
        { id: 'lambda', label: 'λ', default: 1.0, unit: '' }
      ],
      dimensions: ['x', 'px', 'y', 'py', 'lambda'],
      dimensionLabels: {
        x: 'x (Position)',
        px: 'px (Momentum)',
        y: 'y (Position)',
        py: 'py (Momentum)',
        lambda: 'λ (Lambda)'
      },
      defaultMapping: { x: 'x', y: 'y' },
      defaultRange: { x: [-1, 1], y: [-1, 1] }
    },

    'duffing': {
      state: [
        { id: 'x', label: 'x', default: 0, unit: '' },
        { id: 'v', label: 'v', default: 0, unit: '' },
        { id: 't', label: 't', default: 0, unit: '' }
      ],
      params: [
        { id: 'alpha', label: 'α', default: -1.0, unit: '' },
        { id: 'beta', label: 'β', default: 1.0, unit: '' },
        { id: 'gamma', label: 'γ', default: 0.3, unit: '' },
        { id: 'delta', label: 'δ', default: 0.5, unit: '' },
        { id: 'omega', label: 'ω', default: 0.5, unit: '' }
      ],
      dimensions: ['x', 'v', 't', 'alpha', 'beta', 'gamma', 'delta', 'omega'],
      dimensionLabels: {
        x: 'x (Position)',
        v: 'v (Velocity)',
        t: 't (Time)',
        alpha: 'α (Alpha)',
        beta: 'β (Beta)',
        gamma: 'γ (Gamma)',
        delta: 'δ (Delta)',
        omega: 'ω (Omega)'
      },
      defaultMapping: { x: 'x', y: 'v' },
      defaultRange: { x: [-2, 2], y: [-2, 2] }
    }
  },

  get(system) {
    return this.configs[system] || this.configs['double-pendulum'];
  },

  list() {
    return Object.keys(this.configs);
  }
};
