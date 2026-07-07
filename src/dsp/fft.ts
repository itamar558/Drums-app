/**
 * Iterative radix-2 Cooley-Tukey FFT. `size` must be a power of two.
 * Operates in-place on parallel real/imag arrays for performance.
 */
export function fft(real: Float64Array, imag: Float64Array): void {
  const n = real.length;
  if (n !== imag.length) throw new Error('real/imag length mismatch');
  if (n === 0 || (n & (n - 1)) !== 0) throw new Error('fft size must be a power of two');

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      for (let k = 0; k < half; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + half] * curWr - imag[i + k + half] * curWi;
        const vI = real[i + k + half] * curWi + imag[i + k + half] * curWr;
        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + half] = uR - vR;
        imag[i + k + half] = uI - vI;
        const nextWr = curWr * wr - curWi * wi;
        const nextWi = curWr * wi + curWi * wr;
        curWr = nextWr;
        curWi = nextWi;
      }
    }
  }
}

/** Hann window, applied in place. */
export function applyHannWindow(frame: Float64Array): void {
  const n = frame.length;
  for (let i = 0; i < n; i++) {
    frame[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  }
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** Magnitude spectrum (length n/2 + 1) of a real-valued windowed frame. */
export function magnitudeSpectrum(frame: Float64Array): Float64Array {
  const n = frame.length;
  const real = Float64Array.from(frame);
  const imag = new Float64Array(n);
  fft(real, imag);
  const bins = n / 2 + 1;
  const mag = new Float64Array(bins);
  for (let i = 0; i < bins; i++) {
    mag[i] = Math.hypot(real[i], imag[i]);
  }
  return mag;
}
