export class Tensor {
  private data: any;
  private shape: number[];

  constructor(data: any, shape: number[]) {
    this.data = data;
    this.shape = shape;
  }

  getData(): any {
    return this.data;
  }

  getShape(): number[] {
    return this.shape;
  }

  // Add methods for tensor operations as needed
}
