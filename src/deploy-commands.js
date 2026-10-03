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

// Discord API側へ本当に登録された内容を再取得して、ローカル定義と完全照合する。
const remote = await rest.get(Routes.applicationCommands(actualApplicationId));
const remoteByName = new Map(remote.map(c=>[c.name,c]));
const missing = body.filter(c=>!remoteByName.has(c.name)).map(c=>c.name);
if(missing.length) throw new Error(`Discord側に未登録のコマンドがあります: ${missing.join(', ')}`);

function optionTree(options=[]){
  return options
    .filter(o=>o.type===1 || o.type===2)
    .map(o=>({name:o.name,type:o.type,children:optionTree(o.options||[])}));
}
function flatTree(prefix, options=[]){
  const out=[];
  for(const o of options){
    if(o.type!==1 && o.type!==2) continue;
    const key=prefix ? `${prefix} ${o.name}` : o.name;
    out.push(key);
    out.push(...flatTree(key,o.options||[]));
  }
  return out;
}

for(const local of body){
  const r=remoteByName.get(local.name);
  const want=flatTree(`/${local.name}`,local.options||[]);
  const got=new Set(flatTree(`/${r.name}`,r.options||[]));
  const miss=want.filter(x=>!got.has(x));
  if(miss.length) throw new Error(`/${local.name} のサブコマンド登録不一致: ${miss.join(', ')}`);
}

const imageCmd=remoteByName.get('image');
if(!imageCmd) throw new Error('Discord側に /image がありません。');
const imageSubs=(imageCmd.options||[]).filter(o=>o.type===1).map(o=>o.name);
const requiredImage=['bg-remove','pdf','compress','video-compress','enhance','rotate-left','rotate-right','flip-horizontal','flip-vertical'];
const missingImage=requiredImage.filter(x=>!imageSubs.includes(x));
console.log(`🖼️ Discord側 /image: ${imageSubs.join(', ')}`);
if(missingImage.length) throw new Error(`/image の登録不足: ${missingImage.join(', ')}`);

const gameCmd=remoteByName.get('game');
if(!gameCmd) throw new Error('Discord側に /game がありません。');
const gameSubs=(gameCmd.options||[]).filter(o=>o.type===1).map(o=>o.name);
const requiredGames=['tictactoe','gomoku','rps','othello','chess','shogi'];
const missingGames=requiredGames.filter(x=>!gameSubs.includes(x));
console.log(`🎮 Discord側 /game: ${gameSubs.join(', ')}`);
if(missingGames.length) throw new Error(`/game の登録不足: ${missingGames.join(', ')}`);

const musicCmd=remoteByName.get('music');
if(!musicCmd) throw new Error('Discord側に /music がありません。');
const musicSubs=(musicCmd.options||[]).filter(o=>o.type===1).map(o=>o.name);
console.log(`🎵 Discord側 /music: ${musicSubs.join(', ')}`);
if(!musicSubs.includes('play')) throw new Error('/music play がDiscord側に登録されていません。');

console.log(`🔎 Discord側コマンド総数: ${remote.length} / ローカル: ${body.length}`);
console.log('✅ 全トップレベルコマンドとサブコマンドのDiscord登録を確認しました。');
console.log('ℹ️ Discordクライアントに古い候補が残る場合は、Discordを完全終了→再起動してください。');
