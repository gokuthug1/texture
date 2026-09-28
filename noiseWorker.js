/**
 * Ultimate Texture Generator - Multi-Threaded Procedural Noise Worker
 * Zero external imports, zero DOM API dependencies. Fully standalone & native.
 * Supports: Perlin, Simplex, Value, and Worley/Cellular with 2D & 4D Toroidal Seamless Tiling.
 */

// 1. DETERMINISTIC 32-BIT PRNG (Mulberry32)
class SeededRandom {
    constructor(seed) {
        this.seed = (Number(seed) || 12345) >>> 0;
    }
    next() {
        let t = (this.seed = (this.seed + 0x6D2B79F5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

const lerp = (a, b, t) => a + t * (b - a);
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

// 2D & 4D Simplex skew constants
const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
const F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
const G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

const grad2 = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
];

// Symmetric 4D unit gradients
const grad4 = [
    [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
    [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
    [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
    [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
    [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
    [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
    [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
    [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0]
].map(v => {
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2] + v[3]*v[3]);
    return [v[0] / len, v[1] / len, v[2] / len, v[3] / len];
});

// 2. NOISE GENERATOR ENGINE
class NoiseGenerator {
    constructor(seed) {
        this.seed = (Number(seed) || 12345) >>> 0;
        this.prng = new SeededRandom(this.seed);
        this.p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) this.p[i] = i;
        for (let i = 255; i > 0; i--) {
            const r = Math.floor(this.prng.next() * (i + 1));
            const tmp = this.p[i];
            this.p[i] = this.p[r];
            this.p[r] = tmp;
        }
        // 1024 permutation buffer eliminates any wrap/out-of-bounds indexing in 4D
        this.perm = new Uint16Array(1024);
        for (let i = 0; i < 1024; i++) this.perm[i] = this.p[i & 255];
    }

    // --- Perlin Noise 2D ---
    gradPerlin2D(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    perlin(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = fade(x);
        const v = fade(y);
        const perm = this.perm;
        const A = perm[X] + Y, AA = perm[A], AB = perm[A + 1];
        const B = perm[X + 1] + Y, BA = perm[B], BB = perm[B + 1];
        return lerp(
            lerp(this.gradPerlin2D(perm[AA], x, y), this.gradPerlin2D(perm[BA], x - 1, y), u),
            lerp(this.gradPerlin2D(perm[AB], x, y - 1), this.gradPerlin2D(perm[BB], x - 1, y - 1), u),
            v
        );
    }

    // --- Perlin Noise 4D (for Toroidal Seamless Tiling) ---
    perlin4d(x, y, z, w) {
        const ix0 = Math.floor(x) & 255;
        const iy0 = Math.floor(y) & 255;
        const iz0 = Math.floor(z) & 255;
        const iw0 = Math.floor(w) & 255;

        const ix1 = (ix0 + 1) & 255;
        const iy1 = (iy0 + 1) & 255;
        const iz1 = (iz0 + 1) & 255;
        const iw1 = (iw0 + 1) & 255;

        const fx = x - Math.floor(x);
        const fy = y - Math.floor(y);
        const fz = z - Math.floor(z);
        const fw = w - Math.floor(w);

        const u = fade(fx);
        const v = fade(fy);
        const t = fade(fz);
        const s = fade(fw);

        const perm = this.perm;

        const h0 = perm[ix0], h1 = perm[ix1];
        const h00 = perm[h0 + iy0], h10 = perm[h1 + iy0];
        const h01 = perm[h0 + iy1], h11 = perm[h1 + iy1];

        const h000 = perm[h00 + iz0], h100 = perm[h10 + iz0];
        const h010 = perm[h01 + iz0], h110 = perm[h11 + iz0];
        const h001 = perm[h00 + iz1], h101 = perm[h10 + iz1];
        const h011 = perm[h01 + iz1], h111 = perm[h11 + iz1];

        const h0000 = perm[h000 + iw0], h1000 = perm[h100 + iw0];
        const h0100 = perm[h010 + iw0], h1100 = perm[h110 + iw0];
        const h0010 = perm[h001 + iw0], h1010 = perm[h101 + iw0];
        const h0110 = perm[h011 + iw0], h1110 = perm[h111 + iw0];

        const h0001 = perm[h000 + iw1], h1001 = perm[h100 + iw1];
        const h0101 = perm[h010 + iw1], h1101 = perm[h110 + iw1];
        const h0011 = perm[h001 + iw1], h1011 = perm[h101 + iw1];
        const h0111 = perm[h011 + iw1], h1111 = perm[h111 + iw1];

        const dot = (hash, dx, dy, dz, dw) => {
            const g = grad4[hash & 31];
            return g[0] * dx + g[1] * dy + g[2] * dz + g[3] * dw;
        };

        const n0000 = dot(h0000, fx, fy, fz, fw);
        const n1000 = dot(h1000, fx - 1, fy, fz, fw);
        const n0100 = dot(h0100, fx, fy - 1, fz, fw);
        const n1100 = dot(h1100, fx - 1, fy - 1, fz, fw);
        const n0010 = dot(h0010, fx, fy, fz - 1, fw);
        const n1010 = dot(h1010, fx - 1, fy, fz - 1, fw);
        const n0110 = dot(h0110, fx, fy - 1, fz - 1, fw);
        const n1110 = dot(h1110, fx - 1, fy - 1, fz - 1, fw);

        const n0001 = dot(h0001, fx, fy, fz, fw - 1);
        const n1001 = dot(h1001, fx - 1, fy, fz, fw - 1);
        const n0101 = dot(h0101, fx, fy - 1, fz, fw - 1);
        const n1101 = dot(h1101, fx - 1, fy - 1, fz - 1, fw - 1);
        const n0011 = dot(h0011, fx, fy, fz - 1, fw - 1);
        const n1011 = dot(h1011, fx - 1, fy, fz - 1, fw - 1);
        const n0111 = dot(h0111, fx, fy - 1, fz - 1, fw - 1);
        const n1111 = dot(h1111, fx - 1, fy - 1, fz - 1, fw - 1);

        const x000 = lerp(n0000, n1000, u);
        const x100 = lerp(n0100, n1100, u);
        const x010 = lerp(n0010, n1010, u);
        const x110 = lerp(n0110, n1110, u);
        const x001 = lerp(n0001, n1001, u);
        const x101 = lerp(n0101, n1101, u);
        const x011 = lerp(n0011, n1011, u);
        const x111 = lerp(n0111, n1111, u);

        const y00 = lerp(x000, x100, v);
        const y10 = lerp(x010, x110, v);
        const y01 = lerp(x001, x101, v);
        const y11 = lerp(x011, x111, v);

        const z0 = lerp(y00, y10, t);
        const z1 = lerp(y01, y11, t);

        return lerp(z0, z1, s);
    }

    // --- Simplex Noise 2D ---
    simplex2d(x, y) {
        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;
        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;

        let i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1.0 + 2.0 * G2;
        const y2 = y0 - 1.0 + 2.0 * G2;

        const perm = this.perm;
        const ii = i & 255;
        const jj = j & 255;
        const gi0 = perm[ii + perm[jj]] & 7;
        const gi1 = perm[ii + i1 + perm[jj + j1]] & 7;
        const gi2 = perm[ii + 1 + perm[jj + 1]] & 7;

        let n0 = 0, n1 = 0, n2 = 0;
        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 > 0) {
            t0 *= t0;
            n0 = t0 * t0 * (grad2[gi0][0] * x0 + grad2[gi0][1] * y0);
        }
        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 > 0) {
            t1 *= t1;
            n1 = t1 * t1 * (grad2[gi1][0] * x1 + grad2[gi1][1] * y1);
        }
        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 > 0) {
            t2 *= t2;
            n2 = t2 * t2 * (grad2[gi2][0] * x2 + grad2[gi2][1] * y2);
        }
        return 70.0 * (n0 + n1 + n2);
    }

    // --- Simplex Noise 4D (for Ultra-Fast Toroidal Seamless Tiling) ---
    simplex4d(x, y, z, w) {
        const s = (x + y + z + w) * F4;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        const l = Math.floor(w + s);
        const t = (i + j + k + l) * G4;
        const X0 = i - t; const Y0 = j - t; const Z0 = k - t; const W0 = l - t;
        const x0 = x - X0; const y0 = y - Y0; const z0 = z - Z0; const w0 = w - W0;

        let c = 0;
        if (x0 > y0) c |= 1; if (x0 > z0) c |= 2; if (x0 > w0) c |= 4;
        if (y0 > z0) c |= 8; if (y0 > w0) c |= 16; if (z0 > w0) c |= 32;

        const rankx = ((c & 1) ? 1 : 0) + ((c & 2) ? 1 : 0) + ((c & 4) ? 1 : 0);
        const ranky = ((c & 1) ? 0 : 1) + ((c & 8) ? 1 : 0) + ((c & 16) ? 1 : 0);
        const rankz = ((c & 2) ? 0 : 1) + ((c & 8) ? 0 : 1) + ((c & 32) ? 1 : 0);
        const rankw = ((c & 4) ? 0 : 1) + ((c & 16) ? 0 : 1) + ((c & 32) ? 0 : 1);

        const i1 = rankx >= 3 ? 1 : 0, j1 = ranky >= 3 ? 1 : 0, k1 = rankz >= 3 ? 1 : 0, l1 = rankw >= 3 ? 1 : 0;
        const i2 = rankx >= 2 ? 1 : 0, j2 = ranky >= 2 ? 1 : 0, k2 = rankz >= 2 ? 1 : 0, l2 = rankw >= 2 ? 1 : 0;
        const i3 = rankx >= 1 ? 1 : 0, j3 = ranky >= 1 ? 1 : 0, k3 = rankz >= 1 ? 1 : 0, l3 = rankw >= 1 ? 1 : 0;

        const x1 = x0 - i1 + G4, y1 = y0 - j1 + G4, z1 = z0 - k1 + G4, w1 = w0 - l1 + G4;
        const x2 = x0 - i2 + 2.0 * G4, y2 = y0 - j2 + 2.0 * G4, z2 = z0 - k2 + 2.0 * G4, w2 = w0 - l2 + 2.0 * G4;
        const x3 = x0 - i3 + 3.0 * G4, y3 = y0 - j3 + 3.0 * G4, z3 = z0 - k3 + 3.0 * G4, w3 = w0 - l3 + 3.0 * G4;
        const x4 = x0 - 1.0 + 4.0 * G4, y4 = y0 - 1.0 + 4.0 * G4, z4 = z0 - 1.0 + 4.0 * G4, w4 = w0 - 1.0 + 4.0 * G4;

        const perm = this.perm;
        const ii = i & 255, jj = j & 255, kk = k & 255, ll = l & 255;
        const gi0 = perm[ii + perm[jj + perm[kk + perm[ll]]]] & 31;
        const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] & 31;
        const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] & 31;
        const gi3 = perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] & 31;
        const gi4 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] & 31;

        let n0 = 0, n1 = 0, n2 = 0, n3 = 0, n4 = 0;
        let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0 - w0*w0;
        if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * (grad4[gi0][0]*x0 + grad4[gi0][1]*y0 + grad4[gi0][2]*z0 + grad4[gi0][3]*w0); }
        let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1 - w1*w1;
        if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * (grad4[gi1][0]*x1 + grad4[gi1][1]*y1 + grad4[gi1][2]*z1 + grad4[gi1][3]*w1); }
        let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2 - w2*w2;
        if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * (grad4[gi2][0]*x2 + grad4[gi2][1]*y2 + grad4[gi2][2]*z2 + grad4[gi2][3]*w2); }
        let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3 - w3*w3;
        if (t3 > 0) { t3 *= t3; n3 = t3 * t3 * (grad4[gi3][0]*x3 + grad4[gi3][1]*y3 + grad4[gi3][2]*z3 + grad4[gi3][3]*w3); }
        let t4 = 0.6 - x4*x4 - y4*y4 - z4*z4 - w4*w4;
        if (t4 > 0) { t4 *= t4; n4 = t4 * t4 * (grad4[gi4][0]*x4 + grad4[gi4][1]*y4 + grad4[gi4][2]*z4 + grad4[gi4][3]*w4); }

        return 27.0 * (n0 + n1 + n2 + n3 + n4);
    }

    // --- Value Noise 2D ---
    value(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = fade(x);
        const v = fade(y);
        const perm = this.perm;
        const n00 = perm[X + perm[Y]] / 255;
        const n10 = perm[X + 1 + perm[Y]] / 255;
        const n01 = perm[X + perm[Y + 1]] / 255;
        const n11 = perm[X + 1 + perm[Y + 1]] / 255;
        return (lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 2) - 1;
    }

    // --- Value Noise 4D (eliminates cross-hatch grid artifacts in seamless mode) ---
    value4d(x, y, z, w) {
        const X = Math.floor(x) & 255; const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255; const W = Math.floor(w) & 255;
        const fx = x - Math.floor(x); const fy = y - Math.floor(y);
        const fz = z - Math.floor(z); const fw = w - Math.floor(w);
        const u = fade(fx), v = fade(fy), t = fade(fz), s = fade(fw);

        const p = this.perm;
        const h0 = p[X], h1 = p[X + 1];
        const h00 = p[h0 + Y], h10 = p[h1 + Y], h01 = p[h0 + Y + 1], h11 = p[h1 + Y + 1];
        const h000 = p[h00 + Z], h100 = p[h10 + Z], h010 = p[h01 + Z], h110 = p[h11 + Z];
        const h001 = p[h00 + Z + 1], h101 = p[h10 + Z + 1], h011 = p[h01 + Z + 1], h111 = p[h11 + Z + 1];

        const c0000 = p[h000 + W] / 255, c1000 = p[h100 + W] / 255;
        const c0100 = p[h010 + W] / 255, c1100 = p[h110 + W] / 255;
        const c0010 = p[h001 + W] / 255, c1010 = p[h101 + W] / 255;
        const c0110 = p[h011 + W] / 255, c1110 = p[h111 + W] / 255;

        const c0001 = p[h000 + W + 1] / 255, c1001 = p[h100 + W + 1] / 255;
        const c0101 = p[h010 + W + 1] / 255, c1101 = p[h100 + W + 1] / 255;
        const c0011 = p[h001 + W + 1] / 255, c1011 = p[h101 + W + 1] / 255;
        const c0111 = p[h011 + W + 1] / 255, c1111 = p[h111 + W + 1] / 255;

        const x000 = lerp(c0000, c1000, u), x100 = lerp(c0100, c1100, u);
        const x010 = lerp(c0010, c1010, u), x110 = lerp(c0110, c1110, u);
        const x001 = lerp(c0001, c1001, u), x101 = lerp(c0101, c1101, u);
        const x011 = lerp(c0011, c1011, u), x111 = lerp(c0111, c1111, u);

        const y00 = lerp(x000, x100, v), y10 = lerp(x010, x110, v);
        const y01 = lerp(x001, x101, v), y11 = lerp(x011, x111, v);

        const z0 = lerp(y00, y10, t), z1 = lerp(y01, y11, t);
        return lerp(z0, z1, s) * 2 - 1;
    }

    // --- Worley / Cellular Noise Distance Helper ---
    computeDistance(dx, dy, metric) {
        if (metric === 'manhattan') return Math.abs(dx) + Math.abs(dy);
        if (metric === 'chebyshev') return Math.max(Math.abs(dx), Math.abs(dy));
        if (metric === 'minkowski') {
            const s = Math.sqrt(Math.abs(dx)) + Math.sqrt(Math.abs(dy));
            return s * s;
        }
        return Math.sqrt(dx * dx + dy * dy);
    }

    // --- Worley Noise 2D ---
    worley(x, y, type, metric) {
        const xInt = Math.floor(x);
        const yInt = Math.floor(y);
        const xFrac = x - xInt;
        const yFrac = y - yInt;
        let minDist = 100;
        let secondMinDist = 100;

        for (let yNeighbor = -1; yNeighbor <= 1; yNeighbor++) {
            for (let xNeighbor = -1; xNeighbor <= 1; xNeighbor++) {
                const neighborX = xInt + xNeighbor;
                const neighborY = yInt + yNeighbor;
                let hash1 = Math.sin(neighborX * 12.9898 + neighborY * 78.233 + this.seed) * 43758.5453;
                hash1 = hash1 - Math.floor(hash1);
                const pointX = xNeighbor + hash1;

                let hash2 = Math.sin(neighborX * 98.233 + neighborY * 12.9898 + this.seed) * 23421.6543;
                hash2 = hash2 - Math.floor(hash2);
                const pointY = yNeighbor + hash2;

                const diffX = pointX - xFrac;
                const diffY = pointY - yFrac;
                const d = this.computeDistance(diffX, diffY, metric);

                if (d < minDist) {
                    secondMinDist = minDist;
                    minDist = d;
                } else if (d < secondMinDist) {
                    secondMinDist = d;
                }
            }
        }

        if (type === 'f1') return (minDist * 2) - 1;
        if (type === 'f2') return (secondMinDist * 2) - 1;
        if (type === 'f1+f2') return ((minDist + secondMinDist) * 1.5) - 1;
        return ((secondMinDist - minDist) * 4) - 1; // 'f2-f1'
    }

    // --- Worley Seamless Tiling (Geometric Toroidal Cell Wrap) ---
    worleySeamless(xScaled, yScaled, periodX, periodY, type, metric) {
        const xInt = Math.floor(xScaled);
        const yInt = Math.floor(yScaled);
        const xFrac = xScaled - xInt;
        const yFrac = yScaled - yInt;
        let minDist = 100;
        let secondMinDist = 100;

        for (let yNeighbor = -1; yNeighbor <= 1; yNeighbor++) {
            for (let xNeighbor = -1; xNeighbor <= 1; xNeighbor++) {
                const neighborX = xInt + xNeighbor;
                const neighborY = yInt + yNeighbor;

                const wrappedX = ((neighborX % periodX) + periodX) % periodX;
                const wrappedY = ((neighborY % periodY) + periodY) % periodY;

                let hash1 = Math.sin(wrappedX * 12.9898 + wrappedY * 78.233 + this.seed) * 43758.5453;
                hash1 = hash1 - Math.floor(hash1);
                const pointX = xNeighbor + hash1;

                let hash2 = Math.sin(wrappedX * 98.233 + wrappedY * 12.9898 + this.seed) * 23421.6543;
                hash2 = hash2 - Math.floor(hash2);
                const pointY = yNeighbor + hash2;

                const diffX = pointX - xFrac;
                const diffY = pointY - yFrac;
                const d = this.computeDistance(diffX, diffY, metric);

                if (d < minDist) {
                    secondMinDist = minDist;
                    minDist = d;
                } else if (d < secondMinDist) {
                    secondMinDist = d;
                }
            }
        }

        if (type === 'f1') return (minDist * 2) - 1;
        if (type === 'f2') return (secondMinDist * 2) - 1;
        if (type === 'f1+f2') return ((minDist + secondMinDist) * 1.5) - 1;
        return ((secondMinDist - minDist) * 4) - 1;
    }
}

// 3. COLOR PARSING & GRADIENT LOOKUP TABLE
function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return [0, 0, 0];
    const clean = hex.trim().replace(/^#/, '');
    if (clean.length === 3) {
        return [
            parseInt(clean[0] + clean[0], 16) || 0,
            parseInt(clean[1] + clean[1], 16) || 0,
            parseInt(clean[2] + clean[2], 16) || 0
        ];
    }
    if (clean.length >= 6) {
        return [
            parseInt(clean.substring(0, 2), 16) || 0,
            parseInt(clean.substring(2, 4), 16) || 0,
            parseInt(clean.substring(4, 6), 16) || 0
        ];
    }
    return [0, 0, 0];
}

function createGradientLUT(gradientStops, lutSize = 1024) {
    const lut = new Uint8ClampedArray(lutSize * 4);
    const stops = (gradientStops && gradientStops.length > 0)
        ? [...gradientStops].sort((a, b) => a.pos - b.pos)
        : [{ pos: 0.0, color: '#000000' }, { pos: 1.0, color: '#ffffff' }];

    if (stops.length === 1) {
        const rgb = hexToRgb(stops[0].color);
        for (let i = 0; i < lutSize; i++) {
            const idx = i * 4;
            lut[idx] = rgb[0];
            lut[idx + 1] = rgb[1];
            lut[idx + 2] = rgb[2];
            lut[idx + 3] = 255;
        }
        return lut;
    }

    const firstColor = hexToRgb(stops[0].color);
    const lastColor = hexToRgb(stops[stops.length - 1].color);

    for (let i = 0; i < lutSize; i++) {
        const t = i / (lutSize - 1);
        let rgb = [0, 0, 0];

        if (t <= stops[0].pos) {
            rgb = firstColor;
        } else if (t >= stops[stops.length - 1].pos) {
            rgb = lastColor;
        } else {
            for (let s = 0; s < stops.length - 1; s++) {
                const s1 = stops[s];
                const s2 = stops[s + 1];
                if (t >= s1.pos && t <= s2.pos) {
                    const span = s2.pos - s1.pos;
                    const localT = span > 0.00001 ? (t - s1.pos) / span : 0;
                    const c1 = hexToRgb(s1.color);
                    const c2 = hexToRgb(s2.color);
                    rgb = [
                        Math.round(c1[0] + localT * (c2[0] - c1[0])),
                        Math.round(c1[1] + localT * (c2[1] - c1[1])),
                        Math.round(c1[2] + localT * (c2[2] - c1[2]))
                    ];
                    break;
                }
            }
        }

        const idx = i * 4;
        lut[idx]     = rgb[0];
        lut[idx + 1] = rgb[1];
        lut[idx + 2] = rgb[2];
        lut[idx + 3] = 255;
    }
    return lut;
}

// 4. WORKER MESSAGE HANDLER
self.onmessage = function(e) {
    if (e.data && e.data.type === 'RENDER_CHUNK') {
        const {
            startY, endY, width, height, seed, noiseType, scale, octaves,
            persistence, lacunarity, ridged, turbStrength, turbScale,
            worleyType, worleyDist, contrast, brightness, invert,
            thresholdEnable, threshold, seamless, gradientStops
        } = e.data;

        const noiseGen = new NoiseGenerator(seed);
        const turbGen = new NoiseGenerator(seed + 9999);

        const LUT_SIZE = 1024;
        const gradientLUT = createGradientLUT(gradientStops, LUT_SIZE);

        const chunkHeight = Math.max(0, endY - startY);
        const chunkData = new Uint8ClampedArray(width * chunkHeight * 4);
        const heightData = new Float32Array(width * chunkHeight);

        const safeScale = Math.max(1, scale);
        const safeTurbScale = Math.max(1, turbScale);
        const twoPi = 2 * Math.PI;

        for (let y = startY; y < endY; y++) {
            const localY = y - startY;
            for (let x = 0; x < width; x++) {
                let u = x / width;
                let v = y / height;

                let nx = x;
                let ny = y;

                // Turbulence / Domain Warping
                if (turbStrength > 0) {
                    let tx, ty;
                    if (seamless) {
                        const turbR = safeTurbScale / twoPi;
                        const tnx = Math.cos(twoPi * u) * turbR;
                        const tny = Math.sin(twoPi * u) * turbR;
                        const tnz = Math.cos(twoPi * v) * turbR;
                        const tnw = Math.sin(twoPi * v) * turbR;

                        tx = turbGen.simplex4d(tnx, tny, tnz, tnw);
                        ty = turbGen.simplex4d(tnx + 10.5, tny + 10.5, tnz + 10.5, tnw + 10.5);
                    } else {
                        tx = turbGen.simplex2d(x / safeTurbScale, y / safeTurbScale);
                        ty = turbGen.simplex2d((x + 1000) / safeTurbScale, (y + 1000) / safeTurbScale);
                    }
                    nx += tx * turbStrength;
                    ny += ty * turbStrength;

                    u = nx / width;
                    v = ny / height;
                }

                let noiseValue = 0;
                let maxValue = 0;

                if (seamless) {
                    if (noiseType === 'simplex') {
                        const R = safeScale / twoPi;
                        const tx = Math.cos(twoPi * u) * R;
                        const ty = Math.sin(twoPi * u) * R;
                        const tz = Math.cos(twoPi * v) * R;
                        const tw = Math.sin(twoPi * v) * R;

                        let amplitude = 1;
                        let freq = 1;
                        for (let o = 0; o < octaves; o++) {
                            let n = noiseGen.simplex4d(tx * freq, ty * freq, tz * freq, tw * freq);
                            if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                            noiseValue += n * amplitude;
                            maxValue += amplitude;
                            amplitude *= persistence;
                            freq *= lacunarity;
                        }
                    } else if (noiseType === 'perlin') {
                        const R = safeScale / twoPi;
                        const tx = Math.cos(twoPi * u) * R;
                        const ty = Math.sin(twoPi * u) * R;
                        const tz = Math.cos(twoPi * v) * R;
                        const tw = Math.sin(twoPi * v) * R;

                        let amplitude = 1;
                        let freq = 1;
                        for (let o = 0; o < octaves; o++) {
                            let n = noiseGen.perlin4d(tx * freq, ty * freq, tz * freq, tw * freq);
                            if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                            noiseValue += n * amplitude;
                            maxValue += amplitude;
                            amplitude *= persistence;
                            freq *= lacunarity;
                        }
                    } else if (noiseType === 'value') {
                        const R = safeScale / twoPi;
                        const tx = Math.cos(twoPi * u) * R;
                        const ty = Math.sin(twoPi * u) * R;
                        const tz = Math.cos(twoPi * v) * R;
                        const tw = Math.sin(twoPi * v) * R;

                        let amplitude = 1;
                        let freq = 1;
                        for (let o = 0; o < octaves; o++) {
                            let n = noiseGen.value4d(tx * freq, ty * freq, tz * freq, tw * freq);
                            if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                            noiseValue += n * amplitude;
                            maxValue += amplitude;
                            amplitude *= persistence;
                            freq *= lacunarity;
                        }
                    } else {
                        // Seamless Worley
                        let periodX = Math.max(1, Math.round(width / safeScale));
                        let periodY = Math.max(1, Math.round(height / safeScale));

                        let amplitude = 1;
                        let freqMult = 1;
                        for (let o = 0; o < octaves; o++) {
                            const pX = Math.max(1, Math.round(periodX * freqMult));
                            const pY = Math.max(1, Math.round(periodY * freqMult));
                            const xScaled = u * pX;
                            const yScaled = v * pY;

                            let n = noiseGen.worleySeamless(xScaled, yScaled, pX, pY, worleyType, worleyDist);
                            if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                            noiseValue += n * amplitude;
                            maxValue += amplitude;
                            amplitude *= persistence;
                            freqMult *= lacunarity;
                        }
                    }
                } else {
                    // Non-Seamless Standard
                    let amplitude = 1;
                    let freq = 1;
                    for (let o = 0; o < octaves; o++) {
                        const sx = (nx / safeScale) * freq;
                        const sy = (ny / safeScale) * freq;
                        let n;

                        if (noiseType === 'simplex') n = noiseGen.simplex2d(sx, sy);
                        else if (noiseType === 'perlin') n = noiseGen.perlin(sx, sy);
                        else if (noiseType === 'value') n = noiseGen.value(sx, sy);
                        else n = noiseGen.worley(sx, sy, worleyType, worleyDist);

                        if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                        noiseValue += n * amplitude;
                        maxValue += amplitude;
                        amplitude *= persistence;
                        freq *= lacunarity;
                    }
                }

                if (maxValue > 0) {
                    if (ridged) {
                        noiseValue = noiseValue / maxValue;
                    } else {
                        noiseValue = (noiseValue / maxValue + 1) * 0.5;
                    }
                } else {
                    noiseValue = 0.5;
                }

                // Post-Processing
                if (invert) noiseValue = 1.0 - noiseValue;
                noiseValue = (noiseValue - 0.5) * contrast + 0.5 + brightness;
                noiseValue = Math.max(0, Math.min(1, noiseValue));
                if (thresholdEnable) noiseValue = noiseValue >= threshold ? 1.0 : 0.0;

                // Store height for PBR normal/roughness generation
                const pixelIdx = localY * width + x;
                heightData[pixelIdx] = noiseValue;

                // Lookup color in LUT
                const lutIdx = Math.min(LUT_SIZE - 1, Math.max(0, Math.floor(noiseValue * (LUT_SIZE - 1))));
                const colorOffset = lutIdx * 4;
                const outOffset = pixelIdx * 4;

                chunkData[outOffset]     = gradientLUT[colorOffset];
                chunkData[outOffset + 1] = gradientLUT[colorOffset + 1];
                chunkData[outOffset + 2] = gradientLUT[colorOffset + 2];
                chunkData[outOffset + 3] = 255;
            }
        }

        self.postMessage({
            type: 'CHUNK_COMPLETE',
            data: chunkData,
            heightData: heightData,
            startY: startY,
            endY: endY
        }, [chunkData.buffer, heightData.buffer]);
    }
};
