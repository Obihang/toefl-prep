import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.resolve(rootDir, 'src/server');
const apiDir = path.resolve(rootDir, 'api');

function scanForFirebaseAdmin(dir: string) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanForFirebaseAdmin(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('firebase-admin')) {
        console.error(`ERROR: Found reference to "firebase-admin" in ${fullPath}`);
        process.exit(1);
      }
    }
  }
}

console.log('Scanning src/server and api for firebase-admin...');
scanForFirebaseAdmin(serverDir);
scanForFirebaseAdmin(apiDir);
console.log('PASS: No firebase-admin found in src/server or api.');

const apiFiles = fs.readdirSync(apiDir).filter(f => f.endsWith('.ts'));
console.log(`Checking ${apiFiles.length} API files under --no-experimental-require-module...`);

for (const file of apiFiles) {
  const filePath = path.join(apiDir, file);
  try {
    execSync(`npx tsx --no-experimental-require-module -e "import('${filePath.replace(/\\/g, '/')}')"`, {
      stdio: 'inherit',
      env: process.env,
    });
    console.log(`PASS: ${file} imported successfully under --no-experimental-require-module`);
  } catch (err: any) {
    console.error(`FAIL: API file ${file} triggered ERR_REQUIRE_ESM or import error:`, err?.message || err);
    process.exit(1);
  }
}

console.log('All API import checks and firebase-admin ban checks passed successfully! 🎉');
