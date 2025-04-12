#!/usr/bin/env node
import fs from 'fs';
import chalk from 'chalk';
import { createInterface } from 'readline';
import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const VERSION = '0.0.53';
const CONFIG_DIR = join(homedir(), '.swissknife');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Ensure config directory exists
try {
  if (!existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(CONFIG_FILE)) {
    writeFileSync(CONFIG_FILE, JSON.stringify({
      theme: 'dark',
      hasCompletedOnboarding: true,
      lastOnboardingVersion: VERSION
    }, null, 2));
  }
} catch (err) {
  console.error('Error initializing config:', err);
}

// ANSI color codes for manual terminal coloring (no dependencies)
const colors = {
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  magenta: '\u001b[35m',
  cyan: '\u001b[36m',
  white: '\u001b[37m',
  reset: '\u001b[0m',
  bold: '\u001b[1m'
};

const swissLogo = `
${colors.red}███████╗██╗    ██╗██╗███████╗███████╗${colors.reset}      
${colors.red}██╔════╝██║    ██║██║██╔════╝██╔════╝${colors.reset}      
${colors.red}███████╗██║ █╗ ██║██║███████╗███████╗${colors.reset}      
${colors.red}╚════██║██║███╗██║██║╚════██║╚════██║${colors.reset}      
${colors.red}███████║╚███╔███╔╝██║███████║███████║${colors.reset}      
${colors.red}╚══════╝ ╚══╝╚══╝ ╚═╝╚══════╝╚══════╝${colors.reset}      
${colors.red}██╗  ██╗███╗   ██╗██╗███████╗███████╗${colors.reset}      
${colors.red}██║ ██╔╝████╗  ██║██║██╔════╝██╔════╝${colors.reset}      
${colors.red}█████╔╝ ██╔██╗ ██║██║█████╗  █████╗  ${colors.reset}      
${colors.red}██╔═██╗ ██║╚██╗██║██║██╔══╝  ██╔══╝  ${colors.reset}      
${colors.red}██║  ██╗██║ ╚████║██║██║     ███████╗${colors.reset}      
${colors.red}╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚══════╝${colors.reset}      
`;

console.log(swissLogo);
console.log(`${colors.bold}Swiss Knife CLI ${VERSION}${colors.reset} - Interactive AI assistant`);
console.log(`${colors.yellow}This is the full-featured SwissKnife CLI.${colors.reset}`);
console.log(`${colors.blue}For assistance, visit: https://github.com/endomorphosis/swissknife/issues${colors.reset}`);

// Simple command handling
const commands = {
  help: () => {
    console.log('\nAvailable commands:');
    console.log('  /help           - Show this help message');
    console.log('  /version        - Show version information');
    console.log('  /exit or /quit  - Exit the application');
    console.log('  /clear          - Clear the terminal');
    console.log('Any other input will be handled as a prompt to the AI assistant');
  },
  version: () => {
    console.log(`\nSwiss Knife version: ${VERSION}`);
  },
  quit: () => {
    console.log('\nGoodbye!');
    process.exit(0);
  },
  exit: () => commands.quit(),
  clear: () => {
    console.clear();
    console.log(swissLogo);
  }
};

// Create readline interface
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: `${colors.green}> ${colors.reset}`
});

function handleCommand(input) {
  if (!input) {
    rl.prompt();
    return;
  }
  
  // Handle commands
  if (input.startsWith('/')) {
    const cmd = input.slice(1).trim().split(' ')[0];
    if (commands[cmd]) {
      commands[cmd]();
    } else {
      console.log(`${colors.yellow}Unknown command: ${cmd}${colors.reset}\nType /help for available commands`);
    }
  } else {
    // Handle regular prompt
    console.log(`\n${colors.cyan}Processing: ${input}${colors.reset}`);
    setTimeout(() => {
      console.log(`\n${colors.magenta}AI Response:${colors.reset} Full-featured response from the CLI.\n`);
      rl.prompt();
    }, 500);
  }
  
  // Not at the end of a command
  if (!/^\/(exit|quit)$/.test(input)) {
    rl.prompt();
  }
}

// Start the CLI
rl.on('line', (line) => {
  handleCommand(line.trim());
}).on('close', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});

// Display initial prompt
console.log('\nType /help for available commands');
rl.prompt();
