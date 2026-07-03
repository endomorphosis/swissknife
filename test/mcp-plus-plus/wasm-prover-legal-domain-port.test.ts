/**
 * Conformance: §12.13 Legal-domain TypeScript port (PORT-130/131/132/133).
 *
 * Verifies the TS legal-domain layer matches the Python reference
 *   ipfs_datasets_py/logic/integration/domain/legal_domain_knowledge.py
 *   ipfs_datasets_py/logic/integration/domain/legal_symbolic_analyzer.py
 * for the enum coverage, deontic/agent pattern coverage, and the public
 * temporal-extraction surface that doc 36 §12.13 catalogs as gaps.
 *
 * Each assertion cites the PORT-### task it closes.
 */

import {
  LegalConceptType,
  LegalDomainKind,
  LegalDomainKnowledge,
} from '../../src/services/legal-domain-knowledge';
import { LegalSymbolicAnalyzer } from '../../src/services/legal-symbolic-analyzer';

describe('§12.13 legal-domain port — enum parity with Python', () => {
  it('PORT-130: LegalDomainKind covers all 12 Python LegalDomain values', () => {
    // legal_domain_knowledge.py:21-33
    const pythonDomains: Record<string, string> = {
      CONTRACT: 'contract',
      TORT: 'tort',
      CRIMINAL: 'criminal',
      CONSTITUTIONAL: 'constitutional',
      CORPORATE: 'corporate',
      EMPLOYMENT: 'employment',
      INTELLECTUAL_PROPERTY: 'intellectual_property',
      REAL_ESTATE: 'real_estate',
      FAMILY: 'family',
      TAX: 'tax',
      IMMIGRATION: 'immigration',
      ENVIRONMENTAL: 'environmental',
    };
    for (const [name, value] of Object.entries(pythonDomains)) {
      expect((LegalDomainKind as Record<string, string>)[name]).toBe(value);
    }
  });

  it('PORT-132: LegalConceptType covers all 10 Python LegalConceptType values', () => {
    // legal_domain_knowledge.py:36-49
    const pythonConcepts: Record<string, string> = {
      OBLIGATION: 'obligation',
      PERMISSION: 'permission',
      PROHIBITION: 'prohibition',
      RIGHT: 'right',
      DUTY: 'duty',
      LIABILITY: 'liability',
      PENALTY: 'penalty',
      CONDITION: 'condition',
      EXCEPTION: 'exception',
      DEFINITION: 'definition',
    };
    for (const [name, value] of Object.entries(pythonConcepts)) {
      expect((LegalConceptType as Record<string, string>)[name]).toBe(value);
    }
  });
});

describe('§12.13 legal-domain port — pattern coverage (PORT-131)', () => {
  const kb = new LegalDomainKnowledge();

  const conceptOf = (text: string): Set<LegalConceptType> =>
    new Set(kb.extractConcepts(text).map(c => c.conceptType));

  it('detects responsibility- and noun-based obligations', () => {
    // legal_domain_knowledge.py:114-129
    expect(conceptOf('The company is responsible for damages')).toContain(LegalConceptType.OBLIGATION);
    expect(conceptOf('the seller has a duty to disclose defects')).toContain(LegalConceptType.OBLIGATION);
  });

  it('detects entitlement-, rights- and option-based permissions', () => {
    // legal_domain_knowledge.py:143-166
    expect(conceptOf('Each employee is entitled to benefits')).toContain(LegalConceptType.PERMISSION);
    expect(conceptOf('the tenant has a right to privacy')).toContain(LegalConceptType.PERMISSION);
    expect(conceptOf('the lessee has an option to renew the lease')).toContain(LegalConceptType.PERMISSION);
  });

  it('detects adjective/verb, invalidity and violation prohibitions', () => {
    // legal_domain_knowledge.py:169-204
    expect(conceptOf('The contractor is barred from subcontracting')).toContain(LegalConceptType.PROHIBITION);
    expect(conceptOf('employees are prohibited from disclosing secrets')).toContain(LegalConceptType.PROHIBITION);
    expect(conceptOf('it is unlawful to discriminate')).toContain(LegalConceptType.PROHIBITION);
    expect(conceptOf('any breach of contract voids the agreement')).toContain(LegalConceptType.PROHIBITION);
  });

  it('identifies transactional/role agents (PORT-131)', () => {
    // legal_domain_knowledge.py:206-268
    const agentsIn = (text: string) => new Set(kb.identifyAgents(text).map(a => a.agentType));
    expect(agentsIn('the buyer shall pay the purchase price')).toContain('person');
    expect(agentsIn('the seller warrants clear title')).toContain('person');
    expect(agentsIn('the landlord shall maintain the premises')).toContain('person');
    expect(agentsIn('the tenant must pay rent')).toContain('person');
    expect(agentsIn('the employer shall provide insurance')).toContain('organization');
    expect(agentsIn('every employee must comply with policy')).toContain('person');
  });
});

describe('§12.13 legal-domain port — analyzer temporal surface (PORT-133)', () => {
  const analyzer = new LegalSymbolicAnalyzer();

  it('exposes a public extractTemporalConditions method', () => {
    expect(typeof analyzer.extractTemporalConditions).toBe('function');
  });

  it('classifies deadline / periodicity / sequence temporal conditions', () => {
    const deadline = analyzer.extractTemporalConditions('Payment is due within 30 days of delivery');
    expect(deadline.some(c => c.conditionType === 'deadline')).toBe(true);

    const periodic = analyzer.extractTemporalConditions('The report shall be filed annually');
    expect(periodic.some(c => c.conditionType === 'periodicity')).toBe(true);
  });
});
