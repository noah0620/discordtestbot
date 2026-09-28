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

const body = commandData.map(c=>c.toJSON());
const localNames = body.map(c=>c.name);
console.log(`📦 登録対象コマンド数: ${body.length}`);
console.log(`📅 /era 登録対象: ${localNames.includes('era') ? '✅ YES' : '❌ NO'}`);

if (!localNames.includes('era')) {
  throw new Error('/era がローカルのコマンド定義にありません。登録を中止しました。');
}

const registered = await rest.put(
  Routes.applicationCommands(actualApplicationId),
  { body }
);

console.log(`✅ Global commands registered to ${actualApplicationId}: ${registered.length}`);

// Discord API側へ本当に登録された内容を再取得して検証する。
const remote = await rest.get(Routes.applicationCommands(actualApplicationId));
const remoteNames = remote.map(c=>c.name);
const era = remote.find(c=>c.name==='era');
console.log(`🔎 Discord側 /era: ${era ? '✅ 登録済み' : '❌ 見つかりません'}`);
if (era) {
  const subNames = (era.options || []).filter(o=>o.type===1).map(o=>o.name);
  console.log(`   /era サブコマンド: ${subNames.length ? subNames.join(', ') : 'なし'}`);
  if (!subNames.includes('search')) {
    throw new Error('Discord側の /era に search サブコマンドがありません。');
  }
}
if (!era) {
  throw new Error('Discord APIへの登録後確認で /era が見つかりませんでした。');
}
console.log('ℹ️ Discordアプリ側で古い候補が残る場合はDiscordを再起動してから /era を入力してください。');
