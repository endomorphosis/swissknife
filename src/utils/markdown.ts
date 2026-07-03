import { marked, Token } from 'marked'
import { stripSystemMessages } from './messages.js'
import chalk from 'chalk'
import { EOL } from 'os'
import { highlight, supportsLanguage } from 'cli-highlight'
import { logError } from './log.js'

export function applyMarkdown(content: string): string {
  return marked
    .lexer(stripSystemMessages(content))
    .map(_ => format(_))
    .join('')
    .trim()
}

function format(
  token: Token,
  listDepth = 0,
  orderedListNumber: number | null = null,
  parent: Token | null = null,
): string {
  switch (token.type) {
    case 'blockquote':
      return chalk.dim.italic((token.tokens ?? []).map(_ => format(_)).join(''))
    case 'code':
      if (token.lang && supportsLanguage(token.lang)) {
        return highlight(token.text, { language: token.lang }) + EOL
      } else {
        logError(
          `Language not supported while highlighting code, falling back to markdown: ${token.lang}`,
        )
        return highlight(token.text, { language: 'markdown' }) + EOL
      }
    case 'codespan':
      // inline code
      return chalk.blue(token.text)
    case 'em':
      return chalk.italic((token.tokens ?? []).map(_ => format(_)).join(''))
    case 'strong':
      return chalk.bold((token.tokens ?? []).map(_ => format(_)).join(''))
    case 'heading':
      switch (token.depth) {
        case 1: // h1
          return (
            chalk.bold.italic.underline(
              (token.tokens ?? []).map(_ => format(_)).join(''),
            ) +
            EOL +
            EOL
          )
        case 2: // h2
          return (
            chalk.bold((token.tokens ?? []).map(_ => format(_)).join('')) +
            EOL +
            EOL
          )
        default: // h3+
          return (
            chalk.bold.dim((token.tokens ?? []).map(_ => format(_)).join('')) +
            EOL +
            EOL
          )
      }
    case 'hr':
      return '---'
    case 'image':
      return `[Image: ${token.title}: ${token.href}]`
    case 'link':
      return chalk.blue(token.href)
    case 'list': {
      return token.items
        .map((_: Token, index: number) =>
          format(
            _,
            listDepth,
            token.ordered ? token.start + index : null,
            token,
          ),
        )
        .join('')
    }
    case 'list_item':
      return (token.tokens ?? [])
        .map(
          _ =>
            `${'  '.repeat(listDepth)}${format(_, listDepth + 1, orderedListNumber, token)}`,
        )
        .join('')
    case 'paragraph':
      return (token.tokens ?? []).map(_ => format(_)).join('') + EOL
    case 'space':
      return EOL
    case 'text':
      if (parent?.type === 'list_item') {
        return `${orderedListNumber === null ? '-' : getListNumber(listDepth, orderedListNumber) + '.'} ${token.tokens ? token.tokens.map(_ => format(_, listDepth, orderedListNumber, token)).join('') : token.text}${EOL}`
      } else {
        return token.text
      }
  }
  // Tables: render header | separator | rows as aligned text
  if (token.type === 'table') {
    const header = (token as Record<string, unknown[]>)['header'] as Array<{ text: string }> | undefined;
    const rows   = (token as Record<string, unknown[][]>)['rows']    as Array<Array<{ text: string }>> | undefined;
    if (!header) return '';
    const cols = header.map(h => h.text ?? String(h));
    const sep  = cols.map(() => '---');
    const body = (rows ?? []).map(row => row.map(c => c.text ?? String(c)).join(' | '));
    return [cols.join(' | '), sep.join(' | '), ...body].map(l => l + EOL).join('');
  }
  return ''
}

const DEPTH_1_LIST_NUMBERS = [
  'a',
  'b',
  'c',
  'd',
  'e',
  'f',
  'g',
  'h',
  'i',
  'j',
  'k',
  'l',
  'm',
  'n',
  'o',
  'p',
  'q',
  'r',
  's',
  't',
  'u',
  'v',
  'w',
  'x',
  'y',
  'z',
  'aa',
  'ab',
  'ac',
  'ad',
  'ae',
  'af',
  'ag',
  'ah',
  'ai',
  'aj',
  'ak',
  'al',
  'am',
  'an',
  'ao',
  'ap',
  'aq',
  'ar',
  'as',
  'at',
  'au',
  'av',
  'aw',
  'ax',
  'ay',
  'az',
]
const DEPTH_2_LIST_NUMBERS = [
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
  'xi',
  'xii',
  'xiii',
  'xiv',
  'xv',
  'xvi',
  'xvii',
  'xviii',
  'xix',
  'xx',
  'xxi',
  'xxii',
  'xxiii',
  'xxiv',
  'xxv',
  'xxvi',
  'xxvii',
  'xxviii',
  'xxix',
  'xxx',
  'xxxi',
  'xxxii',
  'xxxiii',
  'xxxiv',
  'xxxv',
  'xxxvi',
  'xxxvii',
  'xxxviii',
  'xxxix',
  'xl',
]

function getListNumber(listDepth: number, orderedListNumber: number): string {
  switch (listDepth) {
    case 0:
    case 1:
      return orderedListNumber.toString();
    case 2: {
      // Generate lowercase letters dynamically: 1→a, 2→b, ..., 26→z, 27→aa, ...
      let n = orderedListNumber;
      let result = '';
      while (n > 0) {
        n -= 1;
        result = String.fromCharCode(97 + (n % 26)) + result;
        n = Math.floor(n / 26);
      }
      return result;
    }
    case 3: {
      // Generate lowercase Roman numerals dynamically
      const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
      const syms = ['m','cm','d','cd','c','xc','l','xl','x','ix','v','iv','i'];
      let n = orderedListNumber;
      let roman = '';
      for (let i = 0; i < vals.length; i++) {
        while (n >= vals[i]!) { roman += syms[i]; n -= vals[i]!; }
      }
      return roman;
    }
    default:
      return orderedListNumber.toString();
  }
}
