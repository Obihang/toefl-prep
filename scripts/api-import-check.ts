import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, '../api');

async function checkApiImports() {
  const files = fs.readdirSync(apiDir).filter(f => f.endsWith('.ts'));
  console.log(`Checking imports for ${files.length} files in /api...`);

  for (const file of files) {
    const filePath = path.join(apiDir, file);
    const fileUrl = new URL(`file://${filePath}`).href;
    try {
      console.log(`Importing ${file}...`);
      await import(fileUrl);
      console.log(`PASS: ${file}`);
    } catch (err: any) {
      console.error(`FAIL: Failed to import ${file}:`, err);
      process.exit(1);
    }
  }

  console.log('All /api files imported successfully without ERR_MODULE_NOT_FOUND!');
}

checkApiImports().catch((err) => {
  console.error('API import check failed:', err);
  process.exit(1);
});
