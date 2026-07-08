/**
 * NL UCAN Policy Compiler — T-264
 * Port of integration/nl_ucan_policy_compiler.py (494L)
 */

import { PatternMatcher, PatternType } from '../shared/tdfol-nl-patterns';

export interface UCANCapability { can: string; with: string; [key: string]: unknown; }
export interface UCANToken { issuer: string; audience: string; capabilities: UCANCapability[]; notBefore?: string; expiration?: string; }

export interface NLUCANCompilerResult {
  text:         string;
  ucans:        UCANToken[];
  capabilities: UCANCapability[];
  confidence:   number;
  warnings:     string[];
  parseMethod:  string;
}

export interface NLUCANCompilerStats {
  totalCompiled: number; succeeded: number; failed: number; totalCapabilities: number;
}

export class NLUCANPolicyCompiler {
  private readonly matcher = new PatternMatcher();
  private readonly stats: NLUCANCompilerStats = { totalCompiled: 0, succeeded: 0, failed: 0, totalCapabilities: 0 };

  compile(text: string, opts: { issuer?: string; audience?: string } = {}): NLUCANCompilerResult {
    this.stats.totalCompiled++;
    const matches = this.matcher.match(text);
    const capabilities: UCANCapability[] = [];
    const warnings: string[] = [];

    for (const m of matches) {
      const action = m.entities['action'] ?? m.text;
      const resource = m.entities['resource'] ?? '*';
      let can = 'allow';
      if (m.pattern.type === PatternType.OBLIGATION)  can = 'require';
      else if (m.pattern.type === PatternType.PERMISSION)  can = 'allow';
      else if (m.pattern.type === PatternType.PROHIBITION) can = 'deny';
      else continue;
      capabilities.push({ can: `${can}/${action.replace(/\s+/g, '-').toLowerCase()}`, with: resource });
    }

    if (capabilities.length === 0) warnings.push('No UCAN capabilities extracted');

    const ucan: UCANToken = {
      issuer:       opts.issuer  ?? 'did:key:unknown',
      audience:     opts.audience ?? 'did:key:unknown',
      capabilities,
    };

    const confidence = matches.length > 0 ? Math.min(1, matches.length / 5 * 0.8) : 0;
    if (capabilities.length > 0) this.stats.succeeded++; else this.stats.failed++;
    this.stats.totalCapabilities += capabilities.length;

    return { text, ucans: [ucan], capabilities, confidence, warnings, parseMethod: 'pattern' };
  }

  compileBatch(texts: string[]): NLUCANCompilerResult[] { return texts.map(t => this.compile(t)); }
  getStats(): Readonly<NLUCANCompilerStats> { return { ...this.stats }; }
}

export function compileNlToUcanPolicy(text: string): NLUCANCompilerResult {
  return new NLUCANPolicyCompiler().compile(text);
}
