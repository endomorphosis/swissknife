/**
 * modal-kg-bridge.ts
 *
 * Bridge modal F-logic IR into Neo4j-compatible graph data.
 * TypeScript port of ipfs_datasets_py/logic/modal/kg_bridge.py
 *
 * Provides:
 *   NodeData / RelationshipData / GraphData  — Neo4j migration types
 *   FLogicFrame / FLogicOntology             — F-logic ontology structures
 *   flogicTriplesToGraphData()               — triples → GraphData
 *   flogicTriplesToOntology()                — triples → FLogicOntology
 *   modalIrToNeo4jGraphData()                — modal IR views → GraphData
 *   flogicOntologyToDict()                   — ontology → plain object
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Neo4j migration types
// ---------------------------------------------------------------------------

export interface NodeData {
  id: string;
  labels: string[];
  properties: Record<string, unknown>;
}

export interface RelationshipData {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphData {
  graphId: string;
  nodes: NodeData[];
  relationships: RelationshipData[];
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// F-logic ontology types
// ---------------------------------------------------------------------------

export interface FLogicFrame {
  objectId: string;
  scalarMethods: Record<string, string>;
  setMethods: Record<string, string[]>;
  isa?: string;

  toErgoString(): string;
}

export function makeFLogicFrame(
  objectId: string,
  scalarMethods: Record<string, string> = {},
  setMethods: Record<string, string[]> = {},
  isa?: string,
): FLogicFrame {
  return {
    objectId,
    scalarMethods,
    setMethods,
    isa,
    toErgoString(): string {
      const parts: string[] = [];
      if (isa) parts.push(`${objectId}:${isa}`);
      for (const [k, v] of Object.entries(scalarMethods)) {
        parts.push(`${objectId}[${k}->${JSON.stringify(v)}]`);
      }
      for (const [k, vs] of Object.entries(setMethods)) {
        for (const v of vs) parts.push(`${objectId}[${k}->>${JSON.stringify(v)}]`);
      }
      return parts.join('. ');
    },
  };
}

export interface FLogicOntology {
  name: string;
  frames: FLogicFrame[];
}

// ---------------------------------------------------------------------------
// Internal labels + helpers
// ---------------------------------------------------------------------------

const FLOGIC_RESOURCE_LABEL = 'FLogicResource';
const FLOGIC_VALUE_LABEL     = 'FLogicValue';
const FLOGIC_CLASS_LABEL     = 'FLogicClass';
const FLOGIC_FRAME_LABEL     = 'FLogicFrame';
const MODAL_FORMULA_LABEL    = 'ModalFormula';
const LEGAL_MODAL_DOCUMENT_LABEL = 'LegalModalDocument';

const FRAME_PREDICATES = new Set([
  'candidate_ontology_frame',
  'interpreted_in_frame',
  'selected_ontology_frame',
]);

const VALUE_LABELS_BY_PREDICATE: Record<string, string> = {
  modal_family: 'ModalFamily',
  modal_operator: 'ModalOperator',
  modal_system: 'ModalSystem',
  predicate: 'LegalPredicate',
  predicate_role: 'LegalPredicateRole',
  source: 'LegalSource',
};

function normalizeTriple(
  triple: Record<string, unknown>,
): { subject: string; predicate: string; object: string } {
  return {
    subject: String(triple['subject'] ?? '').trim(),
    predicate: String(triple['predicate'] ?? '').trim(),
    object: String(triple['object'] ?? '').trim(),
  };
}

function neo4jLabel(value: string, fallback: string): string {
  if (!value) return fallback;
  return value
    .replace(/[^A-Za-z0-9_]/g, '_')
    .replace(/^_+/, '')
    .replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase()) || fallback;
}

function relType(predicate: string): string {
  return predicate.toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function nodeId(value: string): string {
  if (!value) return 'unknown';
  return value.replace(/[^A-Za-z0-9_:\-@./]/g, '_');
}

function relId(index: number, subject: string, predicate: string, obj: string): string {
  const h = createHash('sha256')
    .update(`${subject}|${predicate}|${obj}`, 'utf8')
    .digest('hex')
    .slice(0, 8);
  return `rel_${index}_${h}`;
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

function ensureNode(nodeMap: Map<string, NodeData>, id: string, labels: string[]): NodeData {
  if (!nodeMap.has(id)) {
    nodeMap.set(id, { id: nodeId(id), labels: [...labels], properties: { flogic_id: id } });
  }
  return nodeMap.get(id)!;
}

function addLabel(node: NodeData, label: string): void {
  if (!node.labels.includes(label)) node.labels.push(label);
}

// ---------------------------------------------------------------------------
// flogicTriplesToGraphData
// ---------------------------------------------------------------------------

/**
 * Convert F-logic `subject/predicate/object` triples into a Neo4j-compatible
 * `GraphData` structure suitable for graph migration.
 */
export function flogicTriplesToGraphData(
  triples: Array<Record<string, unknown>>,
  opts: { graphId?: string; metadata?: Record<string, unknown> } = {},
): GraphData {
  const graphId = opts.graphId ?? `flogic:${createHash('sha256').update(JSON.stringify(triples).slice(0, 512)).digest('hex').slice(0, 12)}`;
  const nodeMap = new Map<string, NodeData>();
  const relationships: RelationshipData[] = [];

  const normalized = triples.map(t => normalizeTriple(t as Record<string, unknown>));

  for (let i = 0; i < normalized.length; i++) {
    const { subject, predicate, object } = normalized[i];
    if (!subject || !predicate || !object) continue;

    const subjectNode = ensureNode(nodeMap, subject, [FLOGIC_RESOURCE_LABEL]);
    let objectLabels: string[] = [FLOGIC_VALUE_LABEL];

    if (predicate === 'type') {
      objectLabels = [FLOGIC_CLASS_LABEL];
      addLabel(subjectNode, neo4jLabel(object, 'FLogicType'));
      if (object === 'legal_modal_document') addLabel(subjectNode, LEGAL_MODAL_DOCUMENT_LABEL);
    } else if (predicate === 'belongs_to_document') {
      addLabel(subjectNode, MODAL_FORMULA_LABEL);
    } else if (FRAME_PREDICATES.has(predicate)) {
      objectLabels = [FLOGIC_FRAME_LABEL, FLOGIC_RESOURCE_LABEL];
    }

    const valueLabel = VALUE_LABELS_BY_PREDICATE[predicate];
    if (valueLabel) objectLabels.push(valueLabel);

    const objNode = ensureNode(nodeMap, object, objectLabels);
    for (const lbl of objectLabels) addLabel(objNode, lbl);

    relationships.push({
      id: relId(i, subject, predicate, object),
      source: nodeId(subject),
      target: nodeId(object),
      type: relType(predicate),
      properties: { predicate },
    });
  }

  return {
    graphId,
    nodes: [...nodeMap.values()],
    relationships,
    metadata: {
      input_triple_count: triples.length,
      node_count: nodeMap.size,
      relationship_count: relationships.length,
      ...opts.metadata,
    },
  };
}

// ---------------------------------------------------------------------------
// flogicTriplesToOntology
// ---------------------------------------------------------------------------

/**
 * Build a compact `FLogicOntology` from simple triples.
 * Groups triples by subject into frames; `type` predicate becomes `isa`.
 */
export function flogicTriplesToOntology(
  triples: Array<Record<string, unknown>>,
  opts: { name?: string } = {},
): FLogicOntology {
  const name = opts.name ?? 'modal_flogic_ir';
  const bySubject = new Map<string, Map<string, string[]>>();

  for (const triple of triples) {
    const n = normalizeTriple(triple as Record<string, unknown>);
    if (!n.subject || !n.predicate || !n.object) continue;
    if (!bySubject.has(n.subject)) bySubject.set(n.subject, new Map());
    const methods = bySubject.get(n.subject)!;
    if (!methods.has(n.predicate)) methods.set(n.predicate, []);
    methods.get(n.predicate)!.push(n.object);
  }

  const frames: FLogicFrame[] = [];
  for (const [subject, methods] of [...bySubject.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const scalarMethods: Record<string, string> = {};
    const setMethods: Record<string, string[]> = {};
    let isa: string | undefined;

    for (const [predicate, values] of [...methods.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const uniq = unique(values);
      if (predicate === 'type' && uniq.length > 0) {
        isa = uniq[0];
        continue;
      }
      if (uniq.length === 1) scalarMethods[predicate] = uniq[0];
      else setMethods[predicate] = uniq;
    }

    frames.push(makeFLogicFrame(subject, scalarMethods, setMethods, isa));
  }

  return { name, frames };
}

// ---------------------------------------------------------------------------
// modalIrToNeo4jGraphData
// ---------------------------------------------------------------------------

/**
 * Convert the `frame_logic` triples from a set of bridge views into GraphData.
 */
export function modalIrToNeo4jGraphData(
  docId: string,
  views: Record<string, { payload?: Record<string, unknown> }>,
  opts: { metadata?: Record<string, unknown> } = {},
): GraphData {
  const triples: Array<Record<string, unknown>> = [];

  for (const view of Object.values(views)) {
    const payload = view.payload ?? {};
    const viewTriples = payload['triples'] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(viewTriples)) triples.push(...viewTriples);
  }

  return flogicTriplesToGraphData(triples, {
    graphId: `${docId}:neo4j`,
    metadata: { document_id: docId, source: 'modal_ir', ...opts.metadata },
  });
}

// ---------------------------------------------------------------------------
// flogicOntologyToDict
// ---------------------------------------------------------------------------

export function flogicOntologyToDict(ontology: FLogicOntology): Record<string, unknown> {
  return {
    frame_count: ontology.frames.length,
    frames: ontology.frames.map(f => f.toErgoString()),
    name: ontology.name,
  };
}
