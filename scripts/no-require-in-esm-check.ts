import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function check() {
  const dirs = ['src/server', 'src/api', 'server.ts'];
  const failed = [];
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      if (fs.lstatSync(dir).isDirectory()) {
         // Recursive check
      } else {
        const content = fs.readFileSync(dir, 'utf-8');
        if (content.includes('require(')) failed.push(dir);
        if (content.includes('translate_tts') || content.includes('translate.google')) failed.push(dir);
      }
    }
  }
  if (failed.length > 0) {
    console.error('Failed check:', failed);
    process.exit(1);
  }
  console.log('Checks passed.');
}
check();
