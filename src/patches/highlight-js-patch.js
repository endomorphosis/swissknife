/**
 * This patch file helps address the highlight.js sideEffects warning in Bun
 * 
 * The issue is that highlight.js uses wildcard sideEffects in its package.json
 * which Bun currently doesn't support properly. This helper loads specific styles
 * explicitly rather than relying on the wildcard import behavior.
 */

// Import only the highlight.js styles that are actually used
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';

// Register the languages we actually use
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);

export default hljs;
