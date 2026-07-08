export interface MetaGlassesDisplayFrame {
  id: string;
  title: string;
  body: string;
}

export class MetaGlassesDisplayORBAdapter {
  render(frame: MetaGlassesDisplayFrame) {
    return {
      type: 'meta-glasses-display-frame',
      frame,
    };
  }
}
