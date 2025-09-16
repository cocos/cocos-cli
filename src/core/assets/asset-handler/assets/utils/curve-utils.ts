export function evaluateValueTangent(
    time: number,
    fromTime: number,
    fromValue: number,
    fromTangentX: number,
    fromTangentY: number,
    toTime: number,
    toValue: number,
    toTangentX: number,
    toTangentY: number,
): { value: number; tangent: { x: number; y: number } } {
    const tangent0x = fromTangentX;
    const tangent0y = fromTangentY;
    const tangent1x = toTangentX;
    const tangent1y = toTangentY;
    const dt = toTime - fromTime;
    const ratio = (time - fromTime) / dt;

    const oneThird = 1.0 / 3.0;
    const dx = dt;
    // Hermite to Bezier
    const u0x = (tangent0x / dx) * oneThird;
    const u1x = 1.0 - (tangent1x / dx) * oneThird;
    const u0y = fromValue + tangent0y * oneThird;
    const u1y = toValue - tangent1y * oneThird;
    // Converts from Bernstein Basis to Power Basis.
    // Formula: [1, 0, 0, 0; -3, 3, 0, 0; 3, -6, 3, 0; -1, 3, -3, 1] * [p_0; p_1; p_2; p_3]
    // --------------------------------------
    // | Basis | Coeff
    // | t^3   | 3 * p_1 - p_0 - 3 * p_2 + p_3
    // | t^2   | 3 * p_0 - 6 * p_1 + 3 * p_2
    // | t^1   | 3 * p_1 - 3 * p_0
    // | t^0   | p_0
    // --------------------------------------
    // where: p_0 = 0, p_1 = u0x, p_2 = u1x, p_3 = 1
    // Especially, when both tangents are 1, we will have u0x = 1/3 and u1x = 2/3
    // and then: ratio = t, eg. the ratios are
    // 1-1 corresponding to param t. That's why we can do optimization like above.
    const coeff0 = 0.0; // 0
    const coeff1 = 3.0 * u0x; // 1
    const coeff2 = 3.0 * u1x - 6.0 * u0x; // -1
    const coeff3 = 3.0 * (u0x - u1x) + 1.0; // 1
    // Solves the param t from equation X(t) = ratio.
    const solutions = [0.0, 0.0, 0.0] as [number, number, number];
    const nSolutions = solveCubic(coeff0 - ratio, coeff1, coeff2, coeff3, solutions);
    const param = getParamFromCubicSolution(solutions, nSolutions, ratio);

    const value = bezierInterp(fromValue, u0y, u1y, toValue, param);
    const tanX = bezierTangent(fromTime, u0x, u1x, toTime, param);
    const tanY = bezierTangent(fromValue, u0y, u1y, toValue, param);
    return {
        value,
        tangent: {
            x: tanX,
            y: tanY,
        },
    };
}

function bezierInterp(p0: number, p1: number, p2: number, p3: number, t: number) {
    const u = 1 - t;
    const coeff0 = u * u * u;
    const coeff1 = 3 * u * u * t;
    const coeff2 = 3 * u * t * t;
    const coeff3 = t * t * t;
    return coeff0 * p0 + coeff1 * p1 + coeff2 * p2 + coeff3 * p3;
}

function bezierTangent(p0: number, p1: number, p2: number, p3: number, t: number) {
    const u = 1 - t;
    return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

function getParamFromCubicSolution(solutions: readonly [number, number, number], solutionsCount: number, x: number) {
    let param = x;
    if (solutionsCount === 1) {
        param = solutions[0];
    } else {
        param = -Infinity;
        for (let iSolution = 0; iSolution < solutionsCount; ++iSolution) {
            const solution = solutions[iSolution];
            if (solution >= 0.0 && solution <= 1.0) {
                if (solution > param) {
                    param = solution;
                }
            }
        }
        if (param === -Infinity) {
            param = 0.0;
        }
    }
    return param;
}

// cSpell:words Cardano's irreducibilis

/**
 * Solve Cubic Equation using Cardano's formula.
 * The equation is formed from coeff0 + coeff1 * x + coeff2 * x^2 + coeff3 * x^3 = 0.
 * Modified from https://github.com/erich666/GraphicsGems/blob/master/gems/Roots3And4.c .
 */
export function solveCubic(coeff0: number, coeff1: number, coeff2: number, coeff3: number, solutions: [number, number, number]) {
    // normal form: x^3 + Ax^2 + Bx + C = 0
    const a = coeff2 / coeff3;
    const b = coeff1 / coeff3;
    const c = coeff0 / coeff3;

    // substitute x = y - A/3 to eliminate quadric term:
    // x^3 +px + q = 0
    const sqrA = a * a;
    const p = (1.0 / 3.0) * ((-1.0 / 3) * sqrA + b);
    const q = (1.0 / 2.0) * ((2.0 / 27.0) * a * sqrA - (1.0 / 3) * a * b + c);

    // use Cardano's formula
    const cubicP = p * p * p;
    const d = q * q + cubicP;

    let nSolutions = 0;
    if (isZero(d)) {
        if (isZero(q)) {
            // one triple solution
            solutions[0] = 0;
            return 1;
        } else {
            // one single and one double solution
            const u = Math.cbrt(-q);
            solutions[0] = 2 * u;
            solutions[1] = -u;
            return 2;
        }
    } else if (d < 0) {
        // Casus irreducibilis: three real solutions
        const phi = (1.0 / 3) * Math.acos(-q / Math.sqrt(-cubicP));
        const t = 2 * Math.sqrt(-p);

        solutions[0] = t * Math.cos(phi);
        solutions[1] = -t * Math.cos(phi + Math.PI / 3);
        solutions[2] = -t * Math.cos(phi - Math.PI / 3);
        nSolutions = 3;
    } else {
        // one real solution
        const sqrtD = Math.sqrt(d);
        const u = Math.cbrt(sqrtD - q);
        const v = -Math.cbrt(sqrtD + q);
        solutions[0] = u + v;
        nSolutions = 1;
    }

    const sub = (1.0 / 3) * a;
    for (let i = 0; i < nSolutions; ++i) {
        solutions[i] -= sub;
    }

    return nSolutions;
}

const EQN_EPS = 1e-9;

function isZero(x: number) {
    return x > -EQN_EPS && x < EQN_EPS;
}
