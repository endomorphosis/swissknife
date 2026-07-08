/**
 * fol-constructor-io-mixin.ts
 *
 * IO, serialisation, and session-helper methods for InteractiveFOLConstructor.
 * TypeScript port of:
 *   ipfs_datasets_py/logic/integration/interactive/_fol_constructor_io.py
 *
 * Provides:
 *   ExportFormat           — json | fol | prolog | tptp
 *   SessionExportData      — serialised session snapshot
 *   FOLConstructorIOMixin  — exportSession/importSession/toFormula (multi-format)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'json' | 'fol' | 'prolog' | 'tptp';

export interface ExportedStatement {
  raw: string;
  formula: string;
  operator: string;
  confidence: number;
  warnings: string[];
}

export interface SessionExportData {
  sessionMetadata: {
    sessionId: string;
    domain: string;
    exportedAt: string;
    totalStatements: number;
    format: ExportFormat;
  };
  statements: ExportedStatement[];
  composite?: string;
  consistencyScore?: number;
}

// ---------------------------------------------------------------------------
// Format converters
// ---------------------------------------------------------------------------

function formulaToProlog(formula: string): string {
  return formula
    .replace(/O\(([^)]+)\)/g, 'obligatory($1)')
    .replace(/P\(([^)]+)\)/g, 'permitted($1)')
    .replace(/F\(([^)]+)\)/g, 'forbidden($1)')
    .replace(/∧/g, ',')
    .replace(/∨/g, ';')
    .replace(/¬/g, '\\+')
    .replace(/→/g, ':-')
    + '.';
}

function formulaToTPTP(formula: string): string {
  const f = formula
    .replace(/O\(([^)]+)\)/g, 'obligatory($1)')
    .replace(/P\(([^)]+)\)/g, 'permitted($1)')
    .replace(/F\(([^)]+)\)/g, 'forbidden($1)')
    .replace(/∧/g, '&')
    .replace(/∨/g, '|')
    .replace(/¬/g, '~')
    .replace(/→/g, '=>');
  return `fof(formula, conjecture, ${f}).`;
}

// ---------------------------------------------------------------------------
// FOLConstructorIOMixin
// ---------------------------------------------------------------------------

export interface IFOLSession {
  sessionId: string;
  domain: string;
  statements: ExportedStatement[];
  formulas: string[];
  consistencyScore: number;
}

export class FOLConstructorIOMixin {
  /**
   * Export a session to the given format.
   */
  exportSession(session: IFOLSession, format: ExportFormat = 'json'): SessionExportData | string {
    const data: SessionExportData = {
      sessionMetadata: {
        sessionId: session.sessionId,
        domain: session.domain,
        exportedAt: new Date().toISOString(),
        totalStatements: session.statements.length,
        format,
      },
      statements: session.statements,
      composite: session.formulas.join(' ∧ '),
      consistencyScore: session.consistencyScore,
    };

    switch (format) {
      case 'json':
        return data;
      case 'fol':
        return [
          `% FOL Session Export — ${session.domain}`,
          `% Session: ${session.sessionId}`,
          ...session.formulas.map(f => `formula: ${f}`),
          `composite: ${data.composite}`,
        ].join('\n');
      case 'prolog':
        return [
          `% Prolog export — session ${session.sessionId}`,
          ...session.formulas.map(f => formulaToProlog(f)),
        ].join('\n');
      case 'tptp':
        return [
          `% TPTP export — session ${session.sessionId}`,
          ...session.formulas.map((f, i) => `fof(s${i}, axiom, ${f.replace(/∧/g, '&').replace(/∨/g, '|')}).`),
        ].join('\n');
    }
  }

  /**
   * Import session data from a JSON object.
   */
  importSession(data: SessionExportData): IFOLSession {
    const formulas = data.statements.map(s => s.formula).filter(Boolean);
    return {
      sessionId: data.sessionMetadata.sessionId,
      domain: data.sessionMetadata.domain,
      statements: data.statements,
      formulas,
      consistencyScore: data.consistencyScore ?? 1.0,
    };
  }

  /**
   * Convert a formula to a target format string.
   */
  convertFormula(formula: string, format: ExportFormat): string {
    switch (format) {
      case 'fol':     return formula;
      case 'prolog':  return formulaToProlog(formula);
      case 'tptp':    return formulaToTPTP(formula);
      case 'json':    return JSON.stringify({ formula });
    }
  }

  /**
   * Serialize session to JSON string (for saveToFile simulation).
   */
  serializeSession(session: IFOLSession): string {
    return JSON.stringify(this.exportSession(session, 'json'), null, 2);
  }

  /**
   * Deserialize session from JSON string (for loadFromFile simulation).
   */
  deserializeSession(json: string): IFOLSession {
    const data = JSON.parse(json) as SessionExportData;
    return this.importSession(data);
  }
}
