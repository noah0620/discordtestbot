import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// PowerShellをどのフォルダーから起動しても、BOT本体直下の .env を必ず読む。
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
dotenv.config({ path: envPath });

const rawOwnerIds = process.env.BOT_OWNER_IDS || '';

export const config = {
  token: process.env.DISCORD_TOKEN?.trim(),
  clientId: process.env.DISCORD_CLIENT_ID?.trim(),
  ownerIds: rawOwnerIds.split(',').map(v => v.trim()).filter(v => /^\d{15,22}$/.test(v)),
  dataDir: process.env.DATA_DIR?.trim()
    ? path.resolve(projectRoot, process.env.DATA_DIR.trim())
    : path.join(projectRoot, 'data'),
  earthquakePollSeconds: Math.max(5, Number(process.env.EARTHQUAKE_POLL_SECONDS || 5)),
  envPath
};

export function assertConfig() {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('DISCORD_CLIENT_ID');
  if (missing.length) throw new Error(`.env に設定が必要です: ${missing.join(', ')}\n読込先: ${envPath}`);
  if (!config.ownerIds.length) {
    console.warn(`⚠️ BOT_OWNER_IDS が未設定または不正です。読込先: ${envPath}`);
  }
}

export function isBotOwner(userId) {
  return typeof userId === 'string' && config.ownerIds.includes(userId);
}

export function isBotOwnerUser(user) {
  return Boolean(user?.id && isBotOwner(user.id));
}
