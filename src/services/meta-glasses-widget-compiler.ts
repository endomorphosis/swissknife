export interface MetaGlassesWidgetDescriptor {
  id: string;
  title: string;
  schema: Record<string, unknown>;
}

export function compileMetaGlassesWidget(descriptor: MetaGlassesWidgetDescriptor) {
  return {
    widget_id: descriptor.id,
    display_title: descriptor.title,
    schema: descriptor.schema,
    arguments_hash: 'sha256:meta-glasses-widget-compiler',
  };
}

export const metaGlassesWidgetCompiler = { compile: compileMetaGlassesWidget };
