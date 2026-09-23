import { REST, Routes } from 'discord.js';
import { config, assertConfig } from './config.js';
import { commandData } from './commands/definitions.js';

assertConfig();

const rest = new REST({ version:'10' }).setToken(config.token);

// BOTトークン自身のユーザーIDを取得。
// Discord BOTでは、このIDがApplication IDと一致するため、
// .envのCLIENT_IDが間違っていても別BOTへコマンドを登録しない。
const me = await rest.get(Routes.user('@me'));
const actualApplicationId = String(me.id);

console.log(`🤖 Token BOT: ${me.username}#${me.discriminator ?? '0'} / ID ${actualApplicationId}`);

if (config.clientId && config.clientId !== actualApplicationId) {
  console.warn('⚠️ DISCORD_CLIENT_ID が現在のBOTトークンと一致していません。');
  console.warn(`   .env CLIENT_ID: ${config.clientId}`);
  console.warn(`   Token BOT ID : ${actualApplicationId}`);
  console.warn('   今回は安全のため Token BOT ID 側へコマンドを登録します。');
}

await rest.put(
  Routes.applicationCommands(actualApplicationId),
  { body: commandData.map(c=>c.toJSON()) }
);

console.log(`✅ Global commands registered to ${actualApplicationId}: ${commandData.length}`);
console.log('ℹ️ Discord側への反映には少し時間がかかる場合があります。');
