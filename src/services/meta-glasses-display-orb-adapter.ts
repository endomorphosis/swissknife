export interface MetaGlassesDisplayORBWidget {
  id: string;
  type: 'text' | 'button' | 'image' | 'list' | 'status';
  props: Record<string, unknown>;
}

export class MetaGlassesDisplayORBAdapter {
  adapt(widget: MetaGlassesDisplayORBWidget) {
    return {
      target_surface: 'meta_glasses_display',
      widget,
      allowed_surfaces: ['mobile', 'meta_glasses', 'agent'],
    };
  }
}

export const metaGlassesDisplayORBAdapter = new MetaGlassesDisplayORBAdapter();
