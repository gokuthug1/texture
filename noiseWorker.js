/**
 * Ultimate Texture Generator - Noise Generation Worker
 * Zero external imports, zero DOM API dependencies.
 */

class SeededRandom {
    constructor(seed) { this.seed = seed; }
    next() {
        var t = this.seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

const lerp = (a, b, t) => a + t * (b - a);
const fade = t => t * t * t * (t * (t * 6 - 15) + 10);

// Symmetric 4D unit vectors mapped and normalized to unit length
const grad4 = [
  [1, 1, 1, 0], [-1, 1, 1, 0], [1, -1, 1, 0], [-1, -1, 1, 0],
  [1, 1, -1, 0], [-1, 1, -1, 0], [1, -1, -1, 0], [-1, -1, -1, 0],
  [1, 1, 0, 1], [-1, 1, 0, 1], [1, -1, 0, 1], [-1, -1, 0, 1],
  [1, 1, 0, -1], [-1, 1, 0, -1], [1, -1, 0, -1], [-1, -1, 0, -1],
  [1, 0, 1, 1], [-1, 0, 1, 1], [1, 0, -1, 1], [-1, 0, -1, 1],
  [1, 0, 1, -1], [-1, 0, 1, -1], [1, 0, -1, -1], [-1, 0, -1, -1],
  [0, 1, 1, 1], [0, -1, 1, 1], [0, 1, -1, 1], [0, -1, -1, 1],
  [0, 1, 1, -1], [0, -1, 1, -1], [0, 1, -1, -1], [0, -1, -1, -1]
].map(v => {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2] + v[3]*v[3]);
  return [v[0]/len, v[1]/len, v[2]/len, v[3]/len];
});

class NoiseGenerator {
    constructor(seed) {
        this.seed = seed;
        this.prng = new SeededRandom(seed);
        this.p = new Uint8Array(512);
        this.perm = new Uint8Array(512);
        for(let i=0; i<256; i++) this.p[i] = i;
        for(let i=0; i<256; i++) {
            const r = Math.floor(this.prng.next() * 256);
            [this.p[i], this.p[r]] = [this.p[r], this.p[i]];
        }
        for(let i=0; i<512; i++) this.perm[i] = this.p[i & 255];
    }
    
    grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : (h === 12 || h === 14 ? x : 0);
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    
    perlin(x, y) {
        const X = Math.floor(x) & 255; const Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x); const v = fade(y);
        const A = this.perm[X]+Y, AA = this.perm[A], AB = this.perm[A+1];
        const B = this.perm[X+1]+Y, BA = this.perm[B], BB = this.perm[B+1];
        return lerp(lerp(this.grad(this.perm[AA], x, y), this.grad(this.perm[BA], x-1, y), u),
                    lerp(this.grad(this.perm[AB], x, y-1), this.grad(this.perm[BB], x-1, y-1), u), v);
    }
    
    value(x, y) {
        const X = Math.floor(x) & 255; const Y = Math.floor(y) & 255;
        x -= Math.floor(x); y -= Math.floor(y);
        const u = fade(x); const v = fade(y);
        const n00 = this.perm[X + this.perm[Y]] / 255;
        const n10 = this.perm[X + 1 + this.perm[Y]] / 255;
        const n01 = this.perm[X + this.perm[Y + 1]] / 255;
        const n11 = this.perm[X + 1 + this.perm[Y + 1]] / 255;
        return (lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 2) - 1;
    }
    
    worley(x, y, type, isManhattan) {
        const xInt = Math.floor(x); const yInt = Math.floor(y);
        const xFrac = x - xInt; const yFrac = y - yInt;
        let minDist = 100; let secondMinDist = 100;
        for(let yNeighbor = -1; yNeighbor <= 1; yNeighbor++) {
            for(let xNeighbor = -1; xNeighbor <= 1; xNeighbor++) {
                const neighborX = xInt + xNeighbor;
                const neighborY = yInt + yNeighbor;
                let hash = (Math.sin(neighborX * 12.9898 + neighborY * 78.233 + this.seed) * 43758.5453);
                hash = hash - Math.floor(hash); const pointX = xNeighbor + hash; 
                hash = (Math.sin(neighborX * 98.233 + neighborY * 12.9898 + this.seed) * 23421.6543);
                hash = hash - Math.floor(hash); const pointY = yNeighbor + hash;
                const diffX = pointX - xFrac; const diffY = pointY - yFrac;
                let d = isManhattan ? Math.abs(diffX) + Math.abs(diffY) : Math.sqrt(diffX*diffX + diffY*diffY);
                if (d < minDist) { secondMinDist = minDist; minDist = d; } else if (d < secondMinDist) { secondMinDist = d; }
            }
        }
        if(type === 'f1') return (minDist * 2) - 1;
        if(type === 'f2') return (secondMinDist * 2) - 1;
        return ((secondMinDist - minDist) * 4) - 1;
    }

    // 4D Perlin Noise Implementation
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

        const h0 = perm[ix0];
        const h1 = perm[ix1];

        const h00 = perm[h0 + iy0];
        const h10 = perm[h1 + iy0];
        const h01 = perm[h0 + iy1];
        const h11 = perm[h1 + iy1];

        const h000 = perm[h00 + iz0];
        const h100 = perm[h10 + iz0];
        const h010 = perm[h01 + iz0];
        const h110 = perm[h11 + iz0];
        const h001 = perm[h00 + iz1];
        const h101 = perm[h10 + iz1];
        const h011 = perm[h01 + iz1];
        const h111 = perm[h11 + iz1];

        const h0000 = perm[h000 + iw0];
        const h1000 = perm[h100 + iw0];
        const h0100 = perm[h010 + iw0];
        const h1100 = perm[h110 + iw0];
        const h0010 = perm[h001 + iw0];
        const h1010 = perm[h101 + iw0];
        const h0110 = perm[h011 + iw0];
        const h1110 = perm[h111 + iw0];

        const h0001 = perm[h000 + iw1];
        const h1001 = perm[h100 + iw1];
        const h0101 = perm[h010 + iw1];
        const h1101 = perm[h110 + iw1];
        const h0011 = perm[h001 + iw1];
        const h1011 = perm[h101 + iw1];
        const h0111 = perm[h011 + iw1];
        const h1111 = perm[h111 + iw1];

        const gradDot = (hash, dx, dy, dz, dw) => {
            const g = grad4[hash & 31];
            return g[0]*dx + g[1]*dy + g[2]*dz + g[3]*dw;
        };

        const n0000 = gradDot(h0000, fx, fy, fz, fw);
        const n1000 = gradDot(h1000, fx - 1, fy, fz, fw);
        const n0100 = gradDot(h0100, fx, fy - 1, fz, fw);
        const n1100 = gradDot(h1100, fx - 1, fy - 1, fz, fw);
        const n0010 = gradDot(h0010, fx, fy, fz - 1, fw);
        const n1010 = gradDot(h1010, fx - 1, fy, fz - 1, fw);
        const n0110 = gradDot(h0110, fx, fy - 1, fz - 1, fw);
        const n1110 = gradDot(h1110, fx - 1, fy - 1, fz - 1, fw);

        const n0001 = gradDot(h0001, fx, fy, fz, fw - 1);
        const n1001 = gradDot(h1001, fx - 1, fy, fz, fw - 1);
        const n0101 = gradDot(h0101, fx, fy - 1, fz, fw - 1);
        const n1101 = gradDot(h1101, fx - 1, fy - 1, fz, fw - 1);
        const n0011 = gradDot(h0011, fx, fy, fz - 1, fw - 1);
        const n1011 = gradDot(h1011, fx - 1, fy, fz - 1, fw - 1);
        const n0111 = gradDot(h0111, fx, fy - 1, fz - 1, fw - 1);
        const n1111 = gradDot(h1111, fx - 1, fy - 1, fz - 1, fw - 1);

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

    // Worley Seamless tiling implementation
    worleySeamless(xScaled, yScaled, periodX, periodY, type, isManhattan) {
        const xInt = Math.floor(xScaled); const yInt = Math.floor(yScaled);
        const xFrac = xScaled - xInt; const yFrac = yScaled - yInt;
        let minDist = 100; let secondMinDist = 100;
        for(let yNeighbor = -1; yNeighbor <= 1; yNeighbor++) {
            for(let xNeighbor = -1; xNeighbor <= 1; xNeighbor++) {
                const neighborX = xInt + xNeighbor;
                const neighborY = yInt + yNeighbor;
                
                // Wrap cell coordinates geometrically to guarantee matching boundaries
                const wrappedX = ((neighborX % periodX) + periodX) % periodX;
                const wrappedY = ((neighborY % periodY) + periodY) % periodY;
                
                let hash = (Math.sin(wrappedX * 12.9898 + wrappedY * 78.233 + this.seed) * 43758.5453);
                hash = hash - Math.floor(hash); const pointX = xNeighbor + hash; 
                
                hash = (Math.sin(wrappedX * 98.233 + wrappedY * 12.9898 + this.seed) * 23421.6543);
                hash = hash - Math.floor(hash); const pointY = yNeighbor + hash;
                
                const diffX = pointX - xFrac; const diffY = pointY - yFrac;
                let d = isManhattan ? Math.abs(diffX) + Math.abs(diffY) : Math.sqrt(diffX*diffX + diffY*diffY);
                if (d < minDist) { secondMinDist = minDist; minDist = d; } else if (d < secondMinDist) { secondMinDist = d; }
            }
        }
        if(type === 'f1') return (minDist * 2) - 1;
        if(type === 'f2') return (secondMinDist * 2) - 1;
        return ((secondMinDist - minDist) * 4) - 1;
    }
}

self.onmessage = function(e) {
    if (e.data.type === 'RENDER_CHUNK') {
        const {
            startY, endY, width, height, seed, noiseType, scale, octaves,
            persistence, lacunarity, ridged, turbStrength, turbScale,
            worleyType, worleyDist, contrast, brightness, invert,
            thresholdEnable, threshold, seamless, gradientStops
        } = e.data;
        
        const noiseGen = new NoiseGenerator(seed);
        const turbGen = new NoiseGenerator(seed + 999);
        
        // Pre-process gradient stops
        const sortedStops = [...gradientStops].sort((a, b) => a.pos - b.pos);
        
        function hexToRgb(hex) {
            const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
            const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
            return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [0, 0, 0];
        }
        
        function mapColor(t) {
            if (t <= sortedStops[0].pos) return hexToRgb(sortedStops[0].color);
            if (t >= sortedStops[sortedStops.length-1].pos) return hexToRgb(sortedStops[sortedStops.length-1].color);
            for (let i = 0; i < sortedStops.length - 1; i++) {
                if (t >= sortedStops[i].pos && t <= sortedStops[i+1].pos) {
                    const range = sortedStops[i+1].pos - sortedStops[i].pos;
                    const localT = range > 0.00001 ? (t - sortedStops[i].pos) / range : 0;
                    const c1 = hexToRgb(sortedStops[i].color);
                    const c2 = hexToRgb(sortedStops[i+1].color);
                    return [
                        Math.floor(c1[0] + localT * (c2[0] - c1[0])),
                        Math.floor(c1[1] + localT * (c2[1] - c1[1])),
                        Math.floor(c1[2] + localT * (c2[2] - c1[2]))
                    ];
                }
            }
            return [0,0,0];
        }
        
        const gradientLUT = new Uint8ClampedArray(256 * 4);
        for(let i=0; i<256; i++) {
            const rgb = mapColor(i/255);
            gradientLUT[i*4] = rgb[0];
            gradientLUT[i*4+1] = rgb[1];
            gradientLUT[i*4+2] = rgb[2];
            gradientLUT[i*4+3] = 255;
        }
        
        const chunkHeight = endY - startY;
        const chunkData = new Uint8ClampedArray(width * chunkHeight * 4);
        const isManhattan = worleyDist === 'manhattan';
        
        for (let y = startY; y < endY; y++) {
            const localY = y - startY;
            for (let x = 0; x < width; x++) {
                let u = x / width;
                let v = y / height;
                
                let nx = x;
                let ny = y;
                
                if (turbStrength > 0) {
                    let tx, ty;
                    if (seamless) {
                        const turbR = turbScale / (2 * Math.PI);
                        const tnx = Math.cos(2 * Math.PI * u) * turbR;
                        const tny = Math.sin(2 * Math.PI * u) * turbR;
                        const tnz = Math.cos(2 * Math.PI * v) * turbR;
                        const tnw = Math.sin(2 * Math.PI * v) * turbR;
                        
                        tx = turbGen.perlin4d(tnx, tny, tnz, tnw);
                        ty = turbGen.perlin4d(tnx + 10, tny + 10, tnz + 10, tnw + 10);
                    } else {
                        tx = turbGen.perlin(x / turbScale, y / turbScale);
                        ty = turbGen.perlin((x + 1000) / turbScale, (y + 1000) / turbScale);
                    }
                    nx += tx * turbStrength;
                    ny += ty * turbStrength;
                    
                    // Remap coordinates following turbulence warp
                    u = nx / width;
                    v = ny / height;
                }
                
                let noiseValue = 0;
                let maxValue = 0;
                
                if (seamless) {
                    if (noiseType === 'perlin') {
                        const R = scale / (2 * Math.PI);
                        const tx = Math.cos(2 * Math.PI * u) * R;
                        const ty = Math.sin(2 * Math.PI * u) * R;
                        const tz = Math.cos(2 * Math.PI * v) * R;
                        const tw = Math.sin(2 * Math.PI * v) * R;
                        
                        let amplitude = 1;
                        let frequency = 1;
                        for (let o = 0; o < octaves; o++) {
                            const sx = tx * frequency;
                            const sy = ty * frequency;
                            const sz = tz * frequency;
                            const sw = tw * frequency;
                            
                            let n = noiseGen.perlin4d(sx, sy, sz, sw);
                            if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                            noiseValue += n * amplitude;
                            maxValue += amplitude;
                            amplitude *= persistence;
                            frequency *= lacunarity;
                        }
                    } else if (noiseType === 'value') {
                        const R = scale / (2 * Math.PI);
                        const tx1 = Math.cos(2 * Math.PI * u) * R;
                        const ty1 = Math.sin(2 * Math.PI * u) * R;
                        const tz2 = Math.cos(2 * Math.PI * v) * R;
                        const tw2 = Math.sin(2 * Math.PI * v) * R;
                        
                        let amplitude = 1;
                        let frequency = 1;
                        for (let o = 0; o < octaves; o++) {
                            const sx1 = tx1 * frequency;
                            const sy1 = ty1 * frequency;
                            const sz2 = tz2 * frequency;
                            const sw2 = tw2 * frequency;
                            
                            const v1 = noiseGen.value(sx1, sy1);
                            const v2 = noiseGen.value(sz2, sw2);
                            let n = (v1 + v2) / 2.0;
                            
                            if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                            noiseValue += n * amplitude;
                            maxValue += amplitude;
                            amplitude *= persistence;
                            frequency *= lacunarity;
                        }
                    } else {
                        let periodX = Math.round(width / scale);
                        let periodY = Math.round(height / scale);
                        periodX = Math.max(1, periodX);
                        periodY = Math.max(1, periodY);
                        
                        let amplitude = 1;
                        let frequencyMult = 1;
                        for (let o = 0; o < octaves; o++) {
                            const pX = Math.max(1, Math.round(periodX * frequencyMult));
                            const pY = Math.max(1, Math.round(periodY * frequencyMult));
                            
                            const xScaled = u * pX;
                            const yScaled = v * pY;
                            
                            let n = noiseGen.worleySeamless(xScaled, yScaled, pX, pY, worleyType, isManhattan);
                            if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                            noiseValue += n * amplitude;
                            maxValue += amplitude;
                            amplitude *= persistence;
                            frequencyMult *= lacunarity;
                        }
                    }
                } else {
                    let amplitude = 1;
                    let frequency = 1;
                    for (let o = 0; o < octaves; o++) {
                        const sampleX = nx / scale * frequency;
                        const sampleY = ny / scale * frequency;
                        let n;
                        
                        if (noiseType === 'perlin') n = noiseGen.perlin(sampleX, sampleY);
                        else if (noiseType === 'value') n = noiseGen.value(sampleX, sampleY);
                        else n = noiseGen.worley(sampleX, sampleY, worleyType, isManhattan);
                        
                        if (ridged) { n = 1.0 - Math.abs(n); n = n * n; }
                        noiseValue += n * amplitude;
                        maxValue += amplitude;
                        amplitude *= persistence;
                        frequency *= lacunarity;
                    }
                }
                
                if (ridged) {
                    noiseValue = noiseValue / maxValue;
                } else {
                    noiseValue = (noiseValue / maxValue + 1) / 2;
                }
                
                if (invert) noiseValue = 1.0 - noiseValue;
                noiseValue = (noiseValue - 0.5) * contrast + 0.5 + brightness;
                noiseValue = Math.max(0, Math.min(1, noiseValue));
                if (thresholdEnable) noiseValue = noiseValue >= threshold ? 1.0 : 0.0;
                
                const lutIndex = Math.min(255, Math.floor(noiseValue * 256));
                const idx = (localY * width + x) * 4;
                chunkData[idx]     = gradientLUT[lutIndex * 4];
                chunkData[idx + 1] = gradientLUT[lutIndex * 4 + 1];
                chunkData[idx + 2] = gradientLUT[lutIndex * 4 + 2];
                chunkData[idx + 3] = 255;
            }
        }
        
        self.postMessage({
            type: 'CHUNK_COMPLETE',
            data: chunkData,
            startY: startY,
            endY: endY
        }, [chunkData.buffer]);
    }
};
