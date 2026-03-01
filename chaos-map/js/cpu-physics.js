// Shared CPU Physics Engine for Double Pendulum
// 64-bit double precision, used by both chaos map and pendulum simulation

// Compute accelerations given current state
// Returns { alpha1, alpha2 } angular accelerations
function computeAccelerations(theta1, theta2, omega1, omega2, l1, l2, m1, m2, g) {
    const M = m1 + m2;
    const delta = theta1 - theta2;
    const sinDelta = Math.sin(delta);
    const cosDelta = Math.cos(delta);
    
    const alphaDenom = m1 + m2 * sinDelta * sinDelta;
    
    const num1 = -m2 * l1 * omega1 * omega1 * sinDelta * cosDelta
               - m2 * l2 * omega2 * omega2 * sinDelta
               - M * g * Math.sin(theta1)
               + m2 * g * Math.sin(theta2) * cosDelta;
    
    const num2 = M * l1 * omega1 * omega1 * sinDelta
               + m2 * l2 * omega2 * omega2 * sinDelta * cosDelta
               + M * g * Math.sin(theta1) * cosDelta
               - M * g * Math.sin(theta2);
    
    return {
        alpha1: num1 / (l1 * alphaDenom),
        alpha2: num2 / (l2 * alphaDenom)
    };
}

// Compute derivatives for RK4 integration
function computeDerivatives(theta1, theta2, omega1, omega2, l1, l2, m1, m2, g) {
    const acc = computeAccelerations(theta1, theta2, omega1, omega2, l1, l2, m1, m2, g);
    return {
        dtheta1: omega1,
        dtheta2: omega2,
        domega1: acc.alpha1,
        domega2: acc.alpha2
    };
}

// Velocity Verlet integrator step (symplectic)
// Modifies state object in place: { theta1, theta2, omega1, omega2 }
function stepVerlet(state, l1, l2, m1, m2, dt, g) {
    const halfDt = 0.5 * dt;
    
    // Current accelerations
    const acc1 = computeAccelerations(
        state.theta1, state.theta2, state.omega1, state.omega2,
        l1, l2, m1, m2, g
    );
    
    // Half-step velocity
    const omega1Half = state.omega1 + halfDt * acc1.alpha1;
    const omega2Half = state.omega2 + halfDt * acc1.alpha2;
    
    // Full position update
    state.theta1 += dt * omega1Half;
    state.theta2 += dt * omega2Half;
    state.omega1 = omega1Half;
    state.omega2 = omega2Half;
    
    // New accelerations
    const acc2 = computeAccelerations(
        state.theta1, state.theta2, state.omega1, state.omega2,
        l1, l2, m1, m2, g
    );
    
    // Final half-step velocity
    state.omega1 += halfDt * acc2.alpha1;
    state.omega2 += halfDt * acc2.alpha2;
}

// RK4 integrator step (4th order Runge-Kutta)
// Modifies state object in place: { theta1, theta2, omega1, omega2 }
function stepRK4(state, l1, l2, m1, m2, dt, g) {
    const k1 = computeDerivatives(
        state.theta1, state.theta2, state.omega1, state.omega2,
        l1, l2, m1, m2, g
    );
    
    const s2 = {
        theta1: state.theta1 + 0.5 * dt * k1.dtheta1,
        theta2: state.theta2 + 0.5 * dt * k1.dtheta2,
        omega1: state.omega1 + 0.5 * dt * k1.domega1,
        omega2: state.omega2 + 0.5 * dt * k1.domega2
    };
    const k2 = computeDerivatives(
        s2.theta1, s2.theta2, s2.omega1, s2.omega2,
        l1, l2, m1, m2, g
    );
    
    const s3 = {
        theta1: state.theta1 + 0.5 * dt * k2.dtheta1,
        theta2: state.theta2 + 0.5 * dt * k2.dtheta2,
        omega1: state.omega1 + 0.5 * dt * k2.domega1,
        omega2: state.omega2 + 0.5 * dt * k2.domega2
    };
    const k3 = computeDerivatives(
        s3.theta1, s3.theta2, s3.omega1, s3.omega2,
        l1, l2, m1, m2, g
    );
    
    const s4 = {
        theta1: state.theta1 + dt * k3.dtheta1,
        theta2: state.theta2 + dt * k3.dtheta2,
        omega1: state.omega1 + dt * k3.domega1,
        omega2: state.omega2 + dt * k3.domega2
    };
    const k4 = computeDerivatives(
        s4.theta1, s4.theta2, s4.omega1, s4.omega2,
        l1, l2, m1, m2, g
    );
    
    state.theta1 += dt * (k1.dtheta1 + 2*k2.dtheta1 + 2*k3.dtheta1 + k4.dtheta1) / 6;
    state.theta2 += dt * (k1.dtheta2 + 2*k2.dtheta2 + 2*k3.dtheta2 + k4.dtheta2) / 6;
    state.omega1 += dt * (k1.domega1 + 2*k2.domega1 + 2*k3.domega1 + k4.domega1) / 6;
    state.omega2 += dt * (k1.domega2 + 2*k2.domega2 + 2*k3.domega2 + k4.domega2) / 6;
}

// Measure divergence between two states
function measureDivergence(s1, s2) {
    let dTheta1 = s1.theta1 - s2.theta1;
    let dTheta2 = s1.theta2 - s2.theta2;
    
    // Normalize angle differences
    if (dTheta1 > Math.PI) dTheta1 -= 2 * Math.PI;
    else if (dTheta1 < -Math.PI) dTheta1 += 2 * Math.PI;
    
    if (dTheta2 > Math.PI) dTheta2 -= 2 * Math.PI;
    else if (dTheta2 < -Math.PI) dTheta2 += 2 * Math.PI;
    
    const dOmega1 = s1.omega1 - s2.omega1;
    const dOmega2 = s1.omega2 - s2.omega2;
    
    return Math.sqrt(dTheta1 * dTheta1 + dTheta2 * dTheta2 + dOmega1 * dOmega1 + dOmega2 * dOmega2);
}

// Simulate two pendulums until divergence or max iterations
// Returns { iteration, diverged, divergenceTime }
function simulateToDivergence(s1, s2, maxIter, threshold, dt, g, integrator = 'verlet') {
    const state1 = { ...s1 };
    const state2 = { ...s2 };
    
    let iter = 0;
    let diverged = false;
    let divergenceTime = 0;
    
    const stepFn = integrator === 'rk4' ? stepRK4 : stepVerlet;
    
    while (iter < maxIter && !diverged) {
        stepFn(state1, s1.l1, s1.l2, s1.m1, s1.m2, dt, g);
        stepFn(state2, s2.l1, s2.l2, s2.m1, s2.m2, dt, g);
        
        iter++;
        
        const dist = measureDivergence(state1, state2);
        if (dist > threshold) {
            diverged = true;
            divergenceTime = iter;
        }
    }
    
    return { iteration: iter, diverged, divergenceTime };
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        computeAccelerations,
        computeDerivatives,
        stepVerlet,
        stepRK4,
        measureDivergence,
        simulateToDivergence
    };
}

// Make available globally for browser
if (typeof window !== 'undefined') {
    window.CPUPhysics = {
        computeAccelerations,
        computeDerivatives,
        stepVerlet,
        stepRK4,
        measureDivergence,
        simulateToDivergence
    };
}

// For WebWorker
if (typeof self !== 'undefined' && !self.window) {
    self.CPUPhysics = {
        computeAccelerations,
        computeDerivatives,
        stepVerlet,
        stepRK4,
        measureDivergence,
        simulateToDivergence
    };
}
