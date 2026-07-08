export interface MetaGlassesWidgetDescriptor {
  id: string;
  type: 'Text' | 'Button' | 'Image' | 'VideoPlayer' | 'FlexBox';
  props?: Record<string, unknown>;
}

export function compileMetaGlassesWidget(descriptor: MetaGlassesWidgetDescriptor) {
  return {
    ...descriptor,
    compiled: true,
  };
}
