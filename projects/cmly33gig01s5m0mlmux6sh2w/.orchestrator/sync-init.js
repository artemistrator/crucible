#!/usr/bin/env node

/**
 * Initialize orchestrator sync client
 * Creates .orchestrator file with project ID
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// When run as node .orchestrator/sync-init.js, config goes inside .orchestrator/
const CONFIG_FILE = path.join(__dirname, 'config');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🔧 Orchestrator Sync Setup\n');

rl.question('Enter your Project ID: ', (projectId) => {
  if (!projectId || projectId.trim().length === 0) {
    console.error('❌ Error: Project ID is required');
    rl.close();
    process.exit(1);
  }

  const content = `projectId=${projectId.trim()}\n`;

  if (fs.existsSync(CONFIG_FILE)) {
    console.warn(`⚠️  Warning: config already exists at ${CONFIG_FILE}`);
    rl.question('Overwrite? (y/N): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        writeConfig(content);
      } else {
        console.log('Setup cancelled');
        rl.close();
      }
    });
  } else {
    writeConfig(content);
  }

  function writeConfig(content) {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, content);
    console.log(`✅ Created ${CONFIG_FILE}`);
    console.log('\nNext steps:');
    const workspaceDir = path.resolve(__dirname, '..');
    const hasPackageJson = fs.existsSync(path.join(workspaceDir, 'package.json'));
    if (hasPackageJson) {
      console.log('1. npm run sync:install');
      console.log('2. npm run sync:watch (or from project root: node .orchestrator/sync-client.js)');
    } else {
      console.log('1. npm install chokidar (e.g. in .orchestrator/)');
      console.log('2. From project root: node .orchestrator/sync-client.js');
      console.log('   Or: cd .orchestrator && node sync-client.js --auto-approve');
    }
    rl.close();
  }
});
