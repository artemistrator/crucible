#!/usr/bin/env node

/**
 * Initialize orchestrator sync client
 * Creates .orchestrator file with project ID
 */

const fs = require('fs');
const readline = require('readline');

const CONFIG_FILE = '.orchestrator';

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
    console.warn(`⚠️  Warning: ${CONFIG_FILE} already exists`);
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
    fs.writeFileSync(CONFIG_FILE, content);
    console.log(`✅ Created ${CONFIG_FILE}`);
    console.log('\nNext steps:');
    if (fs.existsSync('package.json')) {
      console.log('1. npm run sync:install');
      console.log('2. npm run sync:watch');
      console.log('   Or for auto-approve mode: npm run sync:watch:auto');
    } else {
      console.log('1. npm install chokidar');
      console.log('2. node sync-client.js');
      console.log('   Or for auto-approve mode: node sync-client.js --auto-approve');
    }
    rl.close();
  }
});
