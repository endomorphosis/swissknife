/**
 * Safe color formatting utilities for SwissKnife CLI
 * 
 * This utility provides safe wrappers around terminal color libraries to prevent
 * bundling issues that can cause errors like 'v$.default.color.ansi is not a function'.
 * 
 * When color libraries are bundled, their internal API structure can be changed,
 * leading to runtime errors. This utility handles those issues by:
 * 1. Safely importing chalk
 * 2. Providing fallbacks when chalk is unavailable 
 * 3. Using simple wrapper functions that avoid referencing internal chalk structures
 */

import { supportsColor } from 'supports-color';

// Use try/catch to handle cases where chalk is unavailable or improperly bundled
let chalk: any;
let hasChalk = false;

try {
  // Dynamic import to be friendly to bundlers
  chalk = require('chalk');
  hasChalk = true;
} catch (error) {
  console.warn('Chalk not available, using fallback colors');
  hasChalk = false;
}

// Detect if colors are supported in the current terminal
const colorsSupported = supportsColor !== false && 
                         process.env.NO_COLOR === undefined &&
                         process.env.FORCE_COLOR !== '0';

/**
 * Safe color utility that provides color functions with fallbacks
 */
export const safeColors = {
  // Basic colors
  red: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.red(text);
    } catch (e) {
      return text;
    }
  },
  
  green: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.green(text);
    } catch (e) {
      return text;
    }
  },
  
  blue: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.blue(text);
    } catch (e) {
      return text;
    }
  },
  
  yellow: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.yellow(text);
    } catch (e) {
      return text;
    }
  },
  
  cyan: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.cyan(text);
    } catch (e) {
      return text;
    }
  },
  
  magenta: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.magenta(text);
    } catch (e) {
      return text;
    }
  },
  
  white: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.white(text);
    } catch (e) {
      return text;
    }
  },
  
  gray: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.gray(text);
    } catch (e) {
      return text;
    }
  },
  
  black: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.black(text);
    } catch (e) {
      return text;
    }
  },
  
  // Style modifiers
  bold: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.bold(text);
    } catch (e) {
      return text;
    }
  },
  
  dim: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.dim(text);
    } catch (e) {
      return text;
    }
  },
  
  italic: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.italic(text);
    } catch (e) {
      return text;
    }
  },
  
  underline: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.underline(text);
    } catch (e) {
      return text;
    }
  },
  
  // Compound styles (convenience methods)
  error: (text: string): string => {
    if (!colorsSupported || !hasChalk) return `ERROR: ${text}`;
    try {
      return chalk.red.bold(`ERROR: ${text}`);
    } catch (e) {
      return `ERROR: ${text}`;
    }
  },
  
  success: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.green.bold(text);
    } catch (e) {
      return text;
    }
  },
  
  warning: (text: string): string => {
    if (!colorsSupported || !hasChalk) return `WARNING: ${text}`;
    try {
      return chalk.yellow.bold(`WARNING: ${text}`);
    } catch (e) {
      return `WARNING: ${text}`;
    }
  },
  
  info: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.blue.bold(text);
    } catch (e) {
      return text;
    }
  },
  
  // Special styling for specific CLI elements
  heading: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.cyan.bold(text);
    } catch (e) {
      return text;
    }
  },
  
  subheading: (text: string): string => {
    if (!colorsSupported || !hasChalk) return text;
    try {
      return chalk.cyan(text);
    } catch (e) {
      return text;
    }
  },
  
  code: (text: string): string => {
    if (!colorsSupported || !hasChalk) return `\`${text}\``;
    try {
      return chalk.gray(`\`${text}\``);
    } catch (e) {
      return `\`${text}\``;
    }
  },
};

/**
 * Apply multiple styles to text (optional, only if bundler supports this)
 */
export function applyStyles(text: string, ...styles: Array<(text: string) => string>): string {
  return styles.reduce((result, style) => style(result), text);
}

/**
 * Check if colors are supported in the current terminal
 */
export function isColorSupported(): boolean {
  return colorsSupported && hasChalk;
}

/**
 * Force enable or disable colors
 */
export function setColorEnabled(enabled: boolean): void {
  if (hasChalk && chalk.level !== undefined) {
    chalk.level = enabled ? 1 : 0;
  }
}

export default safeColors;
