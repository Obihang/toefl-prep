import fs from 'fs';
import path from 'path';

function loadAppletFirebaseConfig(): { apiKey?: string; projectId?: string } {
  try {
    const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    }
  } catch {
    // Ignore missing or unreadable local config file
  }
  return {};
}

const localCfg = loadAppletFirebaseConfig();

export const firebasePublicConfig = {
  apiKey: process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY || localCfg.apiKey || '',
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || localCfg.projectId || '',
};

