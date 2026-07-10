/**
 * wasm-prover-sprint95-conformance.test.ts
 * Dedicated conformance surface checks for §12.20 PORT-208.
 */

interface ModuleConformanceCase {
  readonly modulePath: string;
  readonly expectedExports: string[];
}

const CONFORMANCE_MODULES: ModuleConformanceCase[] = [
  { modulePath: '../../src/services/base-prover-bridge', expectedExports: ['BaseProverBridge', 'BridgeCapability', 'BridgeRegistry', 'StubProverBridge'] },
  { modulePath: '../../src/services/tdfol-shadowprover-bridge', expectedExports: ['TDFOLShadowProverBridge', 'ModalAwareTDFOLProver', 'ModalLogicType'] },
  { modulePath: '../../src/services/cec-bridge', expectedExports: ['CECBridge'] },
  { modulePath: '../../src/services/tdfol-cec-bridge', expectedExports: ['TDFOLCECBridge', 'EnhancedTDFOLProver', 'createEnhancedProver'] },
  { modulePath: '../../src/services/symbolic-fol-bridge', expectedExports: ['LogicalComponents', 'SymbolicFOLBridge'] },
  { modulePath: '../../src/services/z3-prover-bridge', expectedExports: ['Z3ProverBridge', 'TDFOLToZ3Converter', 'ensureZ3Available'] },
  { modulePath: '../../src/services/cvc5-prover-bridge', expectedExports: ['CVC5ProverBridge', 'TDFOLToCVC5Converter', 'ensureCVC5Available'] },
  { modulePath: '../../src/services/logic-converters', expectedExports: ['TDFOLToDCECConverter', 'DCECToTDFOLConverter', 'DeonticConverter', 'FOLConverter'] },
  { modulePath: '../../src/services/deontic-logic-converter', expectedExports: ['DeonticLogicConverter', 'ConversionResult', 'convertKnowledgeGraphToLogic'] },
  { modulePath: '../../src/services/cec-nl-converter', expectedExports: ['NaturalLanguageConverter', 'createEnhancedNlConverter'] },
  { modulePath: '../../src/services/cec-dcec-bridge', expectedExports: ['CecDcecBridgeAdapter'] },
  { modulePath: '../../src/services/fol-tdfol-bridge', expectedExports: ['FolTdfolBridgeAdapter'] },
  { modulePath: '../../src/services/modal-kg-bridge', expectedExports: ['makeFLogicFrame', 'flogicTriplesToGraphData', 'flogicTriplesToOntology'] },
  { modulePath: '../../src/services/tdfol-grammar-bridge', expectedExports: ['TDFOLGrammarBridge', 'NaturalLanguageTDFOLInterface', 'parseNl'] },
  { modulePath: '../../src/services/deontic-norms-bridge', expectedExports: ['DeonticNormsBridgeAdapter'] },
  { modulePath: '../../src/services/zkp-attestation-bridge', expectedExports: ['ZkpAttestationBridgeAdapter'] },
  { modulePath: '../../src/services/zkp/zkp-ucan-bridge', expectedExports: ['ZKPToUCANBridge', 'getZkpUcanBridge'] },
  { modulePath: '../../src/services/ucan-policy-bridge', expectedExports: ['UCANPolicyBridge', 'BridgeCompileResult', 'BridgeEvaluationResult'] },
  { modulePath: '../../src/services/ipfs/ipfs-proof-cache', expectedExports: ['IPFSCachedProof', 'IPFSProofCache', 'getGlobalIPFSCache'] },
  { modulePath: '../../src/services/proof-cache-base', expectedExports: ['CachedProof', 'ProofCache', 'BoundedCache'] },
  { modulePath: '../../src/services/flogic-proof-cache', expectedExports: ['FLogicProofCache', 'getGlobalCachedWrapper'] },
  { modulePath: '../../src/services/formula-cache', expectedExports: ['FormulaInterningCache', 'LRUCache', 'CacheManager'] },
  { modulePath: '../../src/services/cec-proof-cache', expectedExports: ['CachedTheoremProver', 'getGlobalCachedProver'] },
  { modulePath: '../../src/services/french-parser', expectedExports: ['FrenchParser', 'FrenchPatternMatcher', 'getFrenchDeonticKeywords'] },
  { modulePath: '../../src/services/german-parser', expectedExports: ['GermanParser', 'GermanPatternMatcher', 'getGermanDeonticKeywords'] },
  { modulePath: '../../src/services/spanish-parser', expectedExports: ['SpanishParser', 'SpanishPatternMatcher', 'getSpanishDeonticKeywords'] },
  { modulePath: '../../src/services/portuguese-parser', expectedExports: ['PortugueseParser', 'PortuguesePatternMatcher', 'getPortugueseDeonticKeywords'] },
  { modulePath: '../../src/services/enhanced-grammar-parser', expectedExports: ['EnhancedGrammarParser', 'ParseTree', 'Category'] },
  { modulePath: '../../src/services/flogic-ergoai-wrapper', expectedExports: ['ErgoAIWrapper', 'ZKPFLogicProver', 'FLogicProvingMethod'] },
  { modulePath: '../../src/services/interactive-fol-constructor', expectedExports: ['InteractiveFOLConstructor'] },
  { modulePath: '../../src/services/otel-integration', expectedExports: ['OTelTracer', 'Span', 'Trace', 'setupOtelTracer'] },
  { modulePath: '../../src/services/structured-logging', expectedExports: ['LogField', 'EventType', 'getLogger', 'structuredLog'] },
  { modulePath: '../../src/services/flogic-zkp-integration', expectedExports: ['FLogicCircuitTranspiler', 'FLogicZKPIntegration', 'proveWithZkp'] },
  { modulePath: '../../src/services/flogic-semantic-normalizer', expectedExports: ['FLogicSemanticNormalizer', 'normalizeFLogic', 'parseNormalizedTriples'] },
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
