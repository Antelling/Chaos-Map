# Lyapunov Loupe — Known Bugs

## Critical Bugs

### BUG-001: Verlet Integrator State Layout Mismatch

**Severity:** Critical  
**File:** `shaders/integrator-verlet.glsl`  
**Lines:** 50-67  
**Status:** Fixed

#### Description

The Störmer-Verlet implementation assumes a state vector layout of `(positions, velocities)` but the actual state layout used throughout the codebase is `(θ₁, ω₁, θ₂, ω₂)` — interleaved positions and angular velocities.

#### Root Cause

The Verlet code treats:
- `state.xy` as positions (correct for θ₁, incorrect because ω₁ is a velocity)
- `state.zw` as momenta/velocities (incorrect — contains θ₂ which is a position)

```glsl
// Line 54: Treats state.zw as velocities, but state.z = θ₂ (a position!)
vec4 p_half = state.zw + 0.5 * dt * deriv.zw;

// Line 57: Treats state.xy as positions, adds vec4 to vec2 (implicit truncation)
vec4 q_next = state.xy + dt * p_half;  // This is vec2 + vec4 → undefined behavior
```

#### Impact

- Verlet integrator produces completely incorrect results for ALL systems
- Energy conservation (the main benefit of symplectic integrators) is broken
- FTLE values from Verlet runs are meaningless

#### State Layout Conflict

| Component | Expected Layout | Actual Layout |
|-----------|-----------------|---------------|
| Double Pendulum | (θ₁, ω₁, θ₂, ω₂) | (θ₁, ω₁, θ₂, ω₂) |
| Hénon-Heiles | (x, px, y, py) | (x, px, y, py) |
| Duffing | (x, v, t, _) | (x, v, t, _) |
| Verlet assumes | (q₁, q₂, v₁, v₂) | — |

The Verlet code expects grouped positions and velocities, but all systems use interleaved layout.

#### Fix Required

Rewrite Verlet to handle interleaved state `(q₁, v₁, q₂, v₂)`:

```glsl
void verletStep(inout vec4 state, float dt, vec4 params) {
    vec4 deriv = systemDeriv(state, params);
    
    // Half-step velocities (deriv.yw contains accelerations)
    vec2 v_half = state.yw + 0.5 * dt * deriv.yw;
    
    // Full-step positions (state.xz contains positions)
    vec2 q_next = state.xz + dt * v_half;
    
    // Compute accelerations at new positions
    vec4 state_temp = vec4(q_next.x, v_half.x, q_next.y, v_half.y);
    vec4 deriv_next = systemDeriv(state_temp, params);
    
    // Full-step velocities
    vec2 v_next = v_half + 0.5 * dt * deriv_next.yw;
    
    // Update state (interleaved)
    state = vec4(q_next.x, v_next.x, q_next.y, v_next.y);
}
```

---

### BUG-002: Elastic Pendulum Spring Length Always Constant

**Severity:** Critical  
**File:** `shaders/system-elastic-pendulum.glsl`  
**Lines:** 19-25  
**Status:** Unfixed

#### Description

The spring length calculation always evaluates to the first pendulum arm length `L1`, making the spring force constant and removing the elastic behavior entirely.

#### Root Cause

```glsl
float x2_rel = L1 * cos(theta1);
float y2_rel = L1 * sin(theta1);
float r = sqrt(x2_rel * x2_rel + y2_rel * y2_rel);  // = L1 * sqrt(cos² + sin²) = L1

float spring_force = k * (r - L2_rest);  // Always k * (L1 - L2_rest) — CONSTANT!
```

Since `cos²θ + sin²θ = 1`, we have:
```
r = L1 * √(cos²θ₁ + sin²θ₁) = L1
```

The spring never stretches or compresses regardless of the system state.

#### Impact

- "Elastic" pendulum behaves identically to rigid double pendulum
- Spring constant `k` has no dynamic effect
- The system is not actually elastic

#### Underlying Design Flaw

The state vector `(θ₁, ω₁, θ₂, ω₂)` cannot represent an elastic pendulum because:
- θ₂ represents angle of second mass from some reference
- But elastic pendulum requires tracking the **spring length** as a dynamic variable

#### Fix Required

**Option A:** Change state to `(θ₁, ω₁, r₂, ṙ₂)` where `r₂` is spring length:
- `r₂` oscillates as spring stretches/compresses
- θ₂ becomes implicit (angle of second mass)

**Option B:** Use Cartesian coordinates for mass 2:
- State: `(θ₁, ω₁, x₂, ẏ₂)` or `(θ₁, ω₁, x₂, y₂, ẋ₂, ẏ₂)`
- More complex but physically correct

**Option C:** The current implementation may have intended θ₂ to represent something else. Clarify the intended physics before fixing.

---

## Minor Issues

### BUG-003: Inconsistent Loop Bounds Between Integrators

**Severity:** Low  
**Files:** `shaders/integrator-rk4.glsl`, `shaders/integrator-verlet.glsl`  
**Status:** Fixed

#### Description

RK4 has a loop bound of 20,000 iterations while Verlet has only 1,000.

```glsl
// integrator-rk4.glsl, line 40
for (int i = 0; i < 20000; i++) {

// integrator-verlet.glsl, line 89
for (int i = 0; i < 1000; i++) {
```

#### Impact

- Verlet simulations are capped at 1,000 iterations regardless of UI setting
- RK4 can go up to 20,000
- Inconsistent behavior between integrators

#### Fix

Increase Verlet loop bound to match RK4:
```glsl
for (int i = 0; i < 20000; i++) {
```

---

### BUG-004: Division by Zero Risk in FTLE Calculation

**Severity:** Low  
**Files:** `shaders/integrator-rk4.glsl`, `shaders/integrator-verlet.glsl`  
**Status:** Partially Mitigated

#### Description

FTLE calculation involves `log(delta / renormScale)`. If `delta` is zero (perturbation vanishes), `log(0) = -∞`.

```glsl
if (delta > 0.0) {
    logSum += log(delta / renormScale);
}
```

#### Current Mitigation

The code guards against this with `if (delta > 0.0)`, but:
- If delta is extremely small but positive, log can still underflow
- If delta is exactly 0.0 (rare but possible), the iteration is skipped with no log contribution

#### Status

Partially mitigated. Could be improved with a minimum delta threshold:
```glsl
float minDelta = 1e-12;
if (delta > minDelta) {
    logSum += log(delta / renormScale);
}
```

---

### BUG-005: Verlet Previous State Initialization May Never Trigger

**Severity:** Low  
**File:** `shaders/integrator-verlet.glsl`  
**Lines:** 76-80  
**Status:** Unfixed

#### Description

The initialization check compares prevState to initialized state with a relative tolerance, but this may never trigger correctly.

```glsl
vec4 initPrevState = initializePrevState(state, u_dt, params);
if (length(prevState - initPrevState) < 0.001 * length(initPrevState)) {
    prevState = initPrevState;
}
```

#### Issue

- On first run, `prevState` texture contains the same initial conditions as `state`
- The comparison `length(prevState - initPrevState)` will NOT be small because:
  - `prevState = state` (initial conditions)
  - `initPrevState = state - dt * deriv` (backward Euler estimate)
- These are significantly different, so initialization may never occur

#### Fix

Use an explicit "first frame" flag or check if prevState equals state exactly:
```glsl
if (length(prevState - state) < 1e-10) {
    prevState = initPrevState;
}
```

---

## Summary Table

| Bug ID | Severity | Component | Status |
|--------|----------|-----------|--------|
| BUG-001 | Critical | Verlet Integrator | Fixed |
| BUG-002 | Critical | Elastic Pendulum | Unfixed |
| BUG-003 | Low | Loop Bounds | Fixed |
| BUG-004 | Low | FTLE Division | Partially Mitigated |
| BUG-005 | Low | Verlet Init | Unfixed |

---

## Verification Commands

To verify these bugs exist:

1. **BUG-001 (Verlet):** Run any system with Verlet integrator, compare to RK4. Results should differ dramatically even for simple initial conditions.

2. **BUG-002 (Elastic):** Run elastic pendulum with different spring constants `k`. Results should be identical regardless of `k` value.

3. **BUG-003 (Loop bounds):** Set maxIterations > 1000. Verlet will stop at 1000, RK4 will continue to 20,000.
