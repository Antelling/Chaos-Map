// Double Pendulum Chaos Map - Constants and Configuration

// Simplified dimension pairs - only 4 options
const DIMENSION_PAIRS = [
    { id: 'theta1_theta2', name: 'Angles (θ₁, θ₂)', dims: ['theta1', 'theta2'], defaults: { min1: -3.14, max1: 3.14, min2: -3.14, max2: 3.14 } },
    { id: 'omega1_omega2', name: 'Angular Velocities (ω₁, ω₂)', dims: ['omega1', 'omega2'], defaults: { min1: -10, max1: 10, min2: -10, max2: 10 } },
    { id: 'l1_l2', name: 'Lengths (L₁, L₂)', dims: ['l1', 'l2'], defaults: { min1: 0.1, max1: 3, min2: 0.1, max2: 3 } },
    { id: 'm1_m2', name: 'Masses (m₁, m₂)', dims: ['m1', 'm2'], defaults: { min1: 0.1, max1: 5, min2: 0.1, max2: 5 } }
];

// Dimension info for display
const DIM_INFO = {
    theta1: { label: 'θ₁', unit: 'rad' },
    theta2: { label: 'θ₂', unit: 'rad' },
    omega1: { label: 'ω₁', unit: 'rad/s' },
    omega2: { label: 'ω₂', unit: 'rad/s' },
    l1: { label: 'L₁', unit: 'm' },
    l2: { label: 'L₂', unit: 'm' },
    m1: { label: 'm₁', unit: 'kg' },
    m2: { label: 'm₂', unit: 'kg' }
};

// Default/null pendulum state
const NULL_STATE = {
    theta1: 0,
    theta2: 0,
    omega1: 0,
    omega2: 0,
    l1: 1,
    l2: 1,
    m1: 1,
    m2: 1
};

// Dimension defaults for UI
const DIM_DEFAULTS = {
    theta1: { min: -3.14, max: 3.14 },
    theta2: { min: -3.14, max: 3.14 },
    omega1: { min: -10, max: 10 },
    omega2: { min: -10, max: 10 },
    l1: { min: 0.1, max: 3 },
    l2: { min: 0.1, max: 3 },
    m1: { min: 0.1, max: 5 },
    m2: { min: 0.1, max: 5 }
};

// Dimension to index mapping for shaders
const DIM_TO_INDEX = {
    theta1: 0, theta2: 1, omega1: 2, omega2: 3,
    l1: 4, l2: 5, m1: 6, m2: 7
};
