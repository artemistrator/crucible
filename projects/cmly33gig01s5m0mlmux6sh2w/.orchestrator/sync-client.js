#!/usr/bin/env node

const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const readline = require('readline');

// When script lives in .orchestrator/, workspace is the parent (project root)
const SCRIPT_DIR = __dirname;
const WORKSPACE_DIR = path.resolve(SCRIPT_DIR, '..');
const CONFIG_FILE = path.join(SCRIPT_DIR, 'config');
// In docker setup the app listens on 3000 inside container
// and is exposed as http://localhost:3002 on the host.
// By default we point the local sync-client to the host port 3002.
const DEFAULT_API_URL = 'http://localhost:3002/api/sync';
const HEARTBEAT_API_URL = '/heartbeat';
const COMMAND_API_URL = '/command';
const HEARTBEAT_INTERVAL = 5000;
const POLLING_INTERVAL = 3000;
const HEARTBEAT_TIMEOUT = 10000;
const IGNORED_PATTERNS = [
  'node_modules/**',
  '.git/**',
  '.next/**',
  'dist/**',
  'build/**',
  '.env*',
  '*.log',
  '.DS_Store',
  'coverage/**',
  'out/**',
  'storybook-static/**',
  '**/.git/**',
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
];

const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  'out',
  'storybook-static',
  '.env*',
];

const MAX_FILE_SIZE = 1024 * 1024;

const DEBOUNCE_DELAY = 500;
const pendingUpdates = new Map();
let pollingInterval = null;
let heartbeatInterval = null;
let lastHeartbeatTime = null;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getProjectId() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.error(`❌ Error: config not found at ${CONFIG_FILE}`);
    console.error(
      `Create it with either JSON or key=value format, for example:`,
    );
    console.error(
      `JSON: {"projectId": "YOUR_PROJECT_ID"}`,
    );
    console.error(
      `INI : projectId=YOUR_PROJECT_ID`,
    );
    process.exit(1);
  }

  const content = fs.readFileSync(CONFIG_FILE, 'utf-8').trim();

  // First, try JSON format: { "projectId": "..." }
  try {
    const config = JSON.parse(content);
    if (config && typeof config.projectId === 'string' && config.projectId.trim()) {
      return config.projectId.trim();
    }
  } catch (error) {
    // Not JSON – fall back to key=value format
  }

  // Fallback: key=value format (projectId=YOUR_PROJECT_ID)
  const match = content.match(/projectId=([^\s]+)/);

  if (!match) {
    console.error(`❌ Error: projectId not found in ${CONFIG_FILE}`);
    console.error(`Supported formats:`);
    console.error(`- JSON: {"projectId": "YOUR_PROJECT_ID"}`);
    console.error(`- INI : projectId=YOUR_PROJECT_ID`);
    process.exit(1);
  }

  return match[1];
}

function getFileMime(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const mimeTypes = {
    js: 'text/javascript',
    ts: 'text/typescript',
    tsx: 'text/typescript',
    jsx: 'text/javascript',
    json: 'application/json',
    md: 'text/markdown',
    txt: 'text/plain',
    html: 'text/html',
    css: 'text/css',
    scss: 'text/x-scss',
    py: 'text/x-python',
    go: 'text/x-go',
    rs: 'text/x-rust',
  };
  return mimeTypes[ext] || "text/plain";
}

function shouldSyncFile(filePath) {
  const pathParts = filePath.split(path.sep);
  
  for (const dir of EXCLUDED_DIRS) {
    if (pathParts.includes(dir)) {
      return false;
    }
  }
  
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      console.warn(`⚠️ Skipping large file: ${filePath} (${stats.size} bytes)`);
      return false;
    }
    if (!stats.isFile()) {
      return false;
    }
  } catch (error) {
    return false;
  }
  
  return true;
}

async function sendHeartbeat(projectId, apiUrl) {
  try {
    const heartbeatUrl = apiUrl.replace(/\/$/, '') + HEARTBEAT_API_URL;
    console.log(
      `[SyncClient] Sending heartbeat to:`,
      heartbeatUrl,
      `Project ID:`,
      projectId,
    );
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/6dfd3143-9408-4773-bf60-de78980b8261',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        runId:'pre-fix-1',
        hypothesisId:'A',
        location:'public/sync-client.js:sendHeartbeat',
        message:'sync-client heartbeat',
        data:{ projectId, heartbeatUrl },
        timestamp:Date.now()
      })
    }).catch(()=>{});
    // #endregion

    const response = await fetch(heartbeatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId }),
    });

    if (response.ok) {
      lastHeartbeatTime = Date.now();
      const data = await response.json();
      console.log(
        `[SyncClient] Heartbeat sent: ${response.status} ${
          response.statusText || 'OK'
        } (lastSeen: ${new Date(data.lastSeen).toLocaleTimeString()})`,
      );
    } else {
      console.warn(
        `[SyncClient] Heartbeat failed: ${response.status} ${response.statusText}`,
      );
    }
  } catch (error) {
    console.warn(`[SyncClient] Heartbeat error: ${error.message}`);
  }
}

function startHeartbeatLoop(projectId, apiUrl) {
  sendHeartbeat(projectId, apiUrl);
  heartbeatInterval = setInterval(() => sendHeartbeat(projectId, apiUrl), HEARTBEAT_INTERVAL);
}

async function syncFile(projectId, filePath, apiUrl) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        projectId,
        filePath,
        content,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    throw error;
  }
}

function scheduleUpdate(projectId, filePath, apiUrl) {
  if (!shouldSyncFile(filePath)) {
    return;
  }
  
  if (pendingUpdates.has(filePath)) {
    clearTimeout(pendingUpdates.get(filePath));
  }

  const timeout = setTimeout(async () => {
    pendingUpdates.delete(filePath);
    
    try {
      const result = await syncFile(projectId, filePath, apiUrl);
      console.log(`✅ Synced: ${filePath} (${result.isNewFile ? 'new' : 'updated'}, ${result.embeddingsCount} embeddings)`);
    } catch (error) {
      console.error(`❌ Failed to sync ${filePath}:`, error.message);
    }
  }, DEBOUNCE_DELAY);

  pendingUpdates.set(filePath, timeout);
}

async function pollForCommands(projectId, commandApiUrl, autoApprove = false) {
  try {
    const response = await fetch(`${commandApiUrl}?projectId=${projectId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`❌ Failed to poll commands: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();

    if (data.command) {
      await handleCommand(data.command, commandApiUrl, autoApprove);
    }
  } catch (error) {
    console.error(`❌ Error polling commands:`, error.message);
  }
}

function askPermission(command, reason) {
  return new Promise((resolve) => {
    const reasonText = reason ? `\n📝 Reason: ${reason}` : '';
    const question = `\n🤖 AI wants to execute: \`${command}\`${reasonText}\n✅ Allow? (y/n): `;
    
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase().trim() === 'y');
    });
  });
}

async function executeCommand(command, cwd = WORKSPACE_DIR) {
  return new Promise((resolve) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      resolve({
        error,
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: error ? error.code || 1 : 0,
      });
    });
  });
}

async function handleCommand(commandData, commandApiUrl, autoApprove) {
  const { id, command, reason, type, filePath, fileContent } = commandData;
  
  const commandType = type || 'SHELL';
  
  console.log(`\n${'='.repeat(60)}`);
  if (commandType === 'WRITE_FILE') {
    console.log(`📝 File creation request: ${filePath}`);
  } else {
    console.log(`📋 Received command from AI: ${command}`);
  }
  if (reason) {
    console.log(`📝 Reason: ${reason}`);
  }
  console.log(`${'='.repeat(60)}\n`);

  let approved = false;
  
  if (autoApprove) {
    approved = true;
    console.log(`⚡ Auto-approve mode enabled. Executing...\n`);
  } else {
    approved = await askPermission(commandType === 'WRITE_FILE' ? `Create file: ${filePath}` : command, reason);
  }

  if (!approved) {
    console.log(`❌ Command rejected by user\n`);
    
    try {
      await fetch(commandApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commandId: id,
          stdout: '',
          stderr: 'Command rejected by user',
          exitCode: 1,
        }),
      });
    } catch (error) {
      console.error(`❌ Failed to send rejection:`, error.message);
    }
    
    return;
  }

  let result;
  const startTime = Date.now();
  
  if (commandType === 'WRITE_FILE') {
    console.log(`⏳ Creating file: ${filePath}\n`);
    
    try {
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_DIR, filePath);
      const dir = path.dirname(absolutePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(absolutePath, fileContent || '', 'utf-8');
      
      result = {
        error: null,
        stdout: 'File created successfully',
        stderr: '',
        exitCode: 0,
      };
    } catch (error) {
      result = {
        error,
        stdout: '',
        stderr: error.message || 'Failed to create file',
        exitCode: 1,
      };
    }
  } else {
    console.log(`⏳ Executing: ${command}\n`);
    result = await executeCommand(command, WORKSPACE_DIR);
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`⏱️  Execution completed in ${duration}s`);
  console.log(`📤 Exit code: ${result.exitCode}`);
  
  if (result.stdout) {
    console.log(`\n📄 STDOUT:`);
    console.log(result.stdout);
  }
  
  if (result.stderr) {
    console.log(`\n❌ STDERR:`);
    console.log(result.stderr);
  }
  
  console.log(`${'='.repeat(60)}\n`);

  try {
    await fetch(commandApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commandId: id,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }),
    });
    
    console.log(`✅ Result sent to server\n`);
  } catch (error) {
    console.error(`❌ Failed to send result:`, error.message);
  }
}

function startWatcher(projectId, apiUrl, commandApiUrl, autoApprove = false, rootDir = WORKSPACE_DIR) {
  console.log(`🔄 Watching for changes in: ${rootDir}`);
  console.log(`📡 Syncing to: ${apiUrl}`);
  console.log(`🆔 Project ID: ${projectId}`);
  console.log(`⏱️  Command polling interval: ${POLLING_INTERVAL / 1000}s`);
  console.log(`❤️  Heartbeat interval: ${HEARTBEAT_INTERVAL / 1000}s`);
  console.log(`${autoApprove ? '⚡ Auto-approve mode: ENABLED' : '🔒 Auto-approve mode: DISABLED (manual approval required)'}`);
  console.log(`\nWaiting for file changes and AI commands...\n`);

  const watcher = chokidar.watch(rootDir, {
    ignored: IGNORED_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  watcher
    .on('add', (filePath) => {
      scheduleUpdate(projectId, filePath, apiUrl);
    })
    .on('change', (filePath) => {
      scheduleUpdate(projectId, filePath, apiUrl);
    })
    .on('error', (error) => {
      console.error(`Watcher error: ${error}`);
    });

  pollingInterval = setInterval(() => {
    pollForCommands(projectId, commandApiUrl, autoApprove);
  }, POLLING_INTERVAL);

  return watcher;
}

function main() {
  const args = process.argv.slice(2);
  let apiUrl = DEFAULT_API_URL;
  let autoApprove = false;
  let projectIdOverride = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      apiUrl = args[i + 1];
      i++;
    } else if (args[i] === '--auto-approve') {
      autoApprove = true;
    } else if ((args[i] === '--project-id' || args[i] === '--projectId') && args[i + 1]) {
      projectIdOverride = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      const hasPackageJson = fs.existsSync(path.join(WORKSPACE_DIR, 'package.json'));
      console.log(`
Usage: node sync-client.js [options]
${hasPackageJson ? 'Or use npm script: npm run sync:watch' : ''}

Options:
  --url <url>        Custom API URL (default: ${DEFAULT_API_URL})
  --auto-approve     Automatically approve all commands (default: false)
  --project-id <id>  Override projectId from .orchestrator
  --help, -h         Show this help

Features:
  - File watching with chokidar
  - Heartbeat sent every ${HEARTBEAT_INTERVAL/1000}s to ${HEARTBEAT_API_URL}
  - Command polling every ${POLLING_INTERVAL/1000}s
  - Auto-approve mode for hands-free execution

Requirements:
  - Create .orchestrator file: ${hasPackageJson ? 'npm run sync:init' : 'node sync-init.js'}
  - Install dependencies: ${hasPackageJson ? 'npm run sync:install' : 'npm install chokidar'}

Examples:
  node sync-client.js
${hasPackageJson ? 'npm run sync:watch' : ''}
  node sync-client.js --url https://my-api.com/api/sync
${hasPackageJson ? 'npm run sync:watch:auto' : 'node sync-client.js --auto-approve'}
`);
      process.exit(0);
    }
  }

  try {
    require.resolve('chokidar');
  } catch (e) {
    console.error('❌ Error: chokidar not installed');
    if (fs.existsSync('package.json')) {
      console.error('Run: npm run sync:install');
    } else {
      console.error('Run: npm install chokidar');
    }
    process.exit(1);
  }

  const projectId = projectIdOverride || getProjectId();
  const commandApiUrl = apiUrl.replace(/\/$/, '') + COMMAND_API_URL;
  startHeartbeatLoop(projectId, apiUrl);
  const watcher = startWatcher(projectId, apiUrl, commandApiUrl, autoApprove, WORKSPACE_DIR);

  process.on('SIGINT', () => {
    console.log('\n\n👋 Shutting down gracefully...');

    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    watcher.close();
    rl.close();
    process.exit(0);
  });
}

main();
