/**
 * Utilities for model quantization, adapting concepts from ipfs_accelerate_js.
 * Provides definitions and potentially functions for applying quantization.
 */

/**
 * Defines the available quantization precision levels.
 */
export enum QuantizationPrecision {
  TwoBit = '2-bit',
  ThreeBit = '3-bit',
  FourBit = '4-bit',
  EightBit = '8-bit', // Commonly used (e.g., int8)
  SixteenBit = '16-bit', // Often the baseline (e.g., fp16)
  ThirtyTwoBit = '32-bit' // Baseline for float (fp32)
}

/**
 * Configuration options for applying quantization to a model or tensor.
 */
export interface QuantizationConfig {
  precision: QuantizationPrecision;
  scheme?: 'symmetric' | 'asymmetric'; // Quantization scheme (optional, defaults may apply)
  groupSize?: number; // For grouped quantization techniques (optional)
  mixedPrecision?: boolean; // Allow mixing precisions for different layers (optional)
  // Add other relevant quantization parameters as needed
}

/**
 * A helper class or namespace for quantization-related operations.
 * This could contain static methods or be instantiated.
 */
export class ModelQuantizer {

  /**
   * Calculates the theoretical memory reduction factor for a given precision
   * compared to a 32-bit baseline (e.g., fp32).
   * @param {QuantizationPrecision} precision - The target quantization precision.
   * @returns {number} The memory reduction factor (e.g., 0.75 for 4-bit means 75% reduction).
   */
  static getMemoryReductionFactor(precision: QuantizationPrecision): number {
    switch (precision) {
      case QuantizationPrecision.TwoBit:
        return 1.0 - (2 / 32); // (32-2)/32 = 30/32 = 15/16 = 0.9375 reduction factor? No, size reduction. 2/32 = 1/16. Size is 1/16th. Reduction is 15/16. Let's recalculate based on size ratio.
      case QuantizationPrecision.ThreeBit:
        return 1.0 - (3 / 32); // Size is 3/32. Reduction is 29/32.
      case QuantizationPrecision.FourBit:
        return 1.0 - (4 / 32); // Size is 4/32 = 1/8. Reduction is 7/8 = 0.875
      case QuantizationPrecision.EightBit:
        return 1.0 - (8 / 32); // Size is 8/32 = 1/4. Reduction is 3/4 = 0.75
      case QuantizationPrecision.SixteenBit:
        return 1.0 - (16 / 32); // Size is 16/32 = 1/2. Reduction is 1/2 = 0.5
      case QuantizationPrecision.ThirtyTwoBit:
      default:
        return 0; // No reduction from baseline
    }
    // Let's redo the calculation based on the example in the plan (which seemed off)
    // Plan example: 4-bit = 0.75 reduction. This implies 1 - (new_size / old_size).
    // If old=32, new=4, reduction = 1 - (4/32) = 1 - 1/8 = 7/8 = 0.875.
    // The plan's example value (0.75) corresponds to 8-bit. Let's follow the formula 1 - (bits/32).
  }

   /**
   * Calculates the theoretical size ratio compared to a 32-bit baseline.
   * @param {QuantizationPrecision} precision - The target quantization precision.
   * @returns {number} The size ratio (e.g., 0.125 for 4-bit means 1/8th the size).
   */
  static getSizeRatio(precision: QuantizationPrecision): number {
    switch (precision) {
      case QuantizationPrecision.TwoBit: return 2 / 32;
      case QuantizationPrecision.ThreeBit: return 3 / 32;
      case QuantizationPrecision.FourBit: return 4 / 32;
      case QuantizationPrecision.EightBit: return 8 / 32;
      case QuantizationPrecision.SixteenBit: return 16 / 32;
      case QuantizationPrecision.ThirtyTwoBit:
      default: return 1.0; // Baseline size
    }
  }


  /**
   * Quantize a Float32Array to int8 (symmetric) or uint8 (asymmetric).
   * Returns a QuantizedTensor with scale (and optional zeroPoint).
   */
  static quantizeTensor(data: Float32Array, config: QuantizationConfig): QuantizedTensor {
    const bits = ModelQuantizer._bitsForPrecision(config.precision);

    if (config.scheme === 'asymmetric') {
      // Asymmetric: uint8 quantization
      const qMax  = (1 << bits) - 1;
      const dMin  = Math.min(...data);
      const dMax  = Math.max(...data);
      const scale = (dMax - dMin) / qMax || 1;
      const zp    = Math.round(-dMin / scale);
      const out   = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        out[i] = Math.min(qMax, Math.max(0, Math.round(data[i]! / scale + zp)));
      }
      return { data: out, scale, zeroPoint: zp, precision: config.precision, originalShape: [data.length] };
    }

    // Symmetric: int8 quantization
    const qMax  = (1 << (bits - 1)) - 1;
    const absMax = Math.max(...data.map(Math.abs)) || 1;
    const scale  = absMax / qMax;
    const out    = new Int8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      out[i] = Math.min(qMax, Math.max(-qMax - 1, Math.round(data[i]! / scale)));
    }
    return { data: out, scale, precision: config.precision, originalShape: [data.length] };
  }

  /** Restore a Float32Array from a QuantizedTensor (inverse of quantizeTensor). */
  static dequantizeTensor(qt: QuantizedTensor): Float32Array {
    const raw  = qt.data instanceof Int8Array   ? qt.data as Int8Array
               : qt.data instanceof Uint8Array  ? qt.data as Uint8Array
               : new Int8Array(qt.data as ArrayBuffer);
    const out  = new Float32Array(raw.length);
    const scale  = typeof qt.scale === 'number' ? qt.scale : 1;
    const zp     = typeof qt.zeroPoint === 'number' ? qt.zeroPoint : 0;
    for (let i = 0; i < raw.length; i++) {
      out[i] = (raw[i]! - zp) * scale;
    }
    return out;
  }

  private static _bitsForPrecision(p: QuantizationPrecision): number {
    switch (p) {
      case QuantizationPrecision.TwoBit:      return 2;
      case QuantizationPrecision.ThreeBit:    return 3;
      case QuantizationPrecision.FourBit:     return 4;
      case QuantizationPrecision.EightBit:    return 8;
      case QuantizationPrecision.SixteenBit:  return 16;
      default:                                return 32;
    }
  }
}

export interface QuantizedTensor {
  data: Int8Array | Uint8Array | ArrayBuffer; // Or other appropriate type for quantized data
  scale: number | number[]; // Scale factor(s) for dequantization
  zeroPoint?: number | number[]; // Zero point(s) for asymmetric quantization (optional)
  precision: QuantizationPrecision;
  originalShape: number[];
  // Add other metadata as needed (e.g., quantization scheme used)
}
