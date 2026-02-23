import fs from 'fs';
import path from 'path';

const QA_LOG_DIR = path.join(process.cwd(), 'logs', 'qa');

export function logQA(taskId: string, step: string, message: string, data?: any) {
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_QA_LOGS) {
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  const qaLogFile = path.join(QA_LOG_DIR, `qa-${today}.log`);

  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}][QA][${taskId}][${step}] ${message}`;
  
  if (data) {
    logEntry += `\n${JSON.stringify(data, null, 2)}`;
  }
  
  console.log(logEntry);
  
  try {
    if (!fs.existsSync(QA_LOG_DIR)) {
      fs.mkdirSync(QA_LOG_DIR, { recursive: true });
    }
    fs.appendFileSync(qaLogFile, logEntry + '\n');
  } catch (error) {
    console.error('[QA Logger] Failed to write log:', error);
  }
}

export function getQALogsForTask(taskId: string): string[] {
  try {
    const today = new Date().toISOString().split('T')[0];
    const qaLogFile = path.join(QA_LOG_DIR, `qa-${today}.log`);
    
    if (!fs.existsSync(qaLogFile)) {
      return [];
    }

    const content = fs.readFileSync(qaLogFile, 'utf-8');
    return content.split('\n')
      .filter(line => line.includes(taskId))
      .filter(line => line.trim().length > 0);
  } catch (error) {
    console.error('[QA Logger] Failed to read logs:', error);
    return [];
  }
}

export function getRecentQALogs(limit = 100): string[] {
  try {
    const today = new Date().toISOString().split('T')[0];
    const qaLogFile = path.join(QA_LOG_DIR, `qa-${today}.log`);
    
    if (!fs.existsSync(qaLogFile)) {
      return [];
    }

    const content = fs.readFileSync(qaLogFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    return lines.slice(-limit);
  } catch (error) {
    console.error('[QA Logger] Failed to read logs:', error);
    return [];
  }
}
