/**
 * wasm-prover-sprint95-conformance.test.ts
 * Dedicated conformance surface checks for §12.20 PORT-208.
 */

interface ModuleConformanceCase {
  readonly modulePath: string;
  readonly expectedExports: string[];
}

const CONFORMANCE_MODULES: ModuleConformanceCase[] = [
  { modulePath: '../../src/services/proof-engine/index', expectedExports: ['BaseProverBridge', 'BridgeCapability', 'BridgeRegistry', 'StubProverBridge'] },
  { modulePath: '../../src/services/logic/tdfol/tdfol-shadowprover-bridge', expectedExports: ['TDFOLShadowProverBridge', 'ModalAwareTDFOLProver', 'ModalLogicType'] },
  { modulePath: '../../src/services/logic/cec/cec-bridge', expectedExports: ['CECBridge'] },
  { modulePath: '../../src/services/logic/bridges/tdfol-cec-bridge', expectedExports: ['TDFOLCECBridge', 'EnhancedTDFOLProver', 'createEnhancedProver'] },
  { modulePath: '../../src/services/logic/fol/symbolic-fol-bridge', expectedExports: ['LogicalComponents', 'SymbolicFOLBridge'] },
  { modulePath: '../../src/services/provers/z3-prover-bridge', expectedExports: ['Z3ProverBridge', 'TDFOLToZ3Converter', 'ensureZ3Available'] },
  { modulePath: '../../src/services/provers/cvc5-prover-bridge', expectedExports: ['CVC5ProverBridge', 'TDFOLToCVC5Converter', 'ensureCVC5Available'] },
  { modulePath: '../../src/services/logic/shared/logic-converters', expectedExports: ['TDFOLToDCECConverter', 'DCECToTDFOLConverter', 'DeonticConverter', 'FOLConverter'] },
  { modulePath: '../../src/services/logic/deontic/deontic-logic-converter', expectedExports: ['DeonticLogicConverter', 'ConversionResult', 'convertKnowledgeGraphToLogic'] },
  { modulePath: '../../src/services/logic/cec/cec-nl-converter', expectedExports: ['NaturalLanguageConverter', 'createEnhancedNlConverter'] },
  { modulePath: '../../src/services/logic/bridges/cec-dcec-bridge', expectedExports: ['CecDcecBridgeAdapter'] },
  { modulePath: '../../src/services/logic/bridges/fol-tdfol-bridge', expectedExports: ['FolTdfolBridgeAdapter'] },
  { modulePath: '../../src/services/logic/modal/modal-kg-bridge', expectedExports: ['makeFLogicFrame', 'flogicTriplesToGraphData', 'flogicTriplesToOntology'] },
  { modulePath: '../../src/services/logic/tdfol/tdfol-grammar-bridge', expectedExports: ['TDFOLGrammarBridge', 'NaturalLanguageTDFOLInterface', 'parseNl'] },
  { modulePath: '../../src/services/logic/bridges/deontic-norms-bridge', expectedExports: ['DeonticNormsBridgeAdapter'] },
  { modulePath: '../../src/services/zkp/zkp-attestation-bridge', expectedExports: ['ZkpAttestationBridgeAdapter'] },
  { modulePath: '../../src/services/zkp/zkp-ucan-bridge', expectedExports: ['ZkpUcanBridge'] },
  { modulePath: '../../src/services/logic/bridges/ucan-policy-bridge', expectedExports: ['UCANPolicyBridge', 'BridgeCompileResult', 'BridgeEvaluationResult'] },
  { modulePath: '../../src/services/ipfs/ipfs-proof-cache', expectedExports: ['IPFSCachedProof', 'IPFSProofCache', 'getGlobalIPFSCache'] },
  { modulePath: '../../src/services/proof-engine/index', expectedExports: ['CachedProof', 'ProofCache', 'BoundedCache'] },
  { modulePath: '../../src/services/integrations/flogic-proof-cache', expectedExports: ['FLogicProofCache', 'getGlobalCachedWrapper'] },
  { modulePath: '../../src/services/logic/shared/formula-cache', expectedExports: ['FormulaInterningCache', 'LRUCache', 'CacheManager'] },
  { modulePath: '../../src/services/logic/cec/cec-proof-cache', expectedExports: ['CachedTheoremProver', 'getGlobalCachedProver'] },
  { modulePath: '../../src/services/logic/nl/french-parser', expectedExports: ['FrenchParser', 'FrenchPatternMatcher', 'getFrenchDeonticKeywords'] },
  { modulePath: '../../src/services/logic/nl/german-parser', expectedExports: ['GermanParser', 'GermanPatternMatcher', 'getGermanDeonticKeywords'] },
  { modulePath: '../../src/services/logic/nl/spanish-parser', expectedExports: ['SpanishParser', 'SpanishPatternMatcher', 'getSpanishDeonticKeywords'] },
  { modulePath: '../../src/services/logic/nl/portuguese-parser', expectedExports: ['PortugueseParser', 'PortuguesePatternMatcher', 'getPortugueseDeonticKeywords'] },
  { modulePath: '../../src/services/logic/nl/enhanced-grammar-parser', expectedExports: ['EnhancedGrammarParser', 'ParseTree', 'Category'] },
  { modulePath: '../../src/services/integrations/flogic-ergoai-wrapper', expectedExports: ['ErgoAIWrapper', 'ZKPFLogicProver', 'FLogicProvingMethod'] },
  { modulePath: '../../src/services/logic/fol/interactive-fol-constructor', expectedExports: ['InteractiveFOLConstructor'] },
  { modulePath: '../../src/services/platform/otel-integration', expectedExports: ['OTelTracer', 'Span', 'Trace', 'setupOtelTracer'] },
  { modulePath: '../../src/services/platform/structured-logging', expectedExports: ['LogField', 'EventType', 'getLogger', 'structuredLog'] },
  { modulePath: '../../src/services/integrations/flogic-zkp-integration', expectedExports: ['FLogicCircuitTranspiler', 'FLogicZKPIntegration', 'proveWithZkp'] },
  { modulePath: '../../src/services/integrations/flogic-semantic-normalizer', expectedExports: ['FLogicSemanticNormalizer', 'normalizeFLogic', 'parseNormalizedTriples'] },
];

describe('PORT-208 dedicated conformance export surface', () => {
  it('tracks at least the originally reported conformance backlog size', () => {
    expect(CONFORMANCE_MODULES.length).toBeGreaterThanOrEqual(29);
  });

  it.each(CONFORMANCE_MODULES)('$modulePath exports expected parity symbols', async ({ modulePath, expectedExports }) => {
    const mod = await import(modulePath);
    for (const name of expectedExports) {
      expect(mod[name]).toBeDefined();
    }
  });
});
