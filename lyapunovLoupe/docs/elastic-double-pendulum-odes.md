# Elastic Double Pendulum Equations of Motion

This document contains the equations of motion for four variants of the double pendulum system:
1. **Rigid Double Pendulum** - both arms are rigid rods
2. **First Arm Elastic** - first arm is a spring, second arm is rigid
3. **Second Arm Elastic** - first arm is rigid, second arm is a spring
4. **Both Arms Elastic** - both arms are springs (4 DOF system)

---

## 1. Rigid Double Pendulum (Reference)

**State variables**: `θ₁, ω₁ = θ̇₁, θ₂, ω₂ = θ̇₂` (4 state variables)

**Parameters**: `m₁, m₂, L₁, L₂, g`

**Equations of motion** (already implemented in `system-double-pendulum.glsl`):

```
Δ = θ₂ - θ₁

den₁ = (m₁ + m₂)L₁ - m₂L₁cos²(Δ)
den₂ = (L₂/L₁) × den₁

ω̇₁ = [m₂L₁ω₁²sin(Δ)cos(Δ) + m₂g·sin(θ₂)cos(Δ) + m₂L₂ω₂²sin(Δ) - (m₁+m₂)g·sin(θ₁)] / den₁

ω̇₂ = [-m₂L₂ω₂²sin(Δ)cos(Δ) + (m₁+m₂)g·sin(θ₁)cos(Δ) - (m₁+m₂)L₁ω₁²sin(Δ) - (m₁+m₂)g·sin(θ₂)] / den₂
```

---

## 2. First Arm Elastic, Second Arm Rigid

**Configuration**: First arm is spring (rest length `L₁_rest`, spring constant `k₁`), second arm is rigid rod (fixed length `L₂`)

**State variables**: `r₁, v₁ = ṙ₁, θ₁, ω₁ = θ̇₁, θ₂, ω₂ = θ̇₂` (6 state variables)

Where `r₁` is the current length of the first spring.

**Parameters**: `m₁, m₂, L₁_rest, L₂, k₁, g`

### Lagrangian Derivation

**Positions**:
```
x₁ = r₁·cos(θ₁)
y₁ = r₁·sin(θ₁)
x₂ = x₁ + L₂·cos(θ₂)
y₂ = y₁ + L₂·sin(θ₂)
```

**Kinetic Energy**:
```
T = ½m₁(ẋ₁² + ẏ₁²) + ½m₂(ẋ₂² + ẏ₂²)

ẋ₁² + ẏ₁² = ṙ₁² + r₁²ω₁²

ẋ₂² + ẏ₂² = ṙ₁² + r₁²ω₁² + L₂²ω₂² + 2r₁L₂ω₁ω₂cos(θ₁-θ₂) - 2L₂ṙ₁ω₂sin(θ₁-θ₂)
```

**Potential Energy**:
```
V = -m₁g·r₁·cos(θ₁) - m₂g·(r₁·cos(θ₁) + L₂·cos(θ₂)) + ½k₁(r₁ - L₁_rest)²
```

### Equations of Motion

Applying Euler-Lagrange equations for coordinates `(r₁, θ₁, θ₂)`:

```
r̈₁ = r₁ω₁² - (m₁+m₂)g·cos(θ₁)/m₂ - k₁(r₁ - L₁_rest)/m₂ + L₂ω₂²cos(θ₁-θ₂) + L₂ω̇₂sin(θ₁-θ₂)

θ̈₁ = [-(m₁+m₂)g·sin(θ₁) - m₂L₂ω₂²sin(θ₁-θ₂) - 2m₂ṙ₁ω₁ - m₂L₂ω̇₂cos(θ₁-θ₂)] / [(m₁+m₂)r₁]

θ̈₂ = [-m₂g·sin(θ₂) + m₂r₁ω₁²sin(θ₁-θ₂) - m₂r₁ω̇₁cos(θ₁-θ₂) - 2m₂ṙ₁ω₂] / [m₂L₂]
```

**Note**: These are coupled and need to be solved simultaneously.

---

## 3. Second Arm Elastic, First Arm Rigid

**Configuration**: First arm is rigid rod (fixed length `L₁`), second arm is spring (rest length `L₂_rest`, spring constant `k₂`)

**State variables**: `θ₁, ω₁ = θ̇₁, r₂, v₂ = ṙ₂, θ₂, ω₂ = θ̇₂` (6 state variables)

Where `r₂` is the current length of the second spring.

**Parameters**: `m₁, m₂, L₁, L₂_rest, k₂, g`

### From arXiv:2406.02200 (Dimensionless Form)

The paper uses dimensionless variables:
- `ℓ = r₂/L₁` (dimensionless spring length ratio)
- `μ = m₁/m₂` (mass ratio)
- `δ = L₂_rest/L₁` (rest length ratio)
- `ω = ωg²/ωk²` where `ωg = √(g/L₁)`, `ωk = √(k₂/m₂)`

**Dimensionless Lagrangian** (Eq. 2.5):

```
L = ½(ℓ̇² + ℓ²ω₂²) + ½(μ+1)ω₁² + ℓ·cos(θ₁-θ₂)·ω₁·ω₂ - sin(θ₁-θ₂)·ℓ̇·ω₁
  + ω[(μ+1)cos(θ₁) + ℓ·cos(θ₂)] - ½(δ-ℓ)²
```

### Equations of Motion (First-Order Form)

Let `v = ℓ̇`, `ω₁ = θ̇₁`, `ω₂ = θ̇₂`:

```
ℓ̇ = v

v̇ = ℓ·ω₂² + ω₁·[ℓ·ω₂sin(θ₁-θ₂) + v·cos(θ₁-θ₂)] + ω·cos(θ₂) - (ℓ - δ)

ω̇₁ = [-ℓ·ω₂·sin(θ₁-θ₂)·(ω₁ - ω₂) - v·ω₂·cos(θ₁-θ₂) - v·ω₁·cos(θ₁-θ₂)
       - (μ+1)ω·sin(θ₁)] / (μ+1)

ω̇₂ = [-ℓ·ω₁·sin(θ₁-θ₂)·(ω₁ - ω₂) + v·ω₁·cos(θ₁-θ₂) + 2v·ω₂/ℓ
       - ω·sin(θ₂)] / ℓ
```

**Conversion to dimensional form**:
- Time scaling: `t_dim = t/ωk` where `ωk = √(k₂/m₂)`
- The above equations are already in dimensionless time

---

## 4. Both Arms Elastic (Double Spring Pendulum)

**Configuration**: Both arms are springs with rest lengths `L₁_rest, L₂_rest` and spring constants `k₁, k₂`

**State variables**: `r₁, v₁ = ṙ₁, θ₁, ω₁ = θ̇₁, r₂, v₂ = ṙ₂, θ₂, ω₂ = θ̇₂` (8 state variables)

Where `r₁, r₂` are the current lengths of the first and second springs.

**Parameters**: `m₁, m₂, L₁_rest, L₂_rest, k₁, k₂, g`

### Lagrangian (from Nasser M. Abbasi)

Using generalized coordinates `x₁, x₂` (spring extensions from rest length `L`):

```
r₁ = L + x₁
r₂ = L + x₂
```

**Kinetic Energy for m₁**:
```
T₁ = ½m₁(ẋ₁² + (L+x₁)²ω₁²)
```

**Kinetic Energy for m₂**:
```
T₂ = ½m₂[(ẋ₂ + ẋ₁cos(θ₁-θ₂))² + (ẋ₁sin(θ₁-θ₂))²]
   + ½m₂[((L+x₂)ω₂ + (L+x₁)ω₁cos(θ₁-θ₂))² + ((L+x₁)ω₁sin(θ₁-θ₂))²]
```

**Potential Energy**:
```
V₁ = -m₁g(L+x₁)cos(θ₁) + ½k₁x₁²
V₂ = -m₂g[(L+x₁)cos(θ₁) + (L+x₂)cos(θ₂)] + ½k₂x₂²
```

**Full Lagrangian**: `L = T₁ + T₂ - V₁ - V₂`

### Equations of Motion

The four coupled second-order ODEs (derived via Euler-Lagrange):

**For x₁ (first spring extension)**:
```
m₁ẍ₁ + m₂[ẍ₁ + ẍ₂cos(θ₁-θ₂) - ẋ₂(ω₁-ω₂)sin(θ₁-θ₂)]
     + m₂(L+x₁)[ω₁² - ω̇₁sin(θ₁-θ₂) - ω₁(ω₁-ω₂)cos(θ₁-θ₂)]
     + m₂(L+x₂)[-ω̇₂sin(θ₁-θ₂) + ω₂(ω₁-ω₂)cos(θ₁-θ₂)]
     - (m₁+m₂)g·cos(θ₁) + k₁x₁ = 0
```

**For x₂ (second spring extension)**:
```
m₂[ẍ₂ + ẍ₁cos(θ₁-θ₂) + ẋ₁(ω₁-ω₂)sin(θ₁-θ₂)]
  + m₂(L+x₂)[ω₂² + ω̇₂ - ω₁(ω₁-ω₂)]
  - m₂g·cos(θ₂) + k₂x₂ = 0
```

**For θ₁ (first angle)**:
```
m₁(L+x₁)²ω̇₁ + 2m₁(L+x₁)ẋ₁ω₁
  + m₂(L+x₁)[(L+x₁)ω̇₁ + (L+x₂)ω̇₂cos(θ₁-θ₂) + (L+x₂)ω₂(ω₁-ω₂)sin(θ₁-θ₂)]
  + m₂(L+x₁)[ẋ₂sin(θ₁-θ₂) + ẋ₁(ω₁-ω₂)cos(θ₁-θ₂)]
  + (m₁+m₂)g(L+x₁)sin(θ₁) = 0
```

**For θ₂ (second angle)**:
```
m₂(L+x₂)²ω̇₂ + 2m₂(L+x₂)ẋ₂ω₂
  + m₂(L+x₂)[(L+x₂)ω̇₂ + (L+x₁)ω̇₁cos(θ₁-θ₂) - (L+x₁)ω₁(ω₁-ω₂)sin(θ₁-θ₂)]
  - m₂(L+x₂)ẋ₁sin(θ₁-θ₂)
  + m₂g(L+x₂)sin(θ₂) = 0
```

### Matrix Form for Numerical Solution

These equations are linear in the second derivatives. Write as:

```
M(q) · q̈ = F(q, q̇)
```

Where `q = [x₁, x₂, θ₁, θ₂]ᵀ` and `M` is the mass matrix.

**Mass matrix M**:
```
M₁₁ = m₁ + m₂
M₁₂ = m₂cos(θ₁-θ₂)
M₁₃ = 0
M₁₄ = 0

M₂₁ = m₂cos(θ₁-θ₂)
M₂₂ = m₂
M₂₃ = m₂(L+x₁)sin(θ₁-θ₂)
M₂₄ = m₂(L+x₂)

M₃₁ = 0
M₃₂ = m₂(L+x₁)sin(θ₁-θ₂)
M₃₃ = (m₁+m₂)(L+x₁)²
M₃₄ = m₂(L+x₁)(L+x₂)cos(θ₁-θ₂)

M₄₁ = 0
M₄₂ = m₂(L+x₂)
M₄₃ = m₂(L+x₁)(L+x₂)cos(θ₁-θ₂)
M₄₄ = m₂(L+x₂)²
```

Solve: `q̈ = M⁻¹(q) · F(q, q̇)` at each timestep.

---

## Implementation Notes

### State Vector Dimensions

| System | State Variables | Dimension |
|--------|-----------------|-----------|
| Rigid Double Pendulum | θ₁, ω₁, θ₂, ω₂ | 4 |
| First Arm Elastic | r₁, v₁, θ₁, ω₁, θ₂, ω₂ | 6 |
| Second Arm Elastic | θ₁, ω₁, r₂, v₂, θ₂, ω₂ | 6 |
| Both Arms Elastic | r₁, v₁, θ₁, ω₁, r₂, v₂, θ₂, ω₂ | 8 |

### Parameter Handling

For elastic systems, use `vec4 params`:
- `params.x = k` (spring constant, 0 if rigid)
- `params.y = L_rest` (rest length)
- `params.z = k₂` (second spring constant, for both-elastic)
- `params.w = L₂_rest` (second rest length, for both-elastic)

### Energy Conservation Check

All systems are conservative. Total energy E = T + V should remain constant (within numerical precision).

---

## References

1. **arXiv:2406.02200** - "Dynamics and non-integrability of the double spring pendulum" (Szumiński & Maciejewski, 2024)
2. **Nasser M. Abbasi** - "Double pendulum with springs" (2020) - https://www.12000.org/my_notes/spring_double_pendulum/
3. **Extrica 25010** - "Equations of motion for the rigid and elastic double pendulum using Lagrange's equations" (Zhauyt et al., 2025)
4. **physicsandstuffiguess.com** - Elastic Double Pendulum derivation with Mathematica
