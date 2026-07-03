import { logger } from '../../utils/logger.js';

export type TensorData = Float32Array | Float64Array | Int32Array | Uint8Array;

export class Tensor {
  private readonly _data: TensorData;
  private readonly _shape: number[];

  constructor(data: TensorData | number[], shape: number[]) {
    // Validate shape product matches data length
    const numel = shape.reduce((a, b) => a * b, 1);
    const arr   = data instanceof Float32Array || data instanceof Float64Array ||
                  data instanceof Int32Array  || data instanceof Uint8Array
                    ? data : new Float32Array(data as number[]);
    if (arr.length !== numel) {
      throw new Error(`Tensor shape ${JSON.stringify(shape)} implies ${numel} elements but got ${arr.length}`);
    }
    this._data  = arr;
    this._shape = [...shape];
    logger.debug(`Tensor created with shape: [${shape.join(', ')}]`);
  }

  getData(): TensorData   { return this._data; }
  getShape(): number[]    { return [...this._shape]; }
  get size(): number      { return this._data.length; }

  /** Reshape to a new shape (must have the same total element count). */
  reshape(newShape: number[]): Tensor {
    const numel = newShape.reduce((a, b) => a * b, 1);
    if (numel !== this._data.length) throw new Error(`Cannot reshape ${this._data.length} elements to ${JSON.stringify(newShape)}`);
    return new Tensor(this._data.slice() as TensorData, newShape);
  }

  /** Return a flat 1-D slice of elements [start, end). */
  slice(start: number, end?: number): Tensor {
    const e = end ?? this._data.length;
    return new Tensor((this._data as Float32Array).slice(start, e) as TensorData, [e - start]);
  }

  /** Element-wise addition. */
  add(other: Tensor): Tensor {
    this._assertSameShape(other);
    const out = new Float32Array(this._data.length);
    for (let i = 0; i < out.length; i++) out[i] = (this._data[i] as number) + (other._data[i] as number);
    return new Tensor(out, [...this._shape]);
  }

  /** Element-wise multiplication. */
  multiply(other: Tensor): Tensor {
    this._assertSameShape(other);
    const out = new Float32Array(this._data.length);
    for (let i = 0; i < out.length; i++) out[i] = (this._data[i] as number) * (other._data[i] as number);
    return new Tensor(out, [...this._shape]);
  }

  /** Element-wise scalar multiply. */
  scale(s: number): Tensor {
    const out = new Float32Array(this._data.length);
    for (let i = 0; i < out.length; i++) out[i] = (this._data[i] as number) * s;
    return new Tensor(out, [...this._shape]);
  }

  /** 2-D transpose (only valid for rank-2 tensors). */
  transpose(): Tensor {
    if (this._shape.length !== 2) throw new Error('transpose() only supports rank-2 tensors');
    const [rows, cols] = this._shape as [number, number];
    const out = new Float32Array(rows * cols);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        out[c * rows + r] = this._data[r * cols + c] as number;
    return new Tensor(out, [cols, rows]);
  }

  /** 2-D matrix multiply (A×B). */
  matmul(other: Tensor): Tensor {
    const [m, k ] = this._shape as [number, number];
    const [k2, n] = other._shape as [number, number];
    if (this._shape.length !== 2 || other._shape.length !== 2) throw new Error('matmul() requires rank-2 tensors');
    if (k !== k2) throw new Error(`matmul shape mismatch: [${m},${k}] × [${k2},${n}]`);
    const out = new Float32Array(m * n);
    for (let i = 0; i < m; i++)
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let p = 0; p < k; p++) s += (this._data[i * k + p] as number) * (other._data[p * n + j] as number);
        out[i * n + j] = s;
      }
    return new Tensor(out, [m, n]);
  }

  /** Element-wise clamp to [min, max]. */
  clamp(min: number, max: number): Tensor {
    const out = new Float32Array(this._data.length);
    for (let i = 0; i < out.length; i++) out[i] = Math.min(max, Math.max(min, this._data[i] as number));
    return new Tensor(out, [...this._shape]);
  }

  private _assertSameShape(other: Tensor): void {
    if (JSON.stringify(this._shape) !== JSON.stringify(other._shape))
      throw new Error(`Shape mismatch: ${JSON.stringify(this._shape)} vs ${JSON.stringify(other._shape)}`);
  }
}
