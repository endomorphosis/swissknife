/**
 * CEC Context Manager — T-272
 * Port of CEC/native/context_manager.py (423L)
 */

export enum EntityType { AGENT='agent', OBJECT='object', EVENT='event', TIME='time', LOCATION='location', PROPERTY='property' }

export interface Entity { name: string; entityType: EntityType; properties: Record<string,unknown>; mentions: number[] }
export function makeEntity(name: string, entityType: EntityType): Entity { return { name, entityType, properties: {}, mentions: [] }; }

export interface ContextState {
  entities: Map<string, Entity>;
  focus:    Entity | null;
  history:  string[];
  position: number;
}

export function makeContextState(): ContextState {
  return { entities: new Map(), focus: null, history: [], position: 0 };
}

export class ContextManager {
  private state: ContextState = makeContextState();

  updateContext(text: string): void {
    this.state.history.push(text);
    this.state.position++;
    // Heuristic: extract capitalized nouns as entities
    const words = text.split(/\s+/);
    for (const w of words) {
      if (w.length > 1 && /^[A-Z]/.test(w)) {
        const name = w.replace(/[^a-zA-Z]/g, '');
        if (name && !this.state.entities.has(name)) {
          const e = makeEntity(name, EntityType.AGENT);
          this.state.entities.set(name, e);
        }
        const e = this.state.entities.get(name);
        if (e) { e.mentions.push(this.state.position); this.state.focus = e; }
      }
    }
  }

  resolve(pronoun: string): Entity | null {
    if (this.state.focus) return this.state.focus;
    return this.state.entities.values().next().value ?? null;
  }

  getEntities(): Entity[] { return [...this.state.entities.values()]; }
  getFocus(): Entity | null { return this.state.focus; }
  reset(): void { this.state = makeContextState(); }
  getState(): Readonly<ContextState> { return this.state; }
}

export class AnaphoraResolver {
  private readonly pronouns = new Set(['he', 'she', 'it', 'they', 'him', 'her', 'them', 'his', 'its']);

  resolve(text: string, ctx: ContextManager): string {
    return text.split(/\s+/).map(w => {
      if (this.pronouns.has(w.toLowerCase())) {
        const e = ctx.resolve(w);
        return e ? e.name : w;
      }
      return w;
    }).join(' ');
  }
}

export class DiscourseAnalyzer {
  analyze(text: string): { sentences: string[]; entities: string[]; hasDeontic: boolean } {
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    const entities = [...text.matchAll(/\b[A-Z][a-z]+\b/g)].map(m => m[0]);
    const hasDeontic = /\b(must|shall|may|obligat|permit|forbid|prohibited)\b/i.test(text);
    return { sentences, entities: [...new Set(entities)], hasDeontic };
  }
}
