import {
  Client, GatewayIntentBits, Partials, Events, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder,
  TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, ChannelSelectMenuBuilder
} from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType, VoiceConnectionStatus, entersState } from '@discordjs/voice';
import { config, assertConfig, isBotOwner, isBotOwnerUser } from './config.js';
import { loadStore, saveStore, guildData } from './db/store.js';
import { searchRegionChoices, searchPrefectureChoices, PREFECTURES, WEATHER_AREAS, expandWeatherRegion } from './regions.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import ffmpegStaticPath from 'ffmpeg-static';
import Parser from 'rss-parser';
import youtubedlPackage from 'youtube-dl-exec';

const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const bundledYtDlp=path.resolve(__dirname,'../bin/yt-dlp.exe');
const bundledFfmpeg=path.resolve(__dirname,'../bin/ffmpeg.exe');

// Windows用実行ファイルをプロジェクト内に同梱して直接使用。
// npmのinstall scriptがブロックされても python / python3 を必要としない。
const youtubedl=youtubedlPackage.create(bundledYtDlp);
const ffmpegPath=bundledFfmpeg;

assertConfig();
const store = loadStore();
console.log(`🔐 BOTオーナーID読込: ${config.ownerIds.length}件 / .env: ${config.envPath}`);
console.log(`💾 データ保存先: ${config.dataDir}`);
console.log(`🎵 yt-dlp: ${bundledYtDlp}`);
console.log(`🎵 ffmpeg: ${ffmpegPath}`);
const players = new Map(); // key: guildId:voiceChannelId
const musicBotClients=[];
const pendingRoleCreates = new Map();
process.on('unhandledRejection',e=>console.error('⚠️ unhandledRejection (BOT継続):',e));
process.on('uncaughtException',e=>console.error('⚠️ uncaughtException (BOT継続):',e));

// 管理者・ショップ・URL・音声の共通ヘルパー
const ADMIN_COMMANDS=new Set([
  'shop-admin','verify-panel','verify-admin','verify-status','verify-settings',
  'join-leave-settings','join-leave-status','welcome-settings','welcome-status','ticket-panel','ticket-settings','ticket-status','ticket-log-channel',
  'autoreply-add','autoreply-remove','autoreply-list','guild-settings','guild-status','setting',
  'social-source-add','social-source-remove','social-list','social-test','latest-add','x-add','x-list','x-edit','x-remove','x-test','rsshub-status','media-add','media-remove',
  'news-source-add','news-source-remove','news-list','news-auto','news-test',
  'weather-auto-add','weather-auto-list','weather-auto-remove','weather-register','weather-admin','weather-channel','weather-channel-remove','weather-list','weather-auto',
  'earthquake-register','earthquake-list','earthquake-auto','earthquake-auto-add','earthquake-auto-list','earthquake-auto-remove',
  'schedule-post','schedule-list','schedule-cancel',
  'moderation-rule','moderation-list','moderation-remove',
  'role-panel','role-add','role-list','role-remove','role-create','role-delete','weather-setup','earthquake-setup'
]);

function isGuildOwner(interaction){
  return Boolean(interaction.guild && interaction.user && interaction.guild.ownerId===interaction.user.id);
}

function hasConfiguredAdminRole(interaction){
  if(!interaction.guild||!interaction.user)return false;
  if(isGuildOwner(interaction)||isBotOwnerUser(interaction.user))return true;
  const g=guildData(store,interaction.guildId);
  const ids = Array.isArray(g.adminRoleIds) ? g.adminRoleIds : [];
  return ids.some(id=>interaction.member?.roles?.cache?.has(id));
}

function isShopManager(interaction,shop){
  if(!interaction.user||!shop)return false;
  if(interaction.user.id===shop.ownerId)return true;
  if(isBotOwnerUser(interaction.user))return true;
  if(interaction.guild?.ownerId===interaction.user.id)return true;
  if(hasConfiguredAdminRole(interaction))return true;
  return Boolean(shop.managerRoleId && interaction.member?.roles?.cache?.has(shop.managerRoleId));
}

function validHttpUrl(value){
  try{
    const u=new URL(value);
    return u.protocol==='http:'||u.protocol==='https:';
  }catch{return false;}
}

function musicSessionKey(guildId,voiceChannelId){return `${guildId}:${voiceChannelId}`;}
function sessionForInteraction(interaction){
  const vcId=interaction.member?.voice?.channelId;
  return vcId?players.get(musicSessionKey(interaction.guildId,vcId)):null;
}
function fmtDuration(sec){sec=Math.max(0,Number(sec)||0);const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=Math.floor(sec%60);return h?`${h}時間${m}分`:(m?`${m}分${s}秒`:`${s}秒`);}
async function resolveMusicTrack(input){
  const isUrl=/^https?:\/\//i.test(input);
  const target=isUrl?input:`ytsearch1:${input}`;
  const info=await youtubedl(target,{dumpSingleJson:true,noPlaylist:true,skipDownload:true,noWarnings:true});
  const row=Array.isArray(info?.entries)?info.entries[0]:info;
  if(!row)throw new Error('曲が見つかりませんでした。');
  const webpage=row.webpage_url||row.original_url||row.url;
  const title=row.title||input;
  const duration=Number(row.duration)||0;
  const stream=await youtubedl(webpage,{getUrl:true,format:'bestaudio/best',noPlaylist:true,noWarnings:true});
  const streamUrl=String(stream).trim().split(/\r?\n/).find(x=>/^https?:\/\//.test(x));
  if(!streamUrl)throw new Error('音声ストリームURLを取得できませんでした。');
  return {title,url:webpage,streamUrl,duration,id:String(row.id||webpage)};
}

function musicStats(guildId){
  const g=guildData(store,guildId);g.musicStats??={users:{},tracks:{},totalPlays:0};return g.musicStats;
}
function recordTrackStart(guildId,track){
  const st=musicStats(guildId);st.totalPlays=(st.totalPlays||0)+1;
  const t=st.tracks[track.id]??={title:track.title,url:track.url,plays:0,seconds:0};t.plays++;t.title=track.title;t.url=track.url;saveStore(store);
}
async function chooseMusicClient(guildId){
  const all=[client,...musicBotClients].filter(c=>c?.isReady?.() && c.guilds.cache.has(guildId));
  const busyIds=new Set([...players.values()].filter(x=>x.guildId===guildId).map(x=>x.client.user.id));
  return all.find(c=>!busyIds.has(c.user.id))||null;
}
async function createMusicSession(interaction,vc){
  const key=musicSessionKey(interaction.guildId,vc.id);let existing=players.get(key);if(existing)return existing;
  const botClient=await chooseMusicClient(interaction.guildId);
  if(!botClient)throw new Error('このサーバーで利用できる音楽BOTがありません。4同時再生には MUSIC_BOT_TOKEN_2〜4 の追加BOTが必要です。');
  const bg=botClient.guilds.cache.get(interaction.guildId);const bvc=bg?.channels.cache.get(vc.id)||await bg?.channels.fetch(vc.id).catch(()=>null);
  if(!bvc)throw new Error('音楽BOTからボイスチャンネルを取得できません。追加BOTを同じサーバーへ招待してください。');
  const connection=joinVoiceChannel({
    channelId:vc.id,guildId:interaction.guildId,adapterCreator:bg.voiceAdapterCreator,selfDeaf:true,
    // 追加BOTごとに別groupを使い、同一サーバーで最大4VCを独立接続させる。
    group:`music-${botClient.user.id}`
  });
  connection.on('error',e=>console.error(`voice connection error [${vc.id}]`,e));
  try{await entersState(connection,VoiceConnectionStatus.Ready,20_000);}catch(e){try{connection.destroy();}catch{};throw new Error(`ボイスチャンネル接続に失敗しました: ${e.message||e}`);}
  const player=createAudioPlayer();connection.subscribe(player);
  player.on('error',e=>{console.error(`audio player error [${vc.id}]`,e);try{s?.ffmpeg?.kill();}catch{};if(s){s.playing=false;s.current=null;s.ffmpeg=null;s.startedAt=null;setTimeout(()=>playNext(key).catch(console.error),500);}});
  const s={key,guildId:interaction.guildId,voiceChannelId:vc.id,client:botClient,connection,player,queue:[],playing:false,current:null,volume:100,ffmpeg:null,startedAt:null};
  player.on(AudioPlayerStatus.Idle,()=>{try{s.ffmpeg?.kill();}catch{};if(s.current&&s.startedAt){const st=musicStats(s.guildId);const t=st.tracks[s.current.id];if(t)t.seconds=(t.seconds||0)+Math.max(0,Math.floor((Date.now()-s.startedAt)/1000));saveStore(store);}s.ffmpeg=null;s.playing=false;s.current=null;s.startedAt=null;playNext(key).catch(console.error);});
  players.set(key,s);return s;
}


function destroyMusicSession(s){
  if(!s)return;
  s.queue.length=0;
  try{s.ffmpeg?.kill();}catch{}
  s.ffmpeg=null;s.current=null;s.playing=false;s.startedAt=null;
  try{s.player.stop(true);}catch{}
  try{s.connection.destroy();}catch{}
  players.delete(s.key);
}



function createFfmpegAudio(url){
  if(!validHttpUrl(url))throw new Error('再生URLが正しくありません。');
  const proc=spawn(ffmpegPath,[
    '-hide_banner','-loglevel','error','-i',url,
    '-f','s16le','-ar','48000','-ac','2','pipe:1'
  ],{stdio:['ignore','pipe','pipe']});
  proc.stderr?.on('data',d=>console.error(`ffmpeg: ${String(d).trim()}`));
  const resource=createAudioResource(proc.stdout,{inputType:StreamType.Raw,inlineVolume:true});
  return {proc,resource};
}


function buildChannelRolePanel(channelId,cfg,valid,page=0){
  const PAGE_SIZE=20;
  const totalPages=Math.max(1,Math.ceil(valid.length/PAGE_SIZE));
  page=Math.max(0,Math.min(totalPages-1,page));
  const slice=valid.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE);
  const lines=slice.map(x=>`**${x.label}**：<@&${x.roleId}> ${x.mode==='approval'?'🔒 承認制':'⚡ 即時付与'}`);
  const desc=[cfg.description||'',...lines].filter(Boolean).join('\n');
  const embed=new EmbedBuilder().setTitle(cfg.title||'チャンネルアクセス権限').setDescription(desc||'ボタンからロールを選択してください。');
  const rows=[];
  for(let i=0;i<slice.length;i+=5){
    rows.push(new ActionRowBuilder().addComponents(...slice.slice(i,i+5).map(x=>
      new ButtonBuilder().setCustomId(`${x.mode==='approval'?'roleapprove':'role'}:${x.roleId}:${channelId}`).setLabel(x.label).setStyle(x.mode==='approval'?ButtonStyle.Secondary:ButtonStyle.Primary)
    )));
  }
  if(totalPages>1){
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rolepanelprev:${channelId}:${page}`).setLabel('◀ 前へ').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
      new ButtonBuilder().setCustomId(`rolepanelnext:${channelId}:${page}`).setLabel(`次へ ▶ ${page+1}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(page>=totalPages-1)
    ));
  }
  return {embeds:[embed],components:rows};
}

// 自動販売機 管理UI
function shopManageEmbed(shop){
  const products=(shop.products||[]);
  const active=products.filter(p=>p.active!==false);
  const orders=Object.values(store.orders||{}).filter(o=>Number(o.shopId)===Number(shop.id));
  return new EmbedBuilder()
    .setTitle(`自販機設定 - ${shop.name}`)
    .setDescription([
      `**リンク受取チャンネル**\n${shop.orderChannelId?`<#${shop.orderChannelId}>`:'未設定'}`,
      `**実績チャンネル**\n${shop.salesChannelId?`<#${shop.salesChannelId}>`:'未設定'}`,
      `**購入者ロール**\n${shop.managerRoleId?`<@&${shop.managerRoleId}>`:'未設定'}`,
      `**販売数表示**\n${shop.showSalesCount?'ON':'OFF'}`,
      `**商品数**\n${active.length}`,
      `**購入履歴/統計**\n${orders.length}件`
    ].join('\n'));
}
function shopManageRows(shop){
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shopui:productadd:${shop.id}`).setLabel('商品追加').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`shopui:stock:${shop.id}`).setLabel('在庫確認').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`shopui:products:${shop.id}`).setLabel('商品一覧/編集').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shopui:orderchannel:${shop.id}`).setLabel('リンク受取チャンネル設定').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`shopui:saleschannel:${shop.id}`).setLabel('実績チャンネル設定').setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`shopui:salestoggle:${shop.id}`).setLabel(`販売数表示:${shop.showSalesCount?'ON':'OFF'}`).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`shopui:stats:${shop.id}`).setLabel('購入履歴/統計').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`shopui:display:${shop.id}`).setLabel('自動販売機表示').setStyle(ButtonStyle.Success)
    )
  ];
}
function buildShopSalesPanel(shop){
  const products=(shop.products||[]).filter(p=>p.active!==false && p.stock!==0).slice(0,25);
  if(!products.length)return null;
  const select=new StringSelectMenuBuilder().setCustomId(`shopselect:${shop.id}`).setPlaceholder('購入する商品を選択してください').addOptions(products.map(p=>({
    label:p.name.slice(0,100),description:`¥${Number(p.price).toLocaleString()} / 在庫 ${p.stock<0?'∞':p.stock}`.slice(0,100),value:p.id
  })));
  const orders=Object.values(store.orders||{}).filter(o=>Number(o.shopId)===Number(shop.id)&&o.status==='completed');
  const embed=new EmbedBuilder().setTitle(`🛒 ${shop.name}`).setDescription('下のメニューから商品を選択してください。');
  if(shop.showSalesCount)embed.addFields({name:'販売実績',value:`${orders.length}件`,inline:true});
  embed.setFooter({text:`販売者: ${shop.ownerId}`});
  return {embeds:[embed],components:[new ActionRowBuilder().addComponents(select)]};
}

// Discordクライアント本体
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

// VCから人間が全員退出したら音楽BOTも自動退出する。
client.on(Events.VoiceStateUpdate,(oldState,newState)=>{
  const guildId=oldState.guild?.id||newState.guild?.id;
  const affected=new Set([oldState.channelId,newState.channelId].filter(Boolean));
  if(!guildId||!affected.size)return;
  setTimeout(async()=>{
    for(const channelId of affected){
      const s=players.get(musicSessionKey(guildId,channelId));
      if(!s)continue;
      const guild=client.guilds.cache.get(s.guildId);
      const vc=guild?.channels.cache.get(s.voiceChannelId) || await guild?.channels.fetch(s.voiceChannelId).catch(()=>null);
      if(!vc?.members)continue;
      if(vc.members.filter(m=>!m.user.bot).size===0){
        console.log(`👋 VC ${s.voiceChannelId}: 全員退出のため音楽BOTを自動退出`);
        destroyMusicSession(s);
      }
    }
  },1500);
});


const rssParser=new Parser({timeout:15000,headers:{'User-Agent':'NoahXJP-Discord-NewsBot/1.0'}});

const P2PQUAKE_HISTORY_URL='https://api.p2pquake.net/v2/history?codes=551&limit=10';

async function fetchLatestEarthquake(){
  const res=await fetch(P2PQUAKE_HISTORY_URL,{headers:{'User-Agent':'NoahXJP-DiscordBot/5.14.2'},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw new Error(`P2PQuake HTTP ${res.status}`);
  const data=await res.json();
  return Array.isArray(data)?(data[0]||null):null;
}

function scaleToNumber(scale){
  const n=Number(scale);
  if(!Number.isFinite(n))return 0;
  // P2PQuake/JMA scale: 10=1,20=2,30=3,40=4,45=5弱,50=5強,55=6弱,60=6強,70=7
  if(n>=10)return n/10;
  return n;
}

function scaleToLabel(scale){
  const n=Number(scale);
  const labels={10:'1',20:'2',30:'3',40:'4',45:'5弱',50:'5強',55:'6弱',60:'6強',70:'7'};
  return labels[n]||String(scale??'不明');
}

function earthquakeText(item){
  if(!item)return '現在、地震情報を取得できませんでした。';
  const e=item.earthquake||{};
  const hypo=e.hypocenter||{};
  const points=item.points||[];
  const prefs=[...new Set(points.map(p=>p.pref).filter(Boolean))];
  const maxScale=scaleToLabel(e.maxScale);
  const magnitude=hypo.magnitude??e.magnitude??'不明';
  const depth=hypo.depth!=null?`${hypo.depth}km`:'不明';
  const place=hypo.name||'震源地不明';
  const time=e.time||item.time||'時刻不明';
  const tsunami=e.domesticTsunami||e.foreignTsunami||'None';
  const tsunamiText=tsunami==='None'?'津波の心配なし':`津波情報: ${tsunami}`;
  return [
    `🚨 **地震情報**`,
    `発生時刻: ${time}`,
    `震源地: **${place}**`,
    `最大震度: **${maxScale}**`,
    `マグニチュード: **${magnitude}**`,
    `深さ: **${depth}**`,
    `地域: ${prefs.slice(0,20).join('、')||'情報なし'}`,
    `${tsunamiText}`
  ].join('\n');
}


function splitDiscordBlocks(header,blocks,maxLength=1900){
  const pages=[]; let current=header||'';
  for(const block of (blocks||[])){
    const addition=(current?'\n\n':'')+block;
    if((current+addition).length>maxLength && current){pages.push(current);current=block;}
    else current+=addition;
  }
  if(current||!pages.length)pages.push(current||header||'情報はありません。');
  return pages;
}

function weatherCodeLabel(code){
  const c=Number(code);
  if(c===0)return ['☀️','快晴'];
  if([1,2].includes(c))return ['🌤️','晴れ'];
  if(c===3)return ['☁️','曇り'];
  if([45,48].includes(c))return ['🌫️','霧'];
  if([51,53,55,56,57].includes(c))return ['🌦️','霧雨'];
  if([61,63,65,66,67,80,81,82].includes(c))return ['🌧️','雨'];
  if([71,73,75,77,85,86].includes(c))return ['🌨️','雪'];
  if([95,96,99].includes(c))return ['⛈️','雷雨'];
  return ['🌤️','天気'];
}

// 都道府県の代表地点を固定。地名検索APIの曖昧な一致・取得失敗を回避する。
const WEATHER_COORDINATES = [
  [43.0621,141.3544],
  [40.8244,140.74],
  [39.7036,141.1527],
  [38.2682,140.8694],
  [39.7186,140.1024],
  [38.2404,140.3633],
  [37.7608,140.4748],
  [36.3659,140.4712],
  [36.5551,139.8828],
  [36.3895,139.0634],
  [35.8617,139.6455],
  [35.6074,140.1065],
  [35.6895,139.6917],
  [35.4437,139.638],
  [37.9161,139.0364],
  [36.6953,137.2113],
  [36.5613,136.6562],
  [36.0641,136.2196],
  [35.6639,138.5684],
  [36.6513,138.181],
  [35.4233,136.7606],
  [34.9756,138.3828],
  [35.1815,136.9066],
  [34.7303,136.5086],
  [35.0045,135.8686],
  [35.0116,135.7681],
  [34.6937,135.5023],
  [34.6901,135.1955],
  [34.6851,135.8048],
  [34.2304,135.1707],
  [35.5039,134.2377],
  [35.4723,133.0505],
  [34.6552,133.9195],
  [34.3853,132.4553],
  [34.1858,131.4714],
  [34.0703,134.5548],
  [34.3401,134.0434],
  [33.8416,132.7657],
  [33.5597,133.5311],
  [33.5904,130.4017],
  [33.2635,130.3009],
  [32.7503,129.8777],
  [32.8031,130.7079],
  [33.2382,131.6126],
  [31.9111,131.4239],
  [31.5966,130.5571],
  [26.2124,127.6809]
];
const weatherCache = new Map();
async function fetchWeatherPrefecture(pref){
  const index=PREFECTURES.findIndex(([name])=>name===pref);
  if(index<0)throw new Error(`都道府県が見つかりません: ${pref}`);
  const [,capital]=PREFECTURES[index];
  const cached=weatherCache.get(pref);
  if(cached && Date.now()-cached.at<10*60*1000)return cached.value;
  const [latitude,longitude]=WEATHER_COORDINATES[index];
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:String(latitude),longitude:String(longitude),daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',timezone:'Asia/Tokyo',forecast_days:'2'}).toString();
  let lastError;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const res=await fetch(url,{signal:AbortSignal.timeout(12000)});
      if(!res.ok)throw new Error(`Open-Meteo forecast HTTP ${res.status}`);
      const data=await res.json(),d=data.daily||{};
      if(!d.time?.[0] || !Number.isFinite(d.temperature_2m_max?.[0]) || !Number.isFinite(d.temperature_2m_min?.[0]))throw new Error('予報データが不足しています');
      const [icon,label]=weatherCodeLabel(d.weather_code?.[0]);
      const value={pref,capital,icon,label,min:d.temperature_2m_min[0],max:d.temperature_2m_max[0],rain:d.precipitation_sum?.[0],prob:d.precipitation_probability_max?.[0]};
      weatherCache.set(pref,{at:Date.now(),value});
      return value;
    }catch(e){lastError=e;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));}
  }
  throw lastError;
}

async function buildWeatherPages(regions){
  const prefs=[...new Set(regions||[])],blocks=[];
  // 全国47件でも1件ずつ待たない。API負荷を抑えつつ6件ずつ並列取得する。
  for(let i=0;i<prefs.length;i+=6){
    const batch=prefs.slice(i,i+6);
    const results=await Promise.allSettled(batch.map(pref=>fetchWeatherPrefecture(pref)));
    results.forEach((result,j)=>{
      const pref=batch[j];
      if(result.status==='fulfilled'){
        const w=result.value,rainExpected=Number(w.rain||0)>0 || Number(w.prob||0)>=40;
        blocks.push(`${w.icon} **${w.pref}（${w.capital}）** — ${w.label}\n最低 ${w.min??'-'}℃ / 最高 ${w.max??'-'}℃\n降水量 ${w.rain??'-'}mm / 降水確率 ${w.prob??'-'}%${rainExpected?'\n☔ 雨具があると安心です。':''}`);
      }else{
        console.error(`weather fetch ${pref}`,result.reason);
        blocks.push(`⚠️ **${pref}** — 天気情報を取得できませんでした。`);
      }
    });
  }
  return splitDiscordBlocks(`🌤️ **天気予報**\n代表地点: 各都道府県の県庁所在地付近`,blocks,1900);
}

async function replyWeatherPages(interaction,pages){
  await interaction.editReply({content:pages[0]||'天気情報を取得できませんでした。'});
  for(const page of pages.slice(1))await interaction.followUp({content:page});
}

function parseDiscordChannelUrl(raw,guildId){
  try{
    const u=new URL(raw);
    if(!['discord.com','www.discord.com','discordapp.com','www.discordapp.com'].includes(u.hostname))return null;
    const m=u.pathname.match(/^\/channels\/(\d+)\/(\d+)\/?$/);
    return m&&m[1]===guildId?{guildId:m[1],channelId:m[2]}:null;
  }catch{return null;}
}
function validNewsUrl(raw){try{return ['http:','https:'].includes(new URL(raw).protocol);}catch{return false;}}
function newsItemKey(i){return String(i.guid||i.id||i.link||`${i.title||''}|${i.isoDate||i.pubDate||''}`);}
function cleanNewsText(v,max=700){const t=String(v||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();return t.length>max?`${t.slice(0,max-1)}…`:t;}
function newsEmbed(source,item){
  const e=new EmbedBuilder().setTitle(cleanNewsText(item.title||'新着ニュース',250))
    .setDescription(cleanNewsText(item.contentSnippet||item.summary||item.content||'',700)||'新着記事が公開されました。')
    .setFooter({text:`NEWS ALERT • ${source.name}`}).setTimestamp(item.isoDate||item.pubDate?new Date(item.isoDate||item.pubDate):new Date());
  if(item.link&&validNewsUrl(item.link))e.setURL(item.link);
  const image=item.enclosure?.url||item['media:content']?.url||item['media:thumbnail']?.url;
  if(image&&validNewsUrl(image))e.setImage(image);
  return e;
}
async function fetchNewsFeed(source){return fetchSocialSource(source);}

const SOCIAL_RSS_BRIDGES=(process.env.SOCIAL_RSS_BRIDGE_URLS||process.env.SOCIAL_RSS_BRIDGE_URL||'http://127.0.0.1:1200')
  .split(',').map(x=>x.trim().replace(/\/+$/,'')).filter(Boolean);

function detectSocialPlatform(profileUrl){
  try{
    const h=new URL(profileUrl).hostname.toLowerCase().replace(/^www\./,'');
    if(h==='youtube.com'||h==='youtu.be'||h==='m.youtube.com')return 'youtube';
    if(h==='x.com'||h==='twitter.com'||h==='mobile.twitter.com')return 'twitter';
    if(h==='instagram.com'||h==='m.instagram.com')return 'instagram';
    return null;
  }catch{return null;}
}

function socialUsername(platform,profileUrl){
  try{
    const u=new URL(profileUrl),parts=u.pathname.split('/').filter(Boolean);
    if(platform==='twitter'||platform==='instagram')return parts[0]?.replace(/^@/,'')||null;
    return null;
  }catch{return null;}
}

async function resolveYouTubeFeed(profileUrl){
  const u=new URL(profileUrl);
  const direct=u.pathname.match(/^\/channel\/(UC[\w-]+)/);
  if(direct)return `https://www.youtube.com/feeds/videos.xml?channel_id=${direct[1]}`;
  const html=await fetch(profileUrl,{headers:{'User-Agent':'Mozilla/5.0'}}).then(r=>{
    if(!r.ok)throw new Error(`YouTube HTTP ${r.status}`);return r.text();
  });
  const match=html.match(/"channelId":"(UC[\w-]+)"/)||html.match(/"externalId":"(UC[\w-]+)"/)||html.match(/channel_id=(UC[\w-]+)/);
  if(!match)throw new Error('YouTubeチャンネルIDを自動取得できません');
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${match[1]}`;
}

async function fetchFxTwitterTimeline(username){
  const url=`https://api.fxtwitter.com/2/profile/${encodeURIComponent(username)}/statuses`;
  const res=await fetch(url,{headers:{'User-Agent':'NoahXJP-DiscordBot/6.0 (+Discord notification bot)'},signal:AbortSignal.timeout(15000)});
  if(!res.ok)throw new Error(`FxTwitter HTTP ${res.status}`);
  const data=await res.json();
  const rows=data.statuses||data.results||data.tweets||[];
  if(!Array.isArray(rows))throw new Error('FxTwitterのタイムライン応答を解析できません');
  return {items:rows.map(x=>({
    title:`X @${x.author?.screen_name||x.author?.username||username}`,
    link:`https://fxtwitter.com/${x.author?.screen_name||x.author?.username||username}/status/${x.id}`,
    guid:String(x.id),id:String(x.id),isoDate:x.created_at,contentSnippet:x.text||'',raw:x
  }))};
}

async function fetchSocialSource(source){
  if(source.platform==='twitter' && String(source.feedUrl||'').startsWith('fxtwitter://')){
    const username=decodeURIComponent(String(source.feedUrl).slice('fxtwitter://'.length));
    return fetchFxTwitterTimeline(username);
  }
  return rssParser.parseURL(source.feedUrl);
}

async function resolveSocialFeedAuto(platform,profileUrl){
  if(platform==='youtube'){
    const feedUrl=await resolveYouTubeFeed(profileUrl);
    await rssParser.parseURL(feedUrl);
    return {feedUrl,method:'YouTube公式Atom/RSS'};
  }
  const username=socialUsername(platform,profileUrl);
  if(!username)throw new Error('プロフィールURLからユーザー名を取得できません');
  if(platform==='twitter'){
    const feedUrl=`fxtwitter://${encodeURIComponent(username)}`;
    await fetchFxTwitterTimeline(username);
    return {feedUrl,method:'FxTwitter API v2'};
  }
  const route=`/instagram/user/${encodeURIComponent(username)}`;
  const errors=[];
  for(const bridge of SOCIAL_RSS_BRIDGES){
    const feedUrl=bridge+route;
    try{
      await rssParser.parseURL(feedUrl);
      return {feedUrl,method:`RSSブリッジ (${new URL(bridge).hostname})`};
    }catch(e){errors.push(`${bridge}: ${e.message}`);}
  }
  throw new Error(`${platform==='twitter'?'X / Twitter':'Instagram'} の利用可能なRSS取得経路がありません。RSSブリッジ側の制限・障害の可能性があります。`);
}


client.on(Events.GuildMemberAdd, async member => {
  const g = guildData(store, member.guild.id);
  if (!g.joinLogChannelId) return;

  const ch = member.guild.channels.cache.get(g.joinLogChannelId)
    || await member.guild.channels.fetch(g.joinLogChannelId).catch(()=>null);
  if (!ch?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle((g.joinTitle||'📥 メンバー参加').slice(0,256))
    .setDescription(`${member} がサーバーに参加しました。${g.verificationPanelChannelId?`\n\n🔐 **認証はこちら:** <#${g.verificationPanelChannelId}>`:''}`)
    .addFields(
      {name:'ユーザー', value:`${member.user.tag}`, inline:true},
      {name:'メンバー数', value:String(member.guild.memberCount), inline:true}
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  const components=g.verificationPanelChannelId ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('認証チャンネルへ移動').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${member.guild.id}/${g.verificationPanelChannelId}`))] : [];
  await ch.send({embeds:[embed],components}).catch(e=>console.error('join log error',e));
});

client.on(Events.GuildMemberRemove, async member => {
  const g = guildData(store, member.guild.id);
  if (!g.leaveLogChannelId) return;

  const ch = member.guild.channels.cache.get(g.leaveLogChannelId)
    || await member.guild.channels.fetch(g.leaveLogChannelId).catch(()=>null);
  if (!ch?.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setTitle('📤 メンバー退出')
    .setDescription(`**${member.user.tag}** がサーバーから退出しました。`)
    .addFields(
      {name:'ユーザーID', value:member.user.id, inline:true},
      {name:'メンバー数', value:String(member.guild.memberCount), inline:true}
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await ch.send({embeds:[embed]}).catch(e=>console.error('leave log error',e));
});

client.on(Events.MessageCreate, async msg => {
  if (!msg.guild || msg.author.bot) return;
  const g = guildData(store, msg.guild.id);

  for (const r of store.moderationRules.filter(x => x.guildId === msg.guild.id)) {
    if (!msg.content.toLowerCase().includes(r.keyword.toLowerCase())) continue;
    try {
      if (r.action === 'delete') await msg.delete();
      if (r.action === 'timeout' && msg.member?.moderatable) await msg.member.timeout(10*60*1000, `自動モデレーション: ${r.keyword}`);
      if (r.action === 'kick' && msg.member?.kickable) await msg.member.kick(`自動モデレーション: ${r.keyword}`);
      if (r.action === 'ban' && msg.member?.bannable) await msg.member.ban({ reason:`自動モデレーション: ${r.keyword}` });
    } catch (e) { console.error(e); }
    return;
  }

  for (const [keyword, raw] of Object.entries(g.autoReplies || {})) {
    const data = typeof raw === 'string' ? { reply:raw, mode:'contains' } : raw;
    const hit = data.mode === 'exact' ? msg.content === keyword : msg.content.includes(keyword);
    if (hit) { await msg.reply(data.reply).catch(()=>{}); break; }
  }
});


function rolePanelProblem(guild, role) {
  if (!guild || !role) return 'ロール情報を取得できません。';
  if (role.id === guild.id) return '@everyone は選択できません。';
  if (role.managed) return '連携サービス・BOT管理ロールは付与/解除できません。';

  const me = guild.members.me;
  if (!me) return 'BOT自身のサーバー情報を取得できません。';

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return 'BOTに「ロールの管理」権限がありません。';
  }

  if (role.position >= me.roles.highest.position) {
    return `BOTのロールより「${role.name}」が上にあります。サーバー設定 → ロール でBOTのロールを対象ロールより上へ移動してください。`;
  }

  return null;
}

client.on(Events.InteractionCreate, async interaction => {
  console.log(`📨 Interaction受信: type=${interaction.type} command=${interaction.commandName || '-'} user=${interaction.user?.tag || interaction.user?.id || '-'}`);
  try {
    if (interaction.isAutocomplete()) {
      const choices = interaction.commandName.startsWith('earthquake')
        ? searchPrefectureChoices(interaction.options.getFocused())
        : searchRegionChoices(interaction.options.getFocused());
      return interaction.respond(choices);
    }

    if (interaction.isChatInputCommand()) {
      const n = interaction.commandName;

      if(ADMIN_COMMANDS.has(n) && !hasConfiguredAdminRole(interaction)){
        const g=guildData(store,interaction.guildId);
        return interaction.reply({
          content:(g.adminRoleIds||[]).length
            ? `❌ 設定済み管理者ロール（${g.adminRoleIds.map(id=>`<@&${id}>`).join(' / ')}）のいずれかが必要です。`
            : '❌ 管理者ロールが未設定です。サーバー所有者が `/admin-role-set` で最初の管理者ロールを設定してください。',
          ephemeral:true
        });
      }


      if (n === 'ping') {
        return interaction.reply({
          content:`✅ BOTは正常にコマンドを受信しています。\nBOT: ${client.user.tag}\nBOT ID: ${client.user.id}\nGuild: ${interaction.guild?.name || 'DM'}\n時刻: ${new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}`,
          ephemeral:true
        });
      }

      if (n === 'supportchannel') return interaction.reply({content:'🆘 サポートサーバー: https://discord.gg/KGhYc6cWmq',ephemeral:true});
      if (n === 'help') {
        return interaction.reply({
          embeds:[new EmbedBuilder()
            .setTitle('🤖 Discord MultiBot v5.0 完全統合版')
            .setDescription(
`1. 🛒 **自販機・商品・PayPay購入・在庫・管理者**
/shop-create /shop-list /shop-config /shop-delete /shop-admin
/product-add /product-list /product-edit /product-remove /order-list /shop-panel

2. ✅ **管理者承認型認証・認証管理ページ**
/verify-panel /verify-admin /verify-status /verify-settings

3. 🎭 **ロール無制限・自動ページ分割パネル**
/role-panel /role-add /role-list /role-remove

4. 🚪 **入室・退出通知と設定確認**
/join-leave-settings /join-leave-status /guild-settings /guild-status /setting

5. 🎫 **チケット**
/ticket-panel /ticket-settings /ticket-status

6. 💬 **自動返信**
/autoreply-add /autoreply-remove /autoreply-list

7. 📢 **予約投稿・自動削除**
/schedule-post /schedule-list /schedule-cancel

8. 🛡️ **モデレーション**
/moderation-rule /moderation-list /moderation-remove

9. 📡 **SNS最新情報**
/social-source-add /social-source-remove /social-list /social-test

10. 📰 **NEWS ALERTS**
/news-source-add /news-source-remove /news-list /news-auto /news-test

10. 🌤️ **47都道府県・地方・全国・複数地域天気**
/weather /weather-register /weather-list /weather-admin /weather-auto /weather-channel /weather-channel-remove

10. 🚨 **天気とは独立した地震速報**
/earthquake /earthquake-register /earthquake-list /earthquake-auto

11. 🎵 **VC音楽**
/play /queue /pause /resume /skip /stop /nowplaying /volume

12. 👑 **管理者権限**
/owner-status /admin-role-set /admin-role-status

🔧 **動作診断**
/diagnostics

🆘 サポート: https://discord.gg/KGhYc6cWmq

補助: /video
AI生成機能は搭載していません。`
            )
          ],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('support_help').setLabel('🆘 サポート').setStyle(ButtonStyle.Primary))],
          ephemeral:true
        });
      }

      if (n === 'owner-status') {
        return interaction.reply({ content:isBotOwnerUser(interaction.user) ? `✅ BOTオーナーです。\nあなたのID: ${interaction.user.id}\nBOT_OWNER_IDS: 読み込み済み (${config.ownerIds.length}件)` : `ℹ️ BOTオーナーではありません。\nあなたのID: ${interaction.user.id}\nBOT_OWNER_IDS: ${config.ownerIds.length ? `読み込み済み (${config.ownerIds.length}件)` : '❌ 未読込（BOT本体直下の .env を確認）'}`, ephemeral:true });
      }
      if (n === 'bot-restart') {
        if (!isBotOwnerUser(interaction.user)) {
          return interaction.reply({content:'❌ BOT再起動はBOTオーナーのみ実行できます。',ephemeral:true});
        }
        await interaction.reply({content:`🔄 BOTを再起動します。\n実行者: ${interaction.user.username} (${interaction.user.id})`,ephemeral:true});
        console.log(`🔄 BOT再起動要求: ${interaction.user.username} (${interaction.user.id})`);
        setTimeout(() => {
          try {
            const entry = process.argv[1];
            const child = spawn(process.execPath, [entry], {
              cwd: process.cwd(),
              env: process.env,
              detached: true,
              stdio: 'ignore'
            });
            child.unref();
            process.exit(0);
          } catch (error) {
            console.error('❌ BOT再起動に失敗:', error);
          }
        }, 1200);
        return;
      }
      if (n === 'admin-role-set') {
        const g=guildData(store,interaction.guildId);
        // 最初の1件はサーバー所有者/BOTオーナーのみ。以後は登録済み管理者も追加可能。
        if((g.adminRoleIds||[]).length===0 && !isGuildOwner(interaction) && !isBotOwnerUser(interaction.user)){
          return interaction.reply({content:'❌ 最初の管理者ロール設定はサーバー所有者またはBOTオーナーのみ実行できます。',ephemeral:true});
        }
        if((g.adminRoleIds||[]).length>0 && !hasConfiguredAdminRole(interaction)){
          return interaction.reply({content:'❌ 管理者ロールの追加には、設定済み管理者ロールが必要です。',ephemeral:true});
        }
        const role=interaction.options.getRole('role',true);
        if(role.id===interaction.guild.id)return interaction.reply({content:'❌ @everyone は管理者ロールに設定できません。',ephemeral:true});
        g.adminRoleIds ??= [];
        if(!g.adminRoleIds.includes(role.id))g.adminRoleIds.push(role.id);
        g.adminRoleId=g.adminRoleIds[0]||null; // 旧データ互換
        saveStore(store);
        return interaction.reply({content:`✅ ${role} を管理者ロールに追加しました。
現在: ${g.adminRoleIds.map(id=>`<@&${id}>`).join(' / ')}`,ephemeral:true});
      }

      if (n === 'admin-role-remove') {
        const g=guildData(store,interaction.guildId);
        if(!hasConfiguredAdminRole(interaction))return interaction.reply({content:'❌ 管理者ロールの解除には管理者権限が必要です。',ephemeral:true});
        const role=interaction.options.getRole('role',true);
        g.adminRoleIds=(g.adminRoleIds||[]).filter(id=>id!==role.id);
        g.adminRoleId=g.adminRoleIds[0]||null;
        saveStore(store);
        return interaction.reply({content:`✅ ${role} を管理者ロールから解除しました。
現在: ${g.adminRoleIds.length?g.adminRoleIds.map(id=>`<@&${id}>`).join(' / '):'未設定'}`,ephemeral:true});
      }

      if (n === 'admin-role-status') {
        const g=guildData(store,interaction.guildId);
        if(!hasConfiguredAdminRole(interaction)){
          return interaction.reply({
            content:'❌ この管理情報を確認できるのは、サーバー所有者または指定された管理者ロールのメンバーだけです。',
            ephemeral:true
          });
        }
        return interaction.reply({
          content:(g.adminRoleIds||[]).length
            ? `🔐 **管理者設定**\nサーバー所有者: <@${interaction.guild.ownerId}>\n管理者ロール (${g.adminRoleIds.length}件): ${g.adminRoleIds.map(id=>`<@&${id}>`).join(' / ')}\nあなたの利用権限: ✅ あり`
            : `⚠️ 管理者ロールは未設定です。\nサーバー所有者 <@${interaction.guild.ownerId}> が \`/admin-role-set\` で設定してください。`,
          ephemeral:true
        });
      }

      if (n === 'diagnostics') {
        const me=interaction.guild?.members?.me;
        const g=guildData(store,interaction.guildId);
        const checks=[
          ['BOT接続', client.isReady()?'✅':'❌'],
          ['ロール管理', me?.permissions?.has(PermissionFlagsBits.ManageRoles)?'✅':'❌'],
          ['チャンネル管理', me?.permissions?.has(PermissionFlagsBits.ManageChannels)?'✅':'❌'],
          ['メッセージ送信', me?.permissions?.has(PermissionFlagsBits.SendMessages)?'✅':'❌'],
          ['メンバー管理イベント', 'Developer Portal の SERVER MEMBERS INTENT がON必須'],
          ['認証ロール', g.verificationRoleId?`<@&${g.verificationRoleId}>`:'未設定'],
          ['認証承認通知先', g.verificationReviewChannelId?`<#${g.verificationReviewChannelId}>`:'未設定'],
          ['入室通知', g.joinLogChannelId?`<#${g.joinLogChannelId}>`:'未設定'],
          ['退出通知', g.leaveLogChannelId?`<#${g.leaveLogChannelId}>`:'未設定'],
          ['天気通知', g.weatherChannelId?`<#${g.weatherChannelId}>`:'未設定'],
          ['地震通知', g.earthquakeChannelId?`<#${g.earthquakeChannelId}>`:'未設定'],
          ['チケットカテゴリ', g.ticketCategoryId?`<#${g.ticketCategoryId}>`:'未設定'],
          ['サポートロール', g.ticketSupportRoleId?`<@&${g.ticketSupportRoleId}>`:'未設定']
        ];
        return interaction.reply({
          content:`🔧 **BOT診断**\n${checks.map(([k,v])=>`**${k}**: ${v}`).join('\n')}`,
          ephemeral:true
        });
      }


      if (n === 'shop-create') {
        const id = store.nextShopId++;
        const shop = {
          id,
          guildId:interaction.guildId,
          ownerId:interaction.user.id,
          name:interaction.options.getString('name',true),
          managerRoleId:interaction.options.getRole('manager_role')?.id || null,
          orderChannelId:interaction.options.getChannel('order_channel')?.id || interaction.channelId,
          salesChannelId:interaction.options.getChannel('sales_channel')?.id || null,
          historyChannelId:interaction.options.getChannel('history_channel')?.id || interaction.options.getChannel('order_channel')?.id || interaction.channelId,
          active:true,
          products:[]
        };
        store.shops[id]=shop;
        saveStore(store);
        return interaction.reply({
          content:`✅ 自動販売機 #${id}「${shop.name}」を作成しました。\nオーナー: <@${shop.ownerId}>\n注文通知: <#${shop.orderChannelId}>\n購入履歴: <#${shop.historyChannelId}>`,
          ephemeral:true
        });
      }

      if (n === 'shop-list') {
        const shops = Object.values(store.shops)
          .filter(s=>s.guildId===interaction.guildId && s.active!==false);
        return interaction.reply({
          content:shops.length
            ? shops.map(s=>`#${s.id} **${s.name}** / owner:<@${s.ownerId}>${s.managerRoleId?` / 管理:<@&${s.managerRoleId}>`:''}`).join('\n')
            : '自動販売機はまだありません。',
          ephemeral:true
        });
      }

      if (n === 'shop-config') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 管理権限がありません。',ephemeral:true});

        const name=interaction.options.getString('name');
        const role=interaction.options.getRole('manager_role');
        const ch=interaction.options.getChannel('order_channel');
        const salesCh=interaction.options.getChannel('sales_channel');
        const historyCh=interaction.options.getChannel('history_channel');
        if(!name&&!role&&!ch&&!salesCh&&!historyCh)return interaction.reply({content:'❌ 変更する項目を1つ以上指定してください。',ephemeral:true});

        if(name)shop.name=name.trim();
        if(role)shop.managerRoleId=role.id;
        if(ch)shop.orderChannelId=ch.id;
        if(salesCh)shop.salesChannelId=salesCh.id;
        if(historyCh)shop.historyChannelId=historyCh.id;
        saveStore(store);
        return interaction.reply({content:`✅ 自販機設定を更新しました。\n購入履歴固定先: ${shop.historyChannelId?`<#${shop.historyChannelId}>`:'未設定'}`,ephemeral:true});
      }

      if (n === 'shop-delete') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});

        const allowed = isBotOwnerUser(interaction.user)
          || shop.ownerId===interaction.user.id
          || hasConfiguredAdminRole(interaction)
          || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);

        if(!allowed)return interaction.reply({content:'❌ 自販機停止はオーナー・サーバー管理者・BOTオーナーのみ可能です。',ephemeral:true});
        shop.active=false;
        saveStore(store);
        return interaction.reply({content:`🛑 自販機 #${shop.id}「${shop.name}」を停止しました。`,ephemeral:true});
      }

      if (n === 'shop-admin') {
        if(!hasConfiguredAdminRole(interaction) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && !isBotOwnerUser(interaction.user)){
          return interaction.reply({content:'❌ 管理者のみ使用できます。',ephemeral:true});
        }
        const shops=Object.values(store.shops).filter(s=>s.guildId===interaction.guildId && s.active!==false);
        const embed=new EmbedBuilder().setTitle('自販機管理').setDescription(`**自販機一覧**\n販売メンバー用\n\n現在: **${shops.length}台**`);
        const row=new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('shopui:create').setLabel('自販機作成').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('shopui:delete').setLabel('自販機削除').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('shopui:settings').setLabel('自販機設定').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('shopui:displayselect').setLabel('自販機表示').setStyle(ButtonStyle.Success)
        );
        return interaction.reply({embeds:[embed],components:[row],ephemeral:true});
      }

      if (n === 'product-add') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId||shop.active===false)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 管理権限がありません。',ephemeral:true});

        const addedZip=interaction.options.getAttachment('zip_file');
        const addedDownloadUrl=interaction.options.getString('download_url');
        const addedGiga=interaction.options.getString('gigafile_url');
        const requestedMode=interaction.options.getString('delivery_mode');
        if(addedZip && !addedZip.name?.toLowerCase().endsWith('.zip')){
          return interaction.reply({content:'❌ 販売ファイルは .zip を添付してください。',ephemeral:true});
        }
        if(requestedMode==='zip' && !addedZip)return interaction.reply({content:'❌ ZIP販売を選択した場合は `zip_file` を添付してください。',ephemeral:true});
        if(requestedMode==='gigafile' && !addedGiga)return interaction.reply({content:'❌ ギガファイル便販売を選択した場合は `gigafile_url` を設定してください。',ephemeral:true});
        if(requestedMode==='url' && !addedDownloadUrl)return interaction.reply({content:'❌ URL販売を選択した場合は `download_url` を設定してください。',ephemeral:true});

        const p={
          id:Date.now().toString(36),
          name:interaction.options.getString('name',true),
          price:interaction.options.getInteger('price',true),
          stock:interaction.options.getInteger('stock',true),
          description:interaction.options.getString('description') || '',
          imageUrl:interaction.options.getString('image_url') || '',
          deliveryMode:interaction.options.getString('delivery_mode') || (interaction.options.getAttachment('zip_file')?'zip':interaction.options.getString('gigafile_url')?'gigafile':interaction.options.getString('download_url')?'url':'none'),
          zipFile:interaction.options.getAttachment('zip_file') ? {
            url:interaction.options.getAttachment('zip_file').url,
            name:interaction.options.getAttachment('zip_file').name,
            size:interaction.options.getAttachment('zip_file').size,
            contentType:interaction.options.getAttachment('zip_file').contentType||''
          } : null,
          downloadUrl:interaction.options.getString('download_url') || '',
          delivery:interaction.options.getString('delivery') || '',
          deliveryFileUrl:interaction.options.getString('delivery_file_url') || '',
          roleId:interaction.options.getRole('role')?.id || null,
          active:true
        };
        shop.products ??= [];
        shop.products.push(p);
        saveStore(store);
        return interaction.reply({content:`✅ ${p.name} を追加しました。商品ID: \`${p.id}\``,ephemeral:true});
      }

      if (n === 'product-list') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 商品一覧を見る権限がありません。',ephemeral:true});

        const products=shop.products||[];
        const lines=products.map(p=>`\`${p.id}\` ${p.active===false?'🛑':'✅'} **${p.name}** / ¥${Number(p.price).toLocaleString()} / 在庫:${p.stock<0?'∞':p.stock}${p.imageUrl?' / 🖼️画像あり':''}${p.deliveryMode?` / 配布:${p.deliveryMode}`:''}${p.roleId?` / 付与:<@&${p.roleId}>`:''}`);
        return interaction.reply({content:lines.join('\n')||'商品はありません。',ephemeral:true});
      }

      if (n === 'product-edit') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 管理権限がありません。',ephemeral:true});

        const productId=interaction.options.getString('product_id',true);
        const p=(shop.products||[]).find(x=>x.id===productId);
        if(!p)return interaction.reply({content:'❌ 商品IDが見つかりません。',ephemeral:true});

        const name=interaction.options.getString('name');
        const price=interaction.options.getInteger('price');
        const stock=interaction.options.getInteger('stock');
        const description=interaction.options.getString('description');
        const imageUrl=interaction.options.getString('image_url');
        const deliveryMode=interaction.options.getString('delivery_mode');
        const zipFile=interaction.options.getAttachment('zip_file');
        const downloadUrl=interaction.options.getString('download_url');
        const delivery=interaction.options.getString('delivery');
        const fileUrl=interaction.options.getString('delivery_file_url');
        const role=interaction.options.getRole('role');

        if(name!==null)p.name=name;
        if(price!==null)p.price=price;
        if(stock!==null)p.stock=stock;
        if(description!==null)p.description=description;
        if(imageUrl!==null)p.imageUrl=imageUrl;
        if(deliveryMode!==null)p.deliveryMode=deliveryMode;
        if(zipFile){
          if(!zipFile.name?.toLowerCase().endsWith('.zip'))return interaction.reply({content:'❌ ZIPファイル（.zip）を添付してください。',ephemeral:true});
          p.zipFile={url:zipFile.url,name:zipFile.name,size:zipFile.size,contentType:zipFile.contentType||''};
          p.deliveryMode='zip';
        }
        if(downloadUrl!==null){p.downloadUrl=downloadUrl;p.deliveryMode=deliveryMode||'url';}
        if(delivery!==null)p.delivery=delivery;
        if(fileUrl!==null)p.deliveryFileUrl=fileUrl;
        if(role)p.roleId=role.id;

        saveStore(store);
        return interaction.reply({content:`✅ 商品 \`${p.id}\`「${p.name}」を更新しました。`,ephemeral:true});
      }

      if (n === 'product-url-update') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 管理権限がありません。',ephemeral:true});
        const p=(shop.products||[]).find(x=>x.id===interaction.options.getString('product_id',true));
        if(!p)return interaction.reply({content:'❌ 商品が見つかりません。',ephemeral:true});
        const url=interaction.options.getString('gigafile_url',true).trim();
        const days=interaction.options.getInteger('url_expiry_days',true);
        if(!/^https:\/\/(?:www\.)?gigafile\.nu\//i.test(url))return interaction.reply({content:'❌ ギガファイル便URLを指定してください。',ephemeral:true});
        p.gigafileUrl=url;
        p.gigafileExpiresAt=new Date(Date.now()+days*86400000).toISOString();
        p.gigafileExpiryNotifiedAt=null;
        saveStore(store);
        return interaction.reply({content:`✅ **${p.name}** のURLのみ更新しました。期限: **${days}日後**`,ephemeral:true});
      }

      if (n === 'product-remove') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 管理権限がありません。',ephemeral:true});

        const productId=interaction.options.getString('product_id',true);
        const p=(shop.products||[]).find(x=>x.id===productId);
        if(!p)return interaction.reply({content:'❌ 商品IDが見つかりません。',ephemeral:true});
        p.active=false;
        saveStore(store);
        return interaction.reply({content:`🛑 商品 \`${p.id}\`「${p.name}」を販売停止しました。`,ephemeral:true});
      }

      if (n === 'order-list') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 注文一覧を見る権限がありません。',ephemeral:true});

        const orders=Object.values(store.orders)
          .filter(o=>Number(o.shopId)===Number(shop.id) && o.guildId===interaction.guildId)
          .sort((a,b)=>Number(b.id)-Number(a.id))
          .slice(0,30);
        const lines=orders.map(o=>`#${o.id} / <@${o.userId}> / x${o.qty} / ¥${Number(o.total).toLocaleString()} / ${o.status}`);
        return interaction.reply({content:lines.join('\n')||'注文はありません。',ephemeral:true});
      }

      if (n === 'shop-panel') {
        const shop=store.shops[interaction.options.getInteger('shop_id')];
        if(!shop||shop.guildId!==interaction.guildId||shop.active===false)return interaction.reply({content:'❌ 自販機が見つかりません。',ephemeral:true});
        if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 管理権限がありません。',ephemeral:true});
        const panel=buildShopSalesPanel(shop);
        if(!panel)return interaction.reply({content:'❌ 販売可能な商品がありません。',ephemeral:true});
        return interaction.reply(panel);
      }

      if (n === 'verify-panel') {
        const firstRole=interaction.options.getRole('role',true);
        const raw=(interaction.options.getString('additional_roles')||'').trim();
        const extraIds=raw ? raw.split(/[\s,、，]+/).filter(Boolean).map(v=>v.replace(/^<@&([0-9]+)>$/,'$1')) : [];
        const ids=[...new Set([firstRole.id,...extraIds])];
        if(ids.length>20)return interaction.reply({content:'❌ 1パネルにつき最大20ロールまで設定できます。',ephemeral:true});
        if(ids.some(id=>!/^\d{17,22}$/.test(id)))return interaction.reply({content:'❌ 追加ロールにはロールIDまたはロールメンションをカンマ区切りで入力してください。',ephemeral:true});
        const roles=[];
        for(const id of ids){
          const role=await interaction.guild.roles.fetch(id).catch(()=>null);
          if(!role)return interaction.reply({content:`❌ ロールID ${id} が見つかりません。`,ephemeral:true});
          const problem=rolePanelProblem(interaction.guild,role);
          if(problem)return interaction.reply({content:`❌ ${role.name}: ${problem}`,ephemeral:true});
          roles.push(role);
        }
        const g=guildData(store,interaction.guildId);
        const applicationName=interaction.options.getString('name',true).slice(0,80);
        const applicationDescription=(interaction.options.getString('description')||'管理者が内容を確認して承認します。').slice(0,1000);
        const approvalChannel=interaction.options.getChannel('approval_channel',true);
        g.verificationPanels ??= {};
        const panelId=`${Date.now().toString(36)}${Math.random().toString(36).slice(2,7)}`;
        g.verificationPanels[panelId]={name:applicationName,description:applicationDescription,roleIds:roles.map(r=>r.id),approvalChannelId:approvalChannel.id};
        saveStore(store);
        return interaction.reply({
          embeds:[new EmbedBuilder().setTitle(`✅ ${applicationName}`)
            .setDescription(`${applicationDescription}\n\n下の **申請する** ボタンを押してください。`)
            .addFields({name:'承認後のロール',value:roles.map(r=>`<@&${r.id}>`).join('\n').slice(0,1024)},
              {name:'申請通知先',value:`<#${approvalChannel.id}>`})],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(`verifypanel:${panelId}`).setLabel(`${applicationName}を申請`.slice(0,80))
            .setEmoji('✅').setStyle(ButtonStyle.Primary))]
        });
      }

      if (n === 'verify-admin') {
        const pending=Object.values(store.verificationRequests || {})
          .filter(r=>r.guildId===interaction.guildId && r.status==='pending')
          .sort((a,b)=>a.createdAt.localeCompare(b.createdAt));

        if(!pending.length){
          return interaction.reply({
            content:'🔒 **認証管理者ページ**\n現在、承認待ちの認証申請はありません。',
            ephemeral:true
          });
        }

        const shown=pending.slice(0,5);
        const embeds=shown.map(req=>
          new EmbedBuilder()
            .setTitle(`認証申請 #${req.id}`)
            .setDescription(`<@${req.userId}> から認証申請があります。`)
            .addFields(
              {name:'ユーザーID',value:req.userId},
              {name:'承認後のロール',value:(req.roleIds||[req.roleId]).map(id=>`<@&${id}>`).join('\n').slice(0,1024)},
              {name:'申請日時',value:new Date(req.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}
            )
        );

        const components=shown.map(req=>
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`verifyadmin:${req.id}:approve`)
              .setLabel(`#${req.id} 承認`)
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`verifyadmin:${req.id}:reject`)
              .setLabel(`#${req.id} 却下`)
              .setStyle(ButtonStyle.Danger)
          )
        );

        return interaction.reply({
          content:`🔒 **認証管理者ページ**\n承認待ち: **${pending.length}件**${pending.length>5?'（先頭5件を表示）':''}`,
          embeds,
          components,
          ephemeral:true
        });
      }

      if (n === 'verify-settings') {
        const g=guildData(store,interaction.guildId);
        const ch=interaction.options.getChannel('approval_channel',true);
        g.verificationReviewChannelId=ch.id;
        saveStore(store);
        return interaction.reply({
          content:`✅ 認証申請の承認通知先を ${ch} に変更しました。`,
          ephemeral:true
        });
      }

      if (n === 'verify-status') {
        const g=guildData(store,interaction.guildId);
        const roleId=g.verificationRoleId;
        const role=roleId ? await interaction.guild.roles.fetch(roleId).catch(()=>null) : null;
        return interaction.reply({
          content:`🔒 **認証設定**\n認証ロール: ${role?`<@&${role.id}>`:'未設定 / 削除済み'}\n承認通知先: ${g.verificationReviewChannelId?`<#${g.verificationReviewChannelId}>`:'未設定'}\nBOTのロール管理権限: ${interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageRoles)?'✅':'❌'}`,
          ephemeral:true
        });
      }

      if (n === 'join-leave-settings') {
        const g=guildData(store,interaction.guildId);
        const join=interaction.options.getChannel('join');
        const leave=interaction.options.getChannel('leave');

        if(!join && !leave){
          return interaction.reply({
            content:'❌ `join` または `leave` のどちらかを指定してください。',
            ephemeral:true
          });
        }

        if(join) g.joinLogChannelId=join.id;
        if(leave) g.leaveLogChannelId=leave.id;
        saveStore(store);

        return interaction.reply({
          content:`✅ **入退室通知設定を更新しました**\n参加通知: ${g.joinLogChannelId?`<#${g.joinLogChannelId}>`:'未設定'}\n退出通知: ${g.leaveLogChannelId?`<#${g.leaveLogChannelId}>`:'未設定'}\n\n※ Developer Portal の **SERVER MEMBERS INTENT** をONにしてください。`,
          ephemeral:true
        });
      }

      if (n === 'welcome-settings') {
        const g=guildData(store,interaction.guildId);
        const title=interaction.options.getString('title');
        const verification=interaction.options.getChannel('verification_channel');
        if(!title&&!verification)return interaction.reply({content:'❌ `title` または `verification_channel` を指定してください。',ephemeral:true});
        if(title)g.joinTitle=title.slice(0,256);
        if(verification)g.verificationPanelChannelId=verification.id;
        saveStore(store);
        return interaction.reply({content:`✅ 参加案内を更新しました。\nタイトル: **${g.joinTitle}**\n認証パネル: ${g.verificationPanelChannelId?`<#${g.verificationPanelChannelId}>`:'未設定'}`,ephemeral:true});
      }
      if (n === 'welcome-status') {
        const g=guildData(store,interaction.guildId);
        return interaction.reply({content:`👋 **参加案内設定**\nタイトル: **${g.joinTitle||'📥 メンバー参加'}**\n参加通知先: ${g.joinLogChannelId?`<#${g.joinLogChannelId}>`:'未設定'}\n認証パネル: ${g.verificationPanelChannelId?`<#${g.verificationPanelChannelId}>`:'未設定'}`,ephemeral:true});
      }

      if (n === 'join-leave-status') {
        const g=guildData(store,interaction.guildId);
        return interaction.reply({
          content:`🔒 **入退室通知設定**\n参加通知: ${g.joinLogChannelId?`<#${g.joinLogChannelId}>`:'未設定'}\n退出通知: ${g.leaveLogChannelId?`<#${g.leaveLogChannelId}>`:'未設定'}\nSERVER MEMBERS INTENT: Discord Developer Portal側でON必須`,
          ephemeral:true
        });
      }

      if (n === 'role-create') {
        const name=interaction.options.getString('name',true).trim().slice(0,100);
        const permission=interaction.options.getString('permission')||'none';
        const perms={none:0n,member:PermissionFlagsBits.ViewChannel|PermissionFlagsBits.SendMessages|PermissionFlagsBits.ReadMessageHistory,moderator:PermissionFlagsBits.ManageMessages|PermissionFlagsBits.ModerateMembers|PermissionFlagsBits.KickMembers,administrator:PermissionFlagsBits.Administrator};
        pendingRoleCreates.set(`${interaction.guildId}:${interaction.user.id}`,{name,permissions:perms[permission]??0n,mentionable:interaction.options.getBoolean('mentionable')??false,hoist:interaction.options.getBoolean('hoist')??false,at:Date.now()});
        const colors=[['赤','#ED4245'],['橙','#E67E22'],['黄','#F1C40F'],['緑','#57F287'],['青','#3498DB'],['紫','#9B59B6'],['桃','#EB459E'],['水色','#1ABC9C'],['白','#FFFFFF'],['灰','#95A5A6'],['黒','#23272A']];
        const menu=new StringSelectMenuBuilder().setCustomId('rolecolor').setPlaceholder('ロールカラーを選択').addOptions(colors.map(([label,value])=>({label,value,description:value})));
        return interaction.reply({content:`🎨 **${name}** の色を選択してください。`,components:[new ActionRowBuilder().addComponents(menu)],ephemeral:true});
      }
      if (n === 'role-delete') {
        const role=interaction.options.getRole('role',true);
        const problem=rolePanelProblem(interaction.guild,role);
        if(problem)return interaction.reply({content:`❌ ${problem}`,ephemeral:true});
        await role.delete(`管理者 ${interaction.user.tag} が /role-delete を実行`);
        const g=guildData(store,interaction.guildId); for(const cfg of Object.values(g.rolePanels||{}))cfg.roleOptions=(cfg.roleOptions||[]).filter(x=>x.roleId!==role.id); saveStore(store);
        return interaction.reply({content:`✅ ロール **${role.name}** を削除しました。`,ephemeral:true});
      }
      if (n === 'weather-setup') {
        const g=guildData(store,interaction.guildId),area=interaction.options.getString('area',true),ch=interaction.options.getChannel('channel',true),time=interaction.options.getString('time',true);
        const enabled=interaction.options.getBoolean('enabled') ?? true;
        if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return interaction.reply({content:'❌ 時刻は HH:MM 形式です。例: 07:00',ephemeral:true});
        const regions=area==='全国'?PREFECTURES.map(x=>x[0]):expandWeatherRegion(area);
        if(!regions.length)return interaction.reply({content:`❌ 対象地域「${area}」を展開できませんでした。`,ephemeral:true});
        // 一括設定時は旧ルート設定を破棄し、指定チャンネルへ確実に統一する。
        g.weatherRegions=[...new Set(regions)]; g.weatherChannelId=ch.id; g.weatherChannelRoutes={}; g.weatherAutoTime=time; g.weatherAutoEnabled=enabled; g.lastWeatherPostDate=null; g.weatherLastSentByChannel={};
        g.weatherSetupUpdatedAt=new Date().toISOString(); saveStore(store);
        const testNow=interaction.options.getBoolean('test_now') ?? true;
        await interaction.deferReply({ephemeral:true});
        let testResult='テスト配信なし';
        if(testNow){
          try{
            const pages=await buildWeatherPages(regions);
            for(const page of pages)await ch.send(page);
            testResult=`✅ テスト配信成功（${pages.length}メッセージ）`;
          }catch(e){testResult=`❌ テスト配信失敗: ${String(e.message||e).slice(0,300)}`;console.error('weather setup test',e);}
        }
        return interaction.editReply({content:`✅ **天気の自動配信・自動更新をまとめて設定しました。**\n対象: **${area}（${regions.length}都道府県）**\n投稿先: ${ch}\n毎日: **${time} JST**\n自動配信・更新: **${enabled?'ON':'OFF'}**\n${testResult}\n※旧地域別投稿先はリセットし、このチャンネルへ統一しました。`});
      }
      if (n === 'earthquake-setup') {
        const g=guildData(store,interaction.guildId),area=interaction.options.getString('area',true),ch=interaction.options.getChannel('channel',true),min=interaction.options.getInteger('min_intensity')||3;
        const enabled=interaction.options.getBoolean('enabled') ?? true;
        const regions=area==='全国'?[]:expandWeatherRegion(area);
        if(area!=='全国' && !regions.length)return interaction.reply({content:`❌ 対象地域「${area}」を展開できませんでした。`,ephemeral:true});
        g.earthquakeRegions=regions; g.earthquakeChannelId=ch.id; g.minIntensity=min; g.earthquakeAutoEnabled=enabled;
        g.earthquakeSetupUpdatedAt=new Date().toISOString(); saveStore(store);
        const testNow=interaction.options.getBoolean('test_now') ?? true;
        await interaction.deferReply({ephemeral:true});
        let testResult='テスト配信なし';
        if(testNow){
          try{
            const latest=await fetchLatestEarthquake();
            await ch.send(`🧪 **地震速報テスト（現在の最新取得情報）**\n${earthquakeText(latest)}`);
            testResult='✅ テスト配信成功';
          }catch(e){testResult=`❌ テスト配信失敗: ${String(e.message||e).slice(0,300)}`;console.error('earthquake setup test',e);}
        }
        return interaction.editReply({content:`✅ **地震速報の自動配信・自動更新をまとめて設定しました。**\n対象: **${area}${regions.length?`（${regions.length}都道府県）`:''}**\n投稿先: ${ch}\n最低震度: **${min}**\n自動配信・更新: **${enabled?'ON':'OFF'}**\n${testResult}\n※新着地震を継続監視し、同一イベントの重複配信を防止します。`});
      }

      if (n === 'role-panel') {
        const g=guildData(store,interaction.guildId);
        g.rolePanels ??= {};
        const channelId=interaction.channelId;
        const cfg=g.rolePanels[channelId] ??= {title:'チャンネルアクセス権限',description:'',roleOptions:[]};
        const title=(interaction.options.getString('title')||cfg.title||'チャンネルアクセス権限').slice(0,256);
        const description=(interaction.options.getString('description')??cfg.description??'').slice(0,2000);
        cfg.title=title; cfg.description=description;
        saveStore(store);
        const valid=[];
        for(const opt of (cfg.roleOptions||[])){
          const role=await interaction.guild.roles.fetch(opt.roleId).catch(()=>null);
          if(!role||rolePanelProblem(interaction.guild,role))continue;
          valid.push({roleId:role.id,label:(opt.label||role.name).slice(0,80),roleName:role.name,mode:opt.mode||'instant'});
        }
        if(!valid.length)return interaction.reply({content:'❌ このチャンネルにはロールがありません。先に `/role-add` をこのチャンネルで実行してください。',ephemeral:true});
        const page=0;
        const msg=await interaction.reply({...buildChannelRolePanel(channelId,cfg,valid,page),fetchReply:true});
        cfg.panelMessageId=msg.id;saveStore(store);return;
      }

      if (n === 'role-add') {
        const g=guildData(store,interaction.guildId); g.rolePanels ??= {};
        const target=interaction.options.getChannel('channel')||interaction.channel;
        const cfg=g.rolePanels[target.id] ??= {title:'チャンネルアクセス権限',description:'',roleOptions:[]};
        const roles=['role','role2','role3','role4','role5'].map(n=>interaction.options.getRole(n)).filter(Boolean);
        const mode=interaction.options.getString('mode')||'instant';
        const approvalChannel=interaction.options.getChannel('approval_channel');
        const reviewId=approvalChannel?.id||g.verificationReviewChannelId;
        if(mode==='approval'&&!reviewId)return interaction.reply({content:'❌ 承認制ロールには approval_channel を指定するか /verify-settings で通知先を設定してください。',ephemeral:true});
        const added=[];
        for(let i=0;i<roles.length;i++){
          const role=roles[i],problem=rolePanelProblem(interaction.guild,role);
          if(problem)return interaction.reply({content:`❌ ${role.name}: ${problem}`,ephemeral:true});
          const custom=i===0?interaction.options.getString('label'):null;
          const label=(custom||role.name).slice(0,80);
          cfg.roleOptions=(cfg.roleOptions||[]).filter(x=>x.roleId!==role.id);
          cfg.roleOptions.push({roleId:role.id,label,mode,approvalChannelId:mode==='approval'?reviewId:null});
          added.push(`${label} → ${role}`);
        }
        const valid=[];
        for(const opt of cfg.roleOptions){
          const role=await interaction.guild.roles.fetch(opt.roleId).catch(()=>null);
          if(role&&!rolePanelProblem(interaction.guild,role))valid.push({roleId:role.id,label:(opt.label||role.name).slice(0,80),roleName:role.name,mode:opt.mode||'instant'});
        }
        // /role-panel を別途実行しなくても、追加時にパネルを自動作成・更新する。
        let panelMessage=null;
        if(cfg.panelMessageId)panelMessage=await target.messages.fetch(cfg.panelMessageId).catch(()=>null);
        const payload=buildChannelRolePanel(target.id,cfg,valid,0);
        if(panelMessage)await panelMessage.edit(payload);
        else { panelMessage=await target.send(payload); cfg.panelMessageId=panelMessage.id; }
        saveStore(store);
        return interaction.reply({content:`✅ <#${target.id}> に **${roles.length}個**のロールを追加し、ロールボタンを自動更新しました。\n${added.join('\n')}`,ephemeral:true});
      }

      if (n === 'role-list') {
        const g=guildData(store,interaction.guildId); g.rolePanels ??= {};
        const target=interaction.options.getChannel('channel')||interaction.channel;
        const cfg=g.rolePanels[target.id]||{roleOptions:[]};
        const lines=(cfg.roleOptions||[]).map((x,i)=>`${i+1}. **${x.label}** → <@&${x.roleId}>（${x.mode==='approval'?'承認制':'即時付与'}）`);
        return interaction.reply({content:`🎭 <#${target.id}> のロール設定\n${lines.join('\n')||'保存済みロールはありません。'}`,ephemeral:true});
      }

      if (n === 'role-remove') {
        const g=guildData(store,interaction.guildId); g.rolePanels ??= {};
        const target=interaction.options.getChannel('channel')||interaction.channel;
        const cfg=g.rolePanels[target.id] ??= {title:'チャンネルアクセス権限',description:'',roleOptions:[]};
        const role=interaction.options.getRole('role',true);
        const before=(cfg.roleOptions||[]).length;
        cfg.roleOptions=(cfg.roleOptions||[]).filter(x=>x.roleId!==role.id);
        saveStore(store);
        return interaction.reply({content:before!==cfg.roleOptions.length?`✅ <#${target.id}> から ${role} を削除しました。`:'❌ このチャンネルには登録されていません。',ephemeral:true});
      }

      if (n === 'ticket-panel') {
        return interaction.reply({
          embeds:[new EmbedBuilder().setTitle('🎫 サポートチケット').setDescription('ボタンを押してチケットを作成してください。')],
          components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket:create').setLabel('チケット作成').setStyle(ButtonStyle.Primary)
          )]
        });
      }

      if (n === 'ticket-settings') {
        const g=guildData(store,interaction.guildId);
        const category=interaction.options.getChannel('category');
        const support=interaction.options.getRole('support_role');
        const logChannel=interaction.options.getChannel('log_channel');
        if(!category&&!support&&!logChannel)return interaction.reply({content:'❌ カテゴリ・サポートロール・ログチャンネルのいずれかを指定してください。',ephemeral:true});
        if(category)g.ticketCategoryId=category.id;
        if(support)g.ticketSupportRoleId=support.id;
        if(logChannel){
          const me=interaction.guild.members.me || await interaction.guild.members.fetchMe();
          const permissions=logChannel.permissionsFor(me);
          if(!permissions?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])){
            return interaction.reply({content:'❌ ログチャンネルでBOTに「チャンネルを見る」「メッセージを送信」「埋め込みリンク」の権限を付与してください。設定は保存していません。',ephemeral:true});
          }
          g.ticketLogChannelId=logChannel.id;
        }
        saveStore(store);
        return interaction.reply({
          content:`✅ チケット設定を保存しました。\nカテゴリ: ${g.ticketCategoryId?`<#${g.ticketCategoryId}>`:'未設定'}\nサポートロール: ${g.ticketSupportRoleId?`<@&${g.ticketSupportRoleId}>`:'未設定'}\n作成ログ: ${g.ticketLogChannelId?`<#${g.ticketLogChannelId}>`:'未設定'}`,
          ephemeral:true
        });
      }

      if (n === 'ticket-log-channel') {
        const g=guildData(store,interaction.guildId);
        const channel=interaction.options.getChannel('channel');
        const disable=interaction.options.getBoolean('disable') ?? false;
        if(disable && channel)return interaction.reply({content:'❌ channel と disable:true は同時に指定できません。',ephemeral:true});
        if(disable){
          g.ticketLogChannelId=null;
          saveStore(store);
          return interaction.reply({content:'✅ チケット作成ログの自動投稿を停止しました。',ephemeral:true});
        }
        if(channel){
          const me=interaction.guild.members.me || await interaction.guild.members.fetchMe();
          const permissions=channel.permissionsFor(me);
          if(!permissions?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.EmbedLinks])){
            return interaction.reply({content:'❌ BOTに「チャンネルを見る」「メッセージを送信」「埋め込みリンク」の権限が必要です。投稿先は変更していません。',ephemeral:true});
          }
          g.ticketLogChannelId=channel.id;
          saveStore(store);
          return interaction.reply({content:`✅ チケット作成ログの投稿先を ${channel} に変更しました。次のチケット作成から適用されます。`,ephemeral:true});
        }
        return interaction.reply({content:`🎫 チケット作成ログの投稿先: ${g.ticketLogChannelId?`<#${g.ticketLogChannelId}>`:'未設定（停止中）'}`,ephemeral:true});
      }

      if (n === 'ticket-status') {
        const g=guildData(store,interaction.guildId);
        return interaction.reply({
          content:`🔒 **チケット設定**\nカテゴリ: ${g.ticketCategoryId?`<#${g.ticketCategoryId}>`:'未設定'}\nサポートロール: ${g.ticketSupportRoleId?`<@&${g.ticketSupportRoleId}>`:'未設定'}\n作成ログ: ${g.ticketLogChannelId?`<#${g.ticketLogChannelId}>`:'未設定'}\nオープン: ${Object.values(store.tickets||{}).filter(t=>t.guildId===interaction.guildId&&t.status==='open').length}件`,
          ephemeral:true
        });
      }

      if (n === 'autoreply-add') {
        const g=guildData(store,interaction.guildId);
        const keyword=interaction.options.getString('keyword',true);
        const reply=interaction.options.getString('reply',true);
        const mode=interaction.options.getString('mode') || 'contains';
        g.autoReplies[keyword]={reply,mode};
        saveStore(store);
        return interaction.reply({content:`✅ 自動返信を追加しました。（${mode==='exact'?'完全一致':'部分一致'}）`,ephemeral:true});
      }

      if (n === 'autoreply-remove') {
        const g=guildData(store,interaction.guildId);
        delete g.autoReplies[interaction.options.getString('keyword',true)];
        saveStore(store);
        return interaction.reply({content:'✅ 自動返信を削除しました。',ephemeral:true});
      }

      if (n === 'autoreply-list') {
        const g=guildData(store,interaction.guildId);
        const lines=Object.entries(g.autoReplies||{}).map(([k,v])=>{
          const data=typeof v==='string'?{reply:v,mode:'contains'}:v;
          return `• **${k}** [${data.mode==='exact'?'完全':'部分'}] → ${data.reply}`;
        });
        return interaction.reply({content:lines.join('\n')||'自動返信はありません。',ephemeral:true});
      }

      if (n === 'guild-settings') {
        const g=guildData(store,interaction.guildId);
        const j=interaction.options.getChannel('join_log');
        const l=interaction.options.getChannel('leave_log');
        const e=interaction.options.getChannel('earthquake');
        const w=interaction.options.getChannel('weather');
        if(j)g.joinLogChannelId=j.id;
        if(l)g.leaveLogChannelId=l.id;
        if(e)g.earthquakeChannelId=e.id;
        if(w)g.weatherChannelId=w.id;
        saveStore(store);
        return interaction.reply({content:'✅ サーバー設定を保存しました。',ephemeral:true});
      }

      if (n === 'guild-status') {
        const g=guildData(store,interaction.guildId);
        return interaction.reply({
          content:`🔒 **サーバー設定**\n参加通知: ${g.joinLogChannelId?`<#${g.joinLogChannelId}>`:'未設定'}\n退出通知: ${g.leaveLogChannelId?`<#${g.leaveLogChannelId}>`:'未設定'}\n天気通知: ${g.weatherChannelId?`<#${g.weatherChannelId}>`:'未設定'}\n地震通知: ${g.earthquakeChannelId?`<#${g.earthquakeChannelId}>`:'未設定'}\n認証ロール: ${g.verificationRoleId?`<@&${g.verificationRoleId}>`:'未設定'}\n認証承認通知先: ${g.verificationReviewChannelId?`<#${g.verificationReviewChannelId}>`:'未設定'}\nチケットカテゴリ: ${g.ticketCategoryId?`<#${g.ticketCategoryId}>`:'未設定'}\nサポートロール: ${g.ticketSupportRoleId?`<@&${g.ticketSupportRoleId}>`:'未設定'}`,
          ephemeral:true
        });
      }

      if (n === 'setting') {
        const g=guildData(store,interaction.guildId);
        const key=interaction.options.getString('key',true);
        const value=interaction.options.getString('value',true).trim();
        const map={
          verification_role_id:'verificationRoleId',
          welcome_channel_id:'joinLogChannelId',
          leave_channel_id:'leaveLogChannelId',
          ticket_category_id:'ticketCategoryId',
          ticket_support_role_id:'ticketSupportRoleId',
          earthquake_channel_id:'earthquakeChannelId',
          weather_channel_id:'weatherChannelId'
        };
        g[map[key]]=value;
        saveStore(store);
        return interaction.reply({content:'✅ 旧版互換設定を保存しました。',ephemeral:true});
      }

      if (n === 'media-add') {
        const g=guildData(store,interaction.guildId), url=interaction.options.getString('url',true);
        if(!validHttpUrl(url))return interaction.reply({content:'❌ http/https URLを指定してください。',ephemeral:true});
        const item={id:g.nextMediaId++,name:interaction.options.getString('name',true).slice(0,100),url,tags:(interaction.options.getString('tags')||'').split(/[\s,、]+/).filter(Boolean).slice(0,30),type:interaction.options.getString('type')||'image',addedBy:interaction.user.id,createdAt:new Date().toISOString()};
        g.mediaLibrary.push(item); saveStore(store);
        return interaction.reply({content:`✅ メディア #${item.id} **${item.name}** を登録しました。`,ephemeral:true});
      }
      if (n === 'media-search') {
        const g=guildData(store,interaction.guildId), q=interaction.options.getString('keyword',true).toLowerCase();
        const found=(g.mediaLibrary||[]).filter(x=>`${x.name} ${(x.tags||[]).join(' ')}`.toLowerCase().includes(q)).slice(0,10);
        if(!found.length)return interaction.reply({content:'🔎 該当する画像・動画はありません。',ephemeral:true});
        return interaction.reply({content:found.map(x=>`**#${x.id} ${x.type==='video'?'🎬':'🖼️'} ${x.name}**\n${x.url}\nタグ: ${(x.tags||[]).join(', ')||'なし'}`).join('\n\n')});
      }
      if (n === 'media-remove') {
        const g=guildData(store,interaction.guildId), id=interaction.options.getInteger('id',true), before=g.mediaLibrary.length;
        g.mediaLibrary=g.mediaLibrary.filter(x=>x.id!==id); saveStore(store);
        return interaction.reply({content:before===g.mediaLibrary.length?'❌ メディアIDが見つかりません。':`✅ メディア #${id} を削除しました。`,ephemeral:true});
      }
      if (n === 'rsshub-status') {
        const base=SOCIAL_RSS_BRIDGES[0];
        try {
          const url=new URL(base);
          if(!['http:','https:'].includes(url.protocol))throw new Error('URL形式が不正です');
          const response=await fetch(url,{signal:AbortSignal.timeout(8000)});
          return interaction.reply({content:`📡 RSSHub: ${response.ok?'接続成功':'応答あり（HTTP '+response.status+'）'}\n接続先: ${url.origin}\n※ Xのフィード取得可否は /latest-add で個別に確認してください。`,ephemeral:true});
        }catch(e){return interaction.reply({content:`❌ RSSHub接続失敗: ${String(e.message||e).slice(0,300)}\n.env の SOCIAL_RSS_BRIDGE_URL と Docker起動状態を確認してください。`,ephemeral:true});}
      }
      // Xプロフィールを複数登録・管理。既存のSNS監視と同じ保存領域を利用。
      if (n === 'x-add') {
        const g=guildData(store,interaction.guildId);
        const input=interaction.options.getString('url',true).trim();
        const channel=interaction.options.getChannel('channel',true);
        const platform=detectSocialPlatform(input);
        const username=socialUsername('twitter',input);
        if(platform!=='twitter'||!username||!/^\w{1,15}$/.test(username))return interaction.reply({content:'❌ XのプロフィールURL（https://x.com/ユーザー名）を指定してください。',ephemeral:true});
        if(!channel?.isTextBased())return interaction.reply({content:'❌ テキストチャンネルを指定してください。',ephemeral:true});
        await interaction.deferReply({ephemeral:true});
        try{
          const resolved=await resolveSocialFeedAuto('twitter',input);
          const feed=platform==='twitter'?await fetchFxTwitterTimeline(socialUsername('twitter',input)):await rssParser.parseURL(resolved.feedUrl);
          g.socialSources??=[];g.socialSeen??={};
          const existing=g.socialSources.find(x=>x.platform==='twitter'&&socialUsername('twitter',x.profileUrl)?.toLowerCase()===username.toLowerCase()&&x.channelId===channel.id);
          if(existing)return interaction.editReply(`ℹ️ 同じアカウントと投稿先は登録済みです（#${existing.id}）。`);
          const id=g.nextSocialSourceId++;
          g.socialSources.push({id,name:`X @${username}`,platform:'twitter',profileUrl:input,feedUrl:resolved.feedUrl,channelId:channel.id,method:resolved.method,enabled:true,createdAt:new Date().toISOString(),lastError:null});
          g.socialSeen[id]=(feed.items||[]).slice(0,50).map(newsItemKey);saveStore(store);
          return interaction.editReply(`✅ X @${username} を登録しました（ID: ${id}）。\n投稿先: ${channel}\n取得方式: ${resolved.method}\n登録前の投稿は通知せず、次の新着から通知します。`);
        }catch(e){console.error('x-add',e);return interaction.editReply(`❌ FxTwitterからXの最新投稿を取得できませんでした。Xアカウント名・FxTwitter APIの応答を確認してください。\n${String(e.message||e).slice(0,500)}`);}
      }
      if(n==='x-list'){
        const g=guildData(store,interaction.guildId),sources=(g.socialSources||[]).filter(x=>x.platform==='twitter');
        const pages=splitDiscordBlocks(`📡 **X監視一覧（${sources.length}件）**`,sources.map(x=>`#${x.id} ${x.profileUrl} → <#${x.channelId}>${x.lastError?' ⚠️ '+x.lastError:''}`),1900);
        await interaction.reply({content:pages[0],ephemeral:true});
        for(const page of pages.slice(1))await interaction.followUp({content:page,ephemeral:true});
        return;
      }
      if(n==='x-edit'||n==='x-remove'||n==='x-test'){
        const g=guildData(store,interaction.guildId),id=interaction.options.getInteger('id',true);
        const source=(g.socialSources||[]).find(x=>x.id===id&&x.platform==='twitter');
        if(!source)return interaction.reply({content:'❌ 指定したX登録IDが見つかりません。',ephemeral:true});
        if(n==='x-remove'){
          g.socialSources=g.socialSources.filter(x=>x!==source);delete g.socialSeen[id];saveStore(store);
          return interaction.reply({content:`✅ X監視 #${id} を削除しました。`,ephemeral:true});
        }
        if(n==='x-edit'){
          const channel=interaction.options.getChannel('channel',true);
          if(!channel?.isTextBased())return interaction.reply({content:'❌ テキストチャンネルを指定してください。',ephemeral:true});
          source.channelId=channel.id;saveStore(store);
          return interaction.reply({content:`✅ X監視 #${id} の投稿先を ${channel} に変更しました。`,ephemeral:true});
        }
        await interaction.deferReply({ephemeral:true});
        try{
          const feed=await fetchSocialSource(source),item=feed.items?.[0];
          if(!item)return interaction.editReply('❌ 最新投稿が取得できませんでした。');
          const ch=await interaction.guild.channels.fetch(source.channelId).catch(()=>null);
          if(!ch?.isTextBased())return interaction.editReply('❌ 投稿先が見つかりません。');
          await ch.send({content:'📡 **X / 最新投稿テスト**',embeds:[newsEmbed({name:source.name||'X'},item)]});
          return interaction.editReply(`✅ ${ch} にテスト投稿しました。`);
        }catch(e){console.error('x-test',e);return interaction.editReply(`❌ テスト失敗: ${String(e.message||e).slice(0,400)}`);}
      }
      if (n === 'latest-add') {
        const g=guildData(store,interaction.guildId), input=interaction.options.getString('url',true), channel=interaction.options.getChannel('channel',true);
        let resolved,name='最新情報';
        const platform=detectSocialPlatform(input);
        try{
          if(platform){ resolved=await resolveSocialFeedAuto(platform,input); name=`${platform} ${socialUsername(platform,input)||''}`.trim(); }
          else { await rssParser.parseURL(input); resolved={feedUrl:input,method:'RSS/Atom'}; name=new URL(input).hostname; }
        }catch(e){return interaction.reply({content:`❌ URLから取得方式を判定できませんでした。\n${String(e.message||e).slice(0,800)}`,ephemeral:true});}
        const id=g.nextSocialSourceId++;
        const initialFeed=platform==='twitter'?await fetchFxTwitterTimeline(socialUsername('twitter',input)):await rssParser.parseURL(resolved.feedUrl);
        g.socialSources.push({id,name,platform:platform||'rss',profileUrl:input,feedUrl:resolved.feedUrl,channelId:channel.id,method:resolved.method,active:true});
        g.socialSeen??={};g.socialSeen[id]=(initialFeed.items||[]).slice(0,50).map(newsItemKey);saveStore(store);
        return interaction.reply({content:`✅ 最新情報 #${id} を登録しました。\n取得方式: **${resolved.method}**\n投稿先: ${channel}`,ephemeral:true});
      }

      if (n === 'social-source-add') {
        const g=guildData(store,interaction.guildId);
        const profileUrl=interaction.options.getString('profile_url',true).trim();
        const channelUrl=interaction.options.getString('channel_url',true).trim();
        if(!validNewsUrl(profileUrl))return interaction.reply({content:'❌ プロフィールURLが正しくありません。',ephemeral:true});
        const platform=detectSocialPlatform(profileUrl);
        if(!platform)return interaction.reply({content:'❌ 対応URLではありません。X / Twitter・YouTube・Instagram のプロフィールURLを貼ってください。',ephemeral:true});
        const parsed=parseDiscordChannelUrl(channelUrl,interaction.guildId);
        if(!parsed)return interaction.reply({content:'❌ DiscordチャンネルURLが正しくないか、このサーバーのURLではありません。',ephemeral:true});
        const ch=interaction.guild.channels.cache.get(parsed.channelId)||await interaction.guild.channels.fetch(parsed.channelId).catch(()=>null);
        if(!ch?.isTextBased())return interaction.reply({content:'❌ 指定したDiscordチャンネルへ投稿できません。',ephemeral:true});
        await interaction.deferReply({ephemeral:true});
        try{
          const resolved=await resolveSocialFeedAuto(platform,profileUrl);
          const feed=platform==='twitter'?await fetchFxTwitterTimeline(socialUsername('twitter',profileUrl)):await rssParser.parseURL(resolved.feedUrl);
          const id=g.nextSocialSourceId++;
          const source={id,platform,profileUrl,feedUrl:resolved.feedUrl,method:resolved.method,channelId:parsed.channelId,enabled:true,createdAt:new Date().toISOString(),lastError:null};
          g.socialSources.push(source);
          g.socialSeen[id]=(feed.items||[]).slice(0,50).map(newsItemKey);
          saveStore(store);
          const label=platform==='twitter'?'X / Twitter':platform==='youtube'?'YouTube':'Instagram';
          return interaction.editReply(`✅ **${label}** と自動判定しました。\n取得方式: **${resolved.method}**\n投稿先: <#${parsed.channelId}>\n現在の投稿は既読登録し、次の最新情報から自動更新します。`);
        }catch(e){
          console.error('social auto detect',e);
          return interaction.editReply(`❌ SNSは判定できましたが、現在利用可能な最新情報取得経路を確立できませんでした。\n${e.message}`);
        }
      }

      if (n === 'social-source-remove') {
        const g=guildData(store,interaction.guildId),id=interaction.options.getInteger('id',true);
        const src=g.socialSources.find(x=>x.id===id);
        if(!src)return interaction.reply({content:'❌ SNSソースIDが見つかりません。',ephemeral:true});
        g.socialSources=g.socialSources.filter(x=>x.id!==id);delete g.socialSeen[id];saveStore(store);
        return interaction.reply({content:`✅ SNSソース #${id} を削除しました。`,ephemeral:true});
      }
      if (n === 'social-list') {
        const g=guildData(store,interaction.guildId);
        const lines=g.socialSources.map(s=>`**#${s.id} ${s.platform}** ${s.enabled===false?'⏸️':'✅'}\n${s.profileUrl}\n取得: ${s.method||'自動'}\n投稿先: <#${s.channelId}>${s.lastError?`\n⚠️ ${s.lastError}`:''}`);
        const pages=splitDiscordBlocks(`📡 **SNS最新情報**\n登録: **${g.socialSources.length}件**`,lines,1900);
        await interaction.reply({content:pages[0],ephemeral:true});
        for(const p of pages.slice(1))await interaction.followUp({content:p,ephemeral:true});
        return;
      }
      if (n === 'social-test') {
        const g=guildData(store,interaction.guildId),id=interaction.options.getInteger('id',true),source=g.socialSources.find(x=>x.id===id);
        if(!source)return interaction.reply({content:'❌ SNSソースIDが見つかりません。',ephemeral:true});
        await interaction.deferReply({ephemeral:true});
        try{
          const feed=await fetchSocialSource(source),item=feed.items?.[0];
          if(!item)return interaction.editReply('❌ 投稿を取得できません。');
          const ch=interaction.guild.channels.cache.get(source.channelId)||await interaction.guild.channels.fetch(source.channelId).catch(()=>null);
          if(!ch?.isTextBased())return interaction.editReply('❌ 投稿先チャンネルを取得できません。');
          await ch.send({content:`📡 **${source.platform} / 最新情報テスト**`,embeds:[newsEmbed({name:source.platform},item)]});
          return interaction.editReply(`✅ <#${source.channelId}> にテスト投稿しました。`);
        }catch(e){console.error(e);return interaction.editReply('❌ SNS最新情報の取得に失敗しました。');}
      }

      if (n === 'news-source-add') {
        const g=guildData(store,interaction.guildId);
        const name=interaction.options.getString('name',true).trim();
        const feedUrl=interaction.options.getString('feed_url',true).trim();
        const channelUrl=interaction.options.getString('channel_url',true).trim();
        if(!validNewsUrl(feedUrl))return interaction.reply({content:'❌ RSS/Atom URLが正しくありません。',ephemeral:true});
        const parsed=parseDiscordChannelUrl(channelUrl,interaction.guildId);
        if(!parsed)return interaction.reply({content:'❌ DiscordチャンネルURLが正しくないか、このサーバーのチャンネルではありません。',ephemeral:true});
        const ch=interaction.guild.channels.cache.get(parsed.channelId)||await interaction.guild.channels.fetch(parsed.channelId).catch(()=>null);
        if(!ch?.isTextBased())return interaction.reply({content:'❌ 指定チャンネルへ投稿できません。',ephemeral:true});
        await interaction.deferReply({ephemeral:true});
        let feed;
        try{feed=await fetchNewsFeed({feedUrl});}catch(e){console.error(e);return interaction.editReply('❌ フィードを取得できません。通常の記事URLではなくRSS/Atom URLを指定してください。');}
        const id=g.nextNewsSourceId++;
        const source={id,name:name.slice(0,80),feedUrl,channelId:parsed.channelId,createdAt:new Date().toISOString()};
        g.newsSources.push(source); g.newsSeen[id]=(feed.items||[]).slice(0,50).map(newsItemKey); saveStore(store);
        return interaction.editReply(`✅ NEWSソース #${id} **${source.name}** を登録しました。\n投稿先: <#${source.channelId}>\n次の新着から通知します。`);
      }
      if (n === 'news-source-remove') {
        const g=guildData(store,interaction.guildId),id=interaction.options.getInteger('id',true),source=g.newsSources.find(x=>x.id===id);
        if(!source)return interaction.reply({content:'❌ NEWSソースIDが見つかりません。',ephemeral:true});
        g.newsSources=g.newsSources.filter(x=>x.id!==id);delete g.newsSeen[id];saveStore(store);
        return interaction.reply({content:`✅ #${id} ${source.name} を削除しました。`,ephemeral:true});
      }
      if (n === 'news-list') {
        const g=guildData(store,interaction.guildId),lines=g.newsSources.map(s=>`**#${s.id} ${s.name}**\n投稿先: <#${s.channelId}>\nRSS: ${s.feedUrl}`);
        const pages=splitDiscordBlocks(`📰 **NEWS ALERTS**\n自動通知: **${g.newsAutoEnabled?'ON':'OFF'}**\n登録: **${g.newsSources.length}件**`,lines,1900);
        await interaction.reply({content:pages[0],ephemeral:true});for(const p of pages.slice(1))await interaction.followUp({content:p,ephemeral:true});return;
      }
      if (n === 'news-auto') {
        const g=guildData(store,interaction.guildId),enabled=interaction.options.getBoolean('enabled',true);
        if(enabled&&!g.newsSources.length)return interaction.reply({content:'❌ 先にNEWSソースを登録してください。',ephemeral:true});
        g.newsAutoEnabled=enabled;saveStore(store);return interaction.reply({content:`📰 NEWS自動通知: **${enabled?'ON':'OFF'}**`,ephemeral:true});
      }
      if (n === 'news-test') {
        const g=guildData(store,interaction.guildId),id=interaction.options.getInteger('id',true),source=g.newsSources.find(x=>x.id===id);
        if(!source)return interaction.reply({content:'❌ NEWSソースIDが見つかりません。',ephemeral:true});
        await interaction.deferReply({ephemeral:true});
        try{
          const feed=await fetchNewsFeed(source),item=feed.items?.[0];if(!item)return interaction.editReply('❌ 記事がありません。');
          const ch=interaction.guild.channels.cache.get(source.channelId)||await interaction.guild.channels.fetch(source.channelId).catch(()=>null);
          if(!ch?.isTextBased())return interaction.editReply('❌ 投稿先を取得できません。');
          await ch.send({content:`📰 **${source.name} / テスト通知**`,embeds:[newsEmbed(source,item)]});
          return interaction.editReply(`✅ <#${source.channelId}> に送信しました。`);
        }catch(e){console.error(e);return interaction.editReply('❌ NEWS取得または投稿に失敗しました。');}
      }

      if (n === 'weather') {
        const g=guildData(store,interaction.guildId);
        const selected=interaction.options.getString('region');

        let regions;
        if(selected){
          const expanded=expandWeatherRegion(selected);
          regions=expanded.length ? expanded : [selected];
        } else {
          regions=[...(g.weatherRegions || [])];
        }

        if(!regions.length){
          return interaction.reply({
            content:'ℹ️ このサーバーでは天気地域がまだ登録されていません。サーバー管理者が `/weather-register` で登録してください。',
            ephemeral:true
          });
        }

        await interaction.deferReply();
        const pages=await buildWeatherPages(regions);
        return replyWeatherPages(interaction,pages);
      }

      if (n === 'weather-register') {
        const g=guildData(store,interaction.guildId);
        const action=interaction.options.getString('action',true);
        const selected=interaction.options.getString('region');

        if(action==='clear'){
          g.weatherRegions=[];
          g.weatherChannelRoutes={};
          g.lastWeatherPostDate=null;
          saveStore(store);
          return interaction.reply({content:'✅ 天気地域をすべて削除しました。',ephemeral:true});
        }

        if(!selected){
          return interaction.reply({content:'❌ 追加または削除する地域を指定してください。',ephemeral:true});
        }

        const expanded=expandWeatherRegion(selected);
        if(!expanded.length){
          return interaction.reply({content:'❌ 地域が見つかりません。都道府県名・地方名・全国47都道府県から選択してください。',ephemeral:true});
        }

        if(action==='add'){
          g.weatherRegions=[...new Set([...(g.weatherRegions || []),...expanded])];
          g.lastWeatherPostDate=null;
          saveStore(store);
          return interaction.reply({
            content:`✅ **${selected}** を追加しました。${expanded.length > 1 ? `（${expanded.length}都道府県）` : ''}\n現在の登録数: **${g.weatherRegions.length}都道府県**`,
            ephemeral:true
          });
        }

        if(action==='remove'){
          const removeSet=new Set(expanded);
          g.weatherRegions=(g.weatherRegions || []).filter(x=>!removeSet.has(x));
          g.weatherChannelRoutes ??= {};
          for(const pref of expanded)delete g.weatherChannelRoutes[pref];
          g.lastWeatherPostDate=null;
          saveStore(store);
          return interaction.reply({
            content:`✅ **${selected}** を削除しました。\n現在の登録数: **${g.weatherRegions.length}都道府県**`,
            ephemeral:true
          });
        }
      }

      if (n === 'weather-list') {
        const g=guildData(store,interaction.guildId);
        const registered=new Set(g.weatherRegions||[]);
        const allRegistered=[...registered].filter(p=>PREFECTURES.some(([name])=>name===p));
        g.weatherChannelRoutes ??= {};
        const areaLines=[];

        for(const [areaName,prefs] of Object.entries(WEATHER_AREAS)){
          const inArea=prefs.filter(p=>registered.has(p));
          if(!inArea.length)continue;
          const details=inArea.map(pref=>{
            const channelId=g.weatherChannelRoutes[pref] || g.weatherChannelId;
            return `${pref} → ${channelId?`<#${channelId}>`:'⚠️ 未設定'}`;
          });
          areaLines.push(`**${areaName} (${inArea.length}/${prefs.length})**\n${details.join('\n')}`);
        }

        const header=`🔒 **登録済み天気地域・投稿先**\n`
          + `合計: **${allRegistered.length}/47都道府県**\n`
          + `自動投稿: **${g.weatherAutoEnabled?'ON':'OFF'}**\n`
          + `投稿時刻: **${g.weatherAutoTime||'07:00'}**（日本時間）\n`
          + `共通投稿先: ${g.weatherChannelId?`<#${g.weatherChannelId}>`:'⚠️ 未設定'}`
          + (!allRegistered.length?`\n\n⚠️ 地域が未登録です。`:'');
        const pages=splitDiscordBlocks(header,areaLines,1900);
        await interaction.reply({content:pages[0],ephemeral:true});
        for(const page of pages.slice(1))await interaction.followUp({content:page,ephemeral:true});
        return;
      }

      if (n === 'weather-channel') {
        const g=guildData(store,interaction.guildId);
        const selected=interaction.options.getString('region',true);
        const channel=interaction.options.getChannel('channel',true);
        const expanded=expandWeatherRegion(selected);
        if(!expanded.length){
          return interaction.reply({content:'❌ 地域が見つかりません。',ephemeral:true});
        }

        g.weatherChannelRoutes ??= {};
        g.weatherRegions ??= [];
        for(const pref of expanded){
          g.weatherChannelRoutes[pref]=channel.id;
          if(!g.weatherRegions.includes(pref))g.weatherRegions.push(pref);
        }
        saveStore(store);

        return interaction.reply({
          content:`✅ **${selected}** の天気投稿先を ${channel} に設定しました。\n`
            + `${expanded.length>1?`対象 ${expanded.length}都道府県: `:''}${expanded.join('、')}`,
          ephemeral:true
        });
      }

      if (n === 'weather-channel-remove') {
        const g=guildData(store,interaction.guildId);
        const selected=interaction.options.getString('region',true);
        const expanded=expandWeatherRegion(selected);
        if(!expanded.length){
          return interaction.reply({content:'❌ 地域が見つかりません。',ephemeral:true});
        }
        g.weatherChannelRoutes ??= {};
        for(const pref of expanded)delete g.weatherChannelRoutes[pref];
        saveStore(store);
        return interaction.reply({
          content:`✅ **${selected}** の個別投稿先設定を解除しました。\n`
            + `以後はサーバー共通投稿先 ${g.weatherChannelId?`<#${g.weatherChannelId}>`:'（未設定）'} を使用します。`,
          ephemeral:true
        });
      }

      if (n === 'weather-admin') {
        const g=guildData(store,interaction.guildId);
        const registered=new Set(g.weatherRegions||[]);
        const areaLines=[];
        for(const [areaName,prefs] of Object.entries(WEATHER_AREAS)){
          const inArea=prefs.filter(p=>registered.has(p));
          const missing=prefs.filter(p=>!registered.has(p));
          const routeDetails=inArea.map(pref=>{
            const channelId=(g.weatherChannelRoutes||{})[pref] || g.weatherChannelId;
            return `${pref} → ${channelId?`<#${channelId}>`:'⚠️ 投稿先未設定'}`;
          });
          areaLines.push(`**${areaName}　${inArea.length} / ${prefs.length}県**\n${routeDetails.length?routeDetails.join('\n'):'登録済み: なし'}${missing.length&&inArea.length?`\n未登録: ${missing.join('、')}`:''}`);
        }
        const allRegistered=[...registered].filter(p=>PREFECTURES.some(([name])=>name===p));
        const header=`🔒 **天気地域 管理者ページ**\n自動投稿: ${g.weatherAutoEnabled?'ON':'OFF'}\n投稿時刻: ${g.weatherAutoTime||'07:00'}（日本時間）\n共通投稿先: ${g.weatherChannelId?`<#${g.weatherChannelId}>`:'未設定'}\n合計登録: **${allRegistered.length} / 47都道府県**`;
        const pages=splitDiscordBlocks(header,areaLines,1900);
        await interaction.reply({content:pages[0],ephemeral:true});
        for(const page of pages.slice(1)) await interaction.followUp({content:page,ephemeral:true});
        return;
      }

      if (n === 'weather-auto-add') {
        const g=guildData(store,interaction.guildId);
        const region=interaction.options.getString('region',true).trim();
        const regions=expandWeatherRegion(region);
        if(!regions.length)return interaction.reply({content:'❌ 地域名が正しくありません。',ephemeral:true});
        const time=interaction.options.getString('time',true).trim();
        if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))return interaction.reply({content:'❌ 時刻は HH:MM で指定してください。',ephemeral:true});
        g.weatherJobs??=[];
        const id=Math.max(0,...g.weatherJobs.map(x=>x.id))+1;
        const channelId=interaction.options.getChannel('channel',true).id;
        g.weatherJobs.push({id,regions,channelId,time,lastSent:null});saveStore(store);
        return interaction.reply({content:`✅ 天気設定 #${id} を追加: ${region} / <#${channelId}> / ${time} JST`,ephemeral:true});
      }
      if(n==='weather-auto-list'){
        const jobs=guildData(store,interaction.guildId).weatherJobs||[];
        return interaction.reply({content:jobs.length?jobs.map(j=>`#${j.id} ${j.regions.join('、')} → <#${j.channelId}> ${j.time} JST`).join('\n').slice(0,1900):'登録なし',ephemeral:true});
      }
      if(n==='weather-auto-remove'){
        const g=guildData(store,interaction.guildId),id=interaction.options.getInteger('id',true);
        const before=(g.weatherJobs||[]).length;g.weatherJobs=(g.weatherJobs||[]).filter(j=>j.id!==id);saveStore(store);
        return interaction.reply({content:before===g.weatherJobs.length?'❌ 設定IDが見つかりません。':`✅ 設定 #${id} を削除しました。`,ephemeral:true});
      }
      if (n === 'weather-auto') {
        const g=guildData(store,interaction.guildId);
        const enabled=interaction.options.getBoolean('enabled',true);
        const raw=interaction.options.getString('time');
        const channel=interaction.options.getChannel('channel');

        if(raw){
          const value=raw.trim();
          if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)){
            return interaction.reply({content:'❌ 時刻は `07:00` や `18:30` のように24時間表記で入力してください。',ephemeral:true});
          }
          g.weatherAutoTime=value;
          g.lastWeatherPostDate=null;
        }

        if(channel)g.weatherChannelId=channel.id;

        const registeredForAuto=g.weatherRegions||[];
        const missingRoute=registeredForAuto.filter(pref=>!(g.weatherChannelRoutes||{})[pref] && !g.weatherChannelId);
        if(enabled && missingRoute.length){
          return interaction.reply({
            content:`❌ 投稿先が未設定の地域があります: ${missingRoute.join('、')}\n`
              + '`/weather-channel` で地域ごとの投稿先を設定するか、`/weather-auto channel:` で共通投稿先を設定してください。',
            ephemeral:true
          });
        }

        if(enabled && !(g.weatherRegions||[]).length){
          return interaction.reply({
            content:'❌ 自動投稿をONにする前に天気地域を1つ以上登録してください。\n例: `/weather-register action:追加 region:関東地方`',
            ephemeral:true
          });
        }

        g.weatherAutoEnabled=enabled;
        saveStore(store);
        return interaction.reply({
          content:`✅ **自動天気設定を保存しました**\n`
            + `自動投稿: **${g.weatherAutoEnabled?'ON':'OFF'}**\n`
            + `投稿時刻: **${g.weatherAutoTime||'07:00'}**（日本時間）\n`
            + `共通投稿先: ${g.weatherChannelId?`<#${g.weatherChannelId}>`:'未設定（地域別設定を使用可能）'}\n`
            + `登録地域: **${(g.weatherRegions||[]).length}/47都道府県**`,
          ephemeral:true
        });
      }

      if (n === 'earthquake-auto-add') {
        const g=guildData(store,interaction.guildId);
        const region=interaction.options.getString('region',true).trim();
        const regions=region==='全国'?[]:expandWeatherRegion(region);
        if(region!=='全国'&&!regions.length)return interaction.reply({content:'❌ 地域名が正しくありません。',ephemeral:true});
        const channelId=interaction.options.getChannel('channel',true).id;
        const minIntensity=interaction.options.getInteger('min_intensity')||3;
        g.earthquakeJobs??=[];
        const id=Math.max(0,...g.earthquakeJobs.map(x=>x.id||0))+1;
        g.earthquakeJobs.push({id,region,regions,channelId,minIntensity});saveStore(store);
        return interaction.reply({content:`✅ 地震速報設定 #${id} を追加: ${region} / <#${channelId}> / 最低震度 ${minIntensity}`,ephemeral:true});
      }
      if(n==='earthquake-auto-list'){
        const jobs=guildData(store,interaction.guildId).earthquakeJobs||[];
        return interaction.reply({content:jobs.length?jobs.map(j=>`#${j.id} ${j.region||((j.regions||[]).join('、')||'全国')} → <#${j.channelId}> / 最低震度 ${j.minIntensity||3}`).join('\n').slice(0,1900):'登録なし',ephemeral:true});
      }
      if(n==='earthquake-auto-remove'){
        const g=guildData(store,interaction.guildId),id=interaction.options.getInteger('id',true);
        const before=(g.earthquakeJobs||[]).length;g.earthquakeJobs=(g.earthquakeJobs||[]).filter(j=>j.id!==id);saveStore(store);
        return interaction.reply({content:before===g.earthquakeJobs.length?'❌ 設定IDが見つかりません。':`✅ 地震速報設定 #${id} を削除しました。`,ephemeral:true});
      }

      if (n === 'earthquake') {
        await interaction.deferReply();return interaction.editReply(earthquakeText(await fetchLatestEarthquake()));
      }
      if (n === 'earthquake-register') {
        const g=guildData(store,interaction.guildId),r=interaction.options.getString('region',true),min=interaction.options.getInteger('min_intensity');
        if(!g.earthquakeRegions.includes(r))g.earthquakeRegions.push(r);if(min)g.minIntensity=min;saveStore(store);
        return interaction.reply({content:`✅ 地震地域: ${g.earthquakeRegions.join(' / ')} / 最低震度 ${g.minIntensity}`,ephemeral:true});
      }
      if (n === 'earthquake-list') {
        const g=guildData(store,interaction.guildId);return interaction.reply({content:`地域: ${g.earthquakeRegions.join(' / ')||'全国（地域未設定のため）'} / 最低震度 ${g.minIntensity}`,ephemeral:true});
      }
      if (n === 'earthquake-auto') {
        const g=guildData(store,interaction.guildId);
        const enabled=interaction.options.getBoolean('enabled',true);
        const channel=interaction.options.getChannel('channel');
        if(channel)g.earthquakeChannelId=channel.id;
        if(enabled && !g.earthquakeChannelId){
          return interaction.reply({content:'❌ 地震速報の投稿先が未設定です。`/earthquake-auto enabled:True channel:#地震速報` のように投稿先も指定してください。',ephemeral:true});
        }
        g.earthquakeAutoEnabled=enabled;
        saveStore(store);
        return interaction.reply({
          content:`✅ 自動地震速報: **${g.earthquakeAutoEnabled?'ON':'OFF'}**\n投稿先: ${g.earthquakeChannelId?`<#${g.earthquakeChannelId}>`:'未設定'}\n対象: ${g.earthquakeRegions.length?g.earthquakeRegions.join(' / '):'全国（地域未設定）'}\n最低震度: **${g.minIntensity||3}**\n⚡ 新着地震を約${config.earthquakePollSeconds}秒間隔で監視します。`,
          ephemeral:true
        });
      }

      if (n === 'schedule-post') {
        const ch=interaction.options.getChannel('channel',true),raw=interaction.options.getString('datetime',true),message=interaction.options.getString('message',true),del=interaction.options.getInteger('delete_after_minutes');
        const when=new Date(raw.replace(' ','T')+':00+09:00');
        if(Number.isNaN(when.getTime()))return interaction.reply({content:'❌ 日時は 2026-09-15 20:00 の形式にしてください。',ephemeral:true});
        const id=store.nextScheduleId++;store.schedules.push({id,guildId:interaction.guildId,channelId:ch.id,message,at:when.toISOString(),deleteAfterMinutes:del,done:false});saveStore(store);
        return interaction.reply({content:`✅ 予約 #${id} を登録しました。`,ephemeral:true});
      }
      if (n === 'schedule-list') {
        const a=store.schedules.filter(x=>x.guildId===interaction.guildId&&!x.done);return interaction.reply({content:a.length?a.map(x=>`#${x.id} ${x.at} → <#${x.channelId}>`).join('\n'):'予約はありません。',ephemeral:true});
      }
      if (n === 'schedule-cancel') {
        const id=interaction.options.getInteger('id',true),before=store.schedules.length;store.schedules=store.schedules.filter(x=>!(x.guildId===interaction.guildId&&x.id===id));saveStore(store);
        return interaction.reply({content:before!==store.schedules.length?`✅ 予約 #${id} を削除しました。`:'該当予約がありません。',ephemeral:true});
      }

      if (n === 'moderation-rule') {
        const id=store.nextRuleId++;store.moderationRules.push({id,guildId:interaction.guildId,keyword:interaction.options.getString('keyword',true),action:interaction.options.getString('action',true)});saveStore(store);
        return interaction.reply({content:`✅ ルール #${id} を追加しました。`,ephemeral:true});
      }
      if (n === 'moderation-list') {
        const a=store.moderationRules.filter(x=>x.guildId===interaction.guildId);return interaction.reply({content:a.length?a.map(x=>`#${x.id} "${x.keyword}" → ${x.action}`).join('\n'):'ルールなし',ephemeral:true});
      }
      if (n === 'moderation-remove') {
        const id=interaction.options.getInteger('id',true),before=store.moderationRules.length;store.moderationRules=store.moderationRules.filter(x=>!(x.guildId===interaction.guildId&&x.id===id));saveStore(store);
        return interaction.reply({content:before!==store.moderationRules.length?`✅ #${id} 削除完了`:'該当なし',ephemeral:true});
      }

      if (n === 'play') {
        const input=interaction.options.getString('query',true);const vc=interaction.member?.voice?.channel;
        if(!vc)return interaction.reply({content:'❌ 先にボイスチャンネルへ参加してください。',ephemeral:true});
        await interaction.deferReply();
        try{
          const track=await resolveMusicTrack(input);const sess=await createMusicSession(interaction,vc);
          sess.queue.push({...track,requesterId:interaction.user.id});
          const controls=new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music:pause').setLabel('⏸ 一時停止').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music:resume').setLabel('▶ 再開').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('music:skip').setLabel('⏭ スキップ').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('music:stop').setLabel('⏹ 停止').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music:leave').setLabel('👋 退出').setStyle(ButtonStyle.Secondary));
          await interaction.editReply({embeds:[new EmbedBuilder().setTitle('🎵 Music Player').setDescription(`**${track.title}**\n${track.url}\n\nVC: <#${vc.id}> / 担当: <@${sess.client.user.id}>`)],components:[controls]});
          if(!sess.playing)playNext(sess.key).catch(console.error);
        }catch(e){await interaction.editReply(`❌ 再生準備に失敗しました。\n${String(e.message||e).slice(0,1000)}`);}return;
      }
      if (n === 'queue') {const s=sessionForInteraction(interaction);const lines=[];if(s?.current)lines.push(`▶️ **${s.current.title}**`);if(s?.queue?.length)lines.push(...s.queue.map((x,k)=>`${k+1}. ${x.title}`));return interaction.reply(lines.join('\n')||'このVCのキューは空です。');}
      if (n === 'skip') {const s=sessionForInteraction(interaction);if(!s)return interaction.reply({content:'このVCでは再生していません。',ephemeral:true});s.player.stop(true);return interaction.reply('⏭️ スキップしました。');}
      if (n === 'stop') {const s=sessionForInteraction(interaction);if(s){s.queue.length=0;try{s.ffmpeg?.kill();}catch{}s.ffmpeg=null;s.current=null;s.playing=false;s.startedAt=null;s.player.stop(true);}return interaction.reply('⏹️ このVCの再生を停止しました。BOTはVCに残ります。');}
      if (n === 'leave') {const s=sessionForInteraction(interaction);if(!s)return interaction.reply({content:'このVCに接続中の音楽BOTはありません。',ephemeral:true});destroyMusicSession(s);return interaction.reply('👋 音楽BOTをこのボイスチャンネルから退出させました。');}
      if (n === 'pause') {const s=sessionForInteraction(interaction);if(!s)return interaction.reply({content:'このVCでは再生していません。',ephemeral:true});s.player.pause();return interaction.reply('⏸️ 一時停止しました。');}
      if (n === 'resume') {const s=sessionForInteraction(interaction);if(!s)return interaction.reply({content:'このVCでは再生していません。',ephemeral:true});s.player.unpause();return interaction.reply('▶️ 再開しました。');}
      if (n === 'nowplaying') {const s=sessionForInteraction(interaction);return interaction.reply(s?.current?`🎵 **${s.current.title}**\n${s.current.url}\n担当: <@${s.client.user.id}>`:'このVCでは現在再生していません。');}
      if (n === 'volume') {const s=sessionForInteraction(interaction);if(!s)return interaction.reply({content:'このVCでは再生していません。',ephemeral:true});const v=interaction.options.getInteger('percent',true);s.volume=v;s.player.state.resource?.volume?.setVolume(v/100);return interaction.reply(`🔊 音量を ${v}% に変更しました。`);}
      if (n === 'music-stats') {
        const st=musicStats(interaction.guildId),type=interaction.options.getString('type')||'all';const parts=[];
        if(type==='all'||type==='users'){const users=Object.entries(st.users||{}).sort((a,b)=>(b[1].seconds||0)-(a[1].seconds||0)).slice(0,10);parts.push(`👥 **よく聴いているユーザー**\n${users.length?users.map(([id,u],i)=>`${i+1}. <@${id}> — ${fmtDuration(u.seconds)}`).join('\n'):'まだ統計がありません。'}`);}
        if(type==='all'||type==='tracks'){const tracks=Object.values(st.tracks||{}).sort((a,b)=>(b.plays||0)-(a.plays||0)).slice(0,10);parts.push(`🎶 **人気曲**\n${tracks.length?tracks.map((t,i)=>`${i+1}. ${t.title} — ${t.plays}回`).join('\n'):'まだ統計がありません。'}`);}
        return interaction.reply({embeds:[new EmbedBuilder().setTitle('📊 Music Statistics').setDescription(parts.join('\n\n')).setFooter({text:`総再生開始回数: ${st.totalPlays||0}`})]});
      }
      if (n === 'video') return interaction.reply(`🎬 ${interaction.options.getString('url',true)}`);
    }

    // 音楽プレイヤー操作ボタン
    if(interaction.isButton() && interaction.customId.startsWith('music:')){
      const action=interaction.customId.split(':')[1];
      const vcId=interaction.member?.voice?.channelId;
      const s=vcId?players.get(musicSessionKey(interaction.guildId,vcId)):null;
      if(!s)return interaction.reply({content:'❌ 音楽BOTと同じボイスチャンネルに参加してください。',ephemeral:true});
      if(action==='pause'){s.player.pause();return interaction.reply({content:'⏸️ 一時停止しました。',ephemeral:true});}
      if(action==='resume'){s.player.unpause();return interaction.reply({content:'▶️ 再開しました。',ephemeral:true});}
      if(action==='skip'){s.player.stop(true);return interaction.reply({content:'⏭️ スキップしました。',ephemeral:true});}
      if(action==='stop'){s.queue.length=0;try{s.ffmpeg?.kill();}catch{}s.ffmpeg=null;s.current=null;s.playing=false;s.startedAt=null;s.player.stop(true);return interaction.reply({content:'⏹️ 再生を停止しました。BOTはVCに残ります。',ephemeral:true});}
      if(action==='leave'){destroyMusicSession(s);return interaction.reply({content:'👋 音楽BOTをこのボイスチャンネルから退出させました。',ephemeral:true});}
    }

    // 自動販売機 管理パネル操作
    if(interaction.isButton() && interaction.customId.startsWith('shopui:')){
      const [,action,shopId]=interaction.customId.split(':');
      if(action==='create'){
        const modal=new ModalBuilder().setCustomId('shopuiCreateModal').setTitle('自動販売機作成');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('自動販売機名').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)));
        return interaction.showModal(modal);
      }
      const shops=Object.values(store.shops).filter(x=>x.guildId===interaction.guildId&&x.active!==false);
      if(action==='settings'||action==='delete'||action==='displayselect'){
        if(!shops.length)return interaction.reply({content:'自動販売機がありません。',ephemeral:true});
        const select=new StringSelectMenuBuilder().setCustomId(`shopuiSelect:${action}`).setPlaceholder(action==='settings'?'設定する自販機を選択してください':action==='delete'?'削除する自販機を選択してください':'表示する自販機を選択してください').addOptions(shops.slice(0,25).map(x=>({label:x.name.slice(0,100),description:`自販機 #${x.id}`,value:String(x.id)})));
        return interaction.reply({content:'対象を選択してください：',components:[new ActionRowBuilder().addComponents(select)],ephemeral:true});
      }
      const shop=store.shops[shopId];
      if(!shop||shop.guildId!==interaction.guildId||!isShopManager(interaction,shop))return interaction.reply({content:'❌ 自販機が見つからないか、管理権限がありません。',ephemeral:true});
      if(action==='display'){
        const picker=new ChannelSelectMenuBuilder().setCustomId(`shopuiChannel:display:${shop.id}`).setPlaceholder('自販機を表示するチャンネル').addChannelTypes(ChannelType.GuildText);
        return interaction.reply({content:`**${shop.name}** の表示先を選択してください。`,components:[new ActionRowBuilder().addComponents(picker)],ephemeral:true});
      }
      if(action==='orderchannel'||action==='saleschannel'){
        const picker=new ChannelSelectMenuBuilder().setCustomId(`shopuiChannel:${action}:${shop.id}`).setPlaceholder('チャンネルを選択').addChannelTypes(ChannelType.GuildText);
        return interaction.reply({content:'設定するチャンネルを選択してください。',components:[new ActionRowBuilder().addComponents(picker)],ephemeral:true});
      }
      if(action==='salestoggle'){shop.showSalesCount=!shop.showSalesCount;saveStore(store);return interaction.update({embeds:[shopManageEmbed(shop)],components:shopManageRows(shop)});}
      if(action==='stock'||action==='products'){
        const ps=shop.products||[];const lines=ps.map(p=>`${p.active===false?'🛑':'✅'} **${p.name}** / ID:\`${p.id}\` / ¥${Number(p.price).toLocaleString()} / 在庫:${p.stock<0?'∞':p.stock}`);
        return interaction.reply({content:lines.join('\n')||'商品はありません。',ephemeral:true});
      }
      if(action==='stats'){
        const os=Object.values(store.orders||{}).filter(o=>Number(o.shopId)===Number(shop.id));const completed=os.filter(o=>o.status==='completed');const total=completed.reduce((a,o)=>a+Number(o.total||0),0);
        return interaction.reply({content:`📊 **${shop.name} 統計**\n注文: **${os.length}件**\n完了: **${completed.length}件**\n完了売上: **¥${total.toLocaleString()}**`,ephemeral:true});
      }
      if(action==='productadd')return interaction.reply({content:`商品追加は \`/product-add shop_id:${shop.id}\` から登録できます。ZIP・URL・画像・購入後ロール等も設定できます。`,ephemeral:true});
    }
    if(interaction.isStringSelectMenu() && interaction.customId.startsWith('shopuiSelect:')){
      const action=interaction.customId.split(':')[1],shop=store.shops[interaction.values[0]];
      if(!shop||shop.guildId!==interaction.guildId||!isShopManager(interaction,shop))return interaction.update({content:'❌ 自販機が見つからないか、管理権限がありません。',components:[]});
      if(action==='settings')return interaction.update({content:'',embeds:[shopManageEmbed(shop)],components:shopManageRows(shop)});
      if(action==='displayselect'){
        const picker=new ChannelSelectMenuBuilder().setCustomId(`shopuiChannel:display:${shop.id}`).setPlaceholder('自販機を表示するチャンネル').addChannelTypes(ChannelType.GuildText);
        return interaction.update({content:`**${shop.name}** の表示先を選択してください。`,embeds:[],components:[new ActionRowBuilder().addComponents(picker)]});
      }
      if(action==='delete'){shop.active=false;saveStore(store);return interaction.update({content:`🛑 自販機 #${shop.id}「${shop.name}」を停止しました。`,components:[]});}
    }
    if(interaction.isChannelSelectMenu() && interaction.customId.startsWith('shopuiChannel:')){
      const [,action,shopId]=interaction.customId.split(':'),shop=store.shops[shopId];
      if(!shop||shop.guildId!==interaction.guildId||!isShopManager(interaction,shop))return interaction.update({content:'❌ 自販機が見つからないか、管理権限がありません。',components:[]});
      const channelId=interaction.values[0],ch=await interaction.guild.channels.fetch(channelId).catch(()=>null);
      if(!ch?.isTextBased())return interaction.update({content:'❌ テキストチャンネルを選択してください。',components:[]});
      if(action==='display'){
        const panel=buildShopSalesPanel(shop);if(!panel)return interaction.update({content:'❌ 販売可能な商品がありません。先に商品を追加してください。',components:[]});
        const msg=await ch.send(panel);shop.panelChannelId=ch.id;shop.panelMessageId=msg.id;saveStore(store);
        return interaction.update({content:`✅ **${shop.name}** を ${ch} に表示しました。`,components:[]});
      }
      if(action==='orderchannel')shop.orderChannelId=ch.id;
      if(action==='saleschannel')shop.salesChannelId=ch.id;
      saveStore(store);return interaction.update({content:`✅ **${shop.name}** のチャンネル設定を ${ch} に変更しました。`,components:[]});
    }

    if (interaction.isButton() && interaction.customId==='support_help') return interaction.reply({content:'🆘 サポートサーバー: https://discord.gg/KGhYc6cWmq',ephemeral:true});
    if (interaction.isStringSelectMenu() && interaction.customId==='rolecolor') {
      if(!hasConfiguredAdminRole(interaction))return interaction.reply({content:'❌ 管理者ロールが必要です。',ephemeral:true});
      const key=`${interaction.guildId}:${interaction.user.id}`,pending=pendingRoleCreates.get(key);
      if(!pending||Date.now()-pending.at>10*60*1000)return interaction.reply({content:'❌ 作成情報の期限が切れました。もう一度 `/role-create` を実行してください。',ephemeral:true});
      try{
        const role=await interaction.guild.roles.create({name:pending.name,color:interaction.values[0],permissions:pending.permissions,mentionable:pending.mentionable,hoist:pending.hoist,reason:`${interaction.user.tag} /role-create`});
        pendingRoleCreates.delete(key);
        return interaction.update({content:`✅ ロール ${role} を作成しました。\n色: **${interaction.values[0]}**`,components:[]});
      }catch(e){console.error('role create',e);return interaction.update({content:`❌ ロール作成に失敗しました。BOTの「ロールの管理」権限を確認してください。\n${String(e.message||e).slice(0,500)}`,components:[]});}
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rolepage:')) {
      const roleId=interaction.values[0];
      const role=await interaction.guild.roles.fetch(roleId).catch(()=>null);
      if(!role)return interaction.reply({content:'❌ ロールが見つかりません。',ephemeral:true});
      const problem=rolePanelProblem(interaction.guild,role);
      if(problem)return interaction.reply({content:`❌ ${problem}`,ephemeral:true});
      const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if(!member)return interaction.reply({content:'❌ メンバー情報を取得できません。',ephemeral:true});
      try{
        if(member.roles.cache.has(role.id)){
          await member.roles.remove(role,'ロールパネルから解除');
          return interaction.reply({content:`✅ **${role.name}** を外しました。`,ephemeral:true});
        }
        await member.roles.add(role,'ロールパネルから付与');
        return interaction.reply({content:`✅ **${role.name}** を付与しました。`,ephemeral:true});
      }catch(e){
        console.error('role select panel error',e);
        return interaction.reply({content:'❌ ロールを変更できません。BOTの「ロールの管理」権限とロール順序を確認してください。',ephemeral:true});
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('shopselect:')) {
      const shopId=interaction.customId.split(':')[1];
      const productId=interaction.values[0];
      const shop=store.shops[shopId],p=shop?.products?.find(x=>x.id===productId);
      if(!shop||!p||p.active===false||p.stock===0)return interaction.reply({content:'❌ この商品は現在購入できません。',ephemeral:true});
      const embed=new EmbedBuilder()
        .setTitle(`🛍️ ${p.name}`)
        .setDescription(p.description||'商品説明はありません。')
        .addFields(
          {name:'価格',value:`¥${Number(p.price).toLocaleString()}`,inline:true},
          {name:'在庫',value:p.stock<0?'∞':String(p.stock),inline:true},
          {name:'受取方法',value:p.deliveryMode==='zip'?'ZIPファイル':p.deliveryMode==='gigafile'?'ギガファイル便':p.deliveryMode==='url'?'ダウンロードURL':'販売者から配布',inline:true}
        );
      if(p.imageUrl&&validHttpUrl(p.imageUrl))embed.setImage(p.imageUrl);
      const row=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`buy:${shop.id}:${p.id}`).setLabel('この商品を購入').setStyle(ButtonStyle.Success)
      );
      return interaction.reply({embeds:[embed],components:[row],ephemeral:true});
    }

    if (interaction.isButton()) {
      const [kind,a,b]=interaction.customId.split(':');

      if (kind === 'verify' || kind === 'verifypanel' || kind === 'roleapprove') {
        const approvalOption=kind==='roleapprove' ? guildData(store,interaction.guildId).rolePanels?.[b]?.roleOptions?.find(x=>x.roleId===a && x.mode==='approval') : null;
        if(kind==='roleapprove' && (!approvalOption || interaction.channelId!==b))return interaction.reply({content:'❌ この承認制ロールは現在のパネルで設定されていません。',ephemeral:true});
        const panel=kind==='verifypanel' ? guildData(store,interaction.guildId).verificationPanels?.[a] : null;
        if(kind==='verifypanel' && !panel)return interaction.reply({content:'❌ 認証パネルの設定が見つかりません。',ephemeral:true});
        const requestedIds=panel?.roleIds || [a||guildData(store,interaction.guildId).verificationRoleId];
        const panelName=panel?.name||(kind==='roleapprove'?approvalOption.label:'認証');
        const panelReviewChannelId=panel?.approvalChannelId||(kind==='roleapprove'?approvalOption.approvalChannelId:b)||guildData(store,interaction.guildId).verificationReviewChannelId;
        const roles=[];
        for(const id of requestedIds){
          const role=id ? await interaction.guild.roles.fetch(id).catch(()=>null) : null;
          if(!role)return interaction.reply({content:'❌ 認証ロールが見つかりません。管理者に確認してください。',ephemeral:true});
          const problem=rolePanelProblem(interaction.guild,role);
          if(problem)return interaction.reply({content:`❌ ${role.name}: ${problem}`,ephemeral:true});
          roles.push(role);
        }
        const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
        if(!member)return interaction.reply({content:'❌ メンバー情報を取得できませんでした。',ephemeral:true});
        if(roles.every(role=>member.roles.cache.has(role.id)))return interaction.reply({content:'✅ 対象ロールはすべて付与済みです。',ephemeral:true});
        const roleIds=roles.map(role=>role.id);
        const roleId=roleIds[0];
        const existing=Object.values(store.verificationRequests || {}).find(
          r=>r.guildId===interaction.guildId && r.userId===interaction.user.id && (r.panelId ? r.panelId===(kind==='roleapprove'?`role:${b}:${a}`:a) : r.roleId===roleId && kind==='verify') && r.status==='pending'
        );
        if(existing){
          return interaction.reply({
            content:`⏳ すでに認証申請済みです。管理者の承認をお待ちください。（申請 #${existing.id}）`,
            ephemeral:true
          });
        }

        const id=store.nextVerificationRequestId++;
        store.verificationRequests[id]={
          id,
          guildId:interaction.guildId,
          userId:interaction.user.id,
          roleId,
          roleIds,
          panelId:kind==='verifypanel'?a:(kind==='roleapprove'?`role:${b}:${a}`:null),
          panelName,
          status:'pending',
          createdAt:new Date().toISOString(),
          reviewedAt:null,
          reviewedBy:null
        };
        saveStore(store);

        const g=guildData(store,interaction.guildId);
        let notifySent=false;
        const effectiveReviewChannelId=panelReviewChannelId||g.verificationReviewChannelId;
        if(effectiveReviewChannelId){
          const reviewChannel=interaction.guild.channels.cache.get(effectiveReviewChannelId)
            || await interaction.guild.channels.fetch(effectiveReviewChannelId).catch(()=>null);

          if(reviewChannel?.isTextBased()){
            const reviewEmbed=new EmbedBuilder()
              .setTitle(`✅ 認証申請 #${id}`)
              .setDescription(`申請者：<@${interaction.user.id}>\n申請内容：${panelName}`)
              .addFields(
                {name:'ユーザーID',value:interaction.user.id},
                {name:'承認後のロール',value:roleIds.map(id=>`<@&${id}>`).join('\n').slice(0,1024)},
                {name:'申請日時',value:new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}
              )
              .setThumbnail(interaction.user.displayAvatarURL())
              .setTimestamp();

            const reviewRow=new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`verifyadmin:${id}:approve`)
                .setLabel('承認する')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`verifyadmin:${id}:reject`)
                .setLabel('却下する')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
            );

            const sent=await reviewChannel.send({
              content:null,
              embeds:[reviewEmbed],
              components:[reviewRow]
            }).catch(e=>{
              console.error('verification review notification error',e);
              return null;
            });

            if(sent){
              store.verificationRequests[id].reviewMessageId=sent.id;
              store.verificationRequests[id].reviewChannelId=reviewChannel.id;
              saveStore(store);
              notifySent=true;
            }
          }
        }

        return interaction.reply({
          content:notifySent
            ? `✅ 認証申請を送信しました。（申請 #${id}）\n管理者へ通知しました。承認されると **${roles.map(r=>r.name).join('、')}** が付与されます。`
            : `✅ 認証申請を保存しました。（申請 #${id}）\n⚠️ 承認通知チャンネルへの通知に失敗しました。管理者は \`/verify-admin\` から確認できます。`,
          ephemeral:true
        });
      }

      if (kind === 'verifyadmin') {
        if(!hasConfiguredAdminRole(interaction)){
          return interaction.reply({content:'❌ 指定された管理者ロールが必要です。',ephemeral:true});
        }

        const req=store.verificationRequests?.[a];
        if(!req || req.guildId!==interaction.guildId){
          return interaction.reply({content:'❌ 認証申請が見つかりません。',ephemeral:true});
        }
        if(req.status!=='pending'){
          return interaction.reply({content:`ℹ️ この申請はすでに **${req.status==='approved'?'承認':'却下'}済み** です。`,ephemeral:true});
        }


        if(b==='reject'){
          req.status='rejected'; req.reviewedAt=new Date().toISOString(); req.reviewedBy=interaction.user.id;
          saveStore(store);
          const user=await client.users.fetch(req.userId).catch(()=>null);
          await user?.send(`❌ ${interaction.guild.name} の認証申請 #${req.id} は却下されました。`).catch(()=>{});
          return interaction.update({content:null,embeds:[new EmbedBuilder().setTitle(`認証申請 #${req.id}`).setDescription(`申請者：<@${req.userId}>\n申請内容：${req.panelName||'認証'}\n状態：❌ 却下済み\n処理者：<@${interaction.user.id}>`).setTimestamp()],components:[]});
        }

        if(b==='approve'){
          const member=await interaction.guild.members.fetch(req.userId).catch(()=>null);
          if(!member)return interaction.reply({content:'❌ 対象メンバーが見つかりません。',ephemeral:true});
          const roles=[];
          for(const id of (req.roleIds||[req.roleId])){
            const role=await interaction.guild.roles.fetch(id).catch(()=>null);
            if(!role)return interaction.reply({content:`❌ ロール ${id} が見つかりません。`,ephemeral:true});
            const problem=rolePanelProblem(interaction.guild,role);
            if(problem)return interaction.reply({content:`❌ ${role.name}: ${problem}`,ephemeral:true});
            roles.push(role);
          }

          try{
            const missing=roles.filter(role=>!member.roles.cache.has(role.id));
            if(missing.length)await member.roles.add(missing,`認証申請 #${req.id} を管理者が承認`);
            req.status='approved'; req.reviewedAt=new Date().toISOString(); req.reviewedBy=interaction.user.id;
            saveStore(store);

            const user=await client.users.fetch(req.userId).catch(()=>null);
            await user?.send(`✅ ${interaction.guild.name} の認証申請 #${req.id} が承認され、${roles.map(r=>r.name).join("、")} が付与されました。`).catch(()=>{});

            return interaction.update({content:null,embeds:[new EmbedBuilder().setTitle(`認証申請 #${req.id}`).setDescription(`申請者：<@${req.userId}>\n申請内容：${req.panelName||'認証'}\n付与ロール：${roles.map(r=>`<@&${r.id}>`).join('、')}\n状態：✅ 承認済み\n処理者：<@${interaction.user.id}>`).setTimestamp()],components:[]});
          }catch(e){
            console.error('verify approve error',e);
            return interaction.reply({
              content:'❌ ロール付与に失敗しました。BOTの「ロールの管理」権限とロール順序を確認してください。',
              ephemeral:true
            });
          }
        }
      }
      if (kind === 'rolepanelprev' || kind === 'rolepanelnext') {
        const channelId=a;
        const g=guildData(store,interaction.guildId); g.rolePanels ??= {};
        const cfg=g.rolePanels[channelId];
        if(!cfg)return interaction.reply({content:'❌ このロールパネル設定が見つかりません。',ephemeral:true});
        const valid=[];
        for(const opt of (cfg.roleOptions||[])){
          const role=await interaction.guild.roles.fetch(opt.roleId).catch(()=>null);
          if(!role||rolePanelProblem(interaction.guild,role))continue;
          valid.push({roleId:role.id,label:(opt.label||role.name).slice(0,80),roleName:role.name,mode:opt.mode||'instant'});
        }
        if(!valid.length)return interaction.reply({content:'❌ 表示できるロールがありません。',ephemeral:true});
        let page=Number(b)||0;
        page += kind==='rolepanelnext'?1:-1;
        return interaction.update(buildChannelRolePanel(channelId,cfg,valid,page));
      }

      if (kind === 'roleprev' || kind === 'rolenext' || kind === 'rolerefresh') {
        const g=guildData(store,interaction.guildId);
        const valid=[];
        for(const opt of (g.roleOptions||[])){
          const role=await interaction.guild.roles.fetch(opt.roleId).catch(()=>null);
          if(!role||rolePanelProblem(interaction.guild,role))continue;
          valid.push({roleId:role.id,label:(opt.label||role.name).slice(0,100)});
        }
        const totalPages=Math.max(1,Math.ceil(valid.length/25));
        let page=Number(a)||0;
        page=kind==='rolenext'?page+1:kind==='roleprev'?page-1:page;
        page=Math.max(0,Math.min(totalPages-1,page));
        const slice=valid.slice(page*25,page*25+25);
        if(!slice.length)return interaction.reply({content:'❌ 表示できるロールがありません。',ephemeral:true});
        const menu=new StringSelectMenuBuilder().setCustomId(`rolepage:${page}`)
          .setPlaceholder(`ロールを選択（${page+1}/${totalPages}ページ）`)
          .addOptions(slice.map(x=>({label:x.label,value:x.roleId,description:'選択で付与 / 所持中なら解除'})));
        const components=[new ActionRowBuilder().addComponents(menu)];
        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rolerefresh:${page}`).setLabel('🔄 登録ロールを更新').setStyle(ButtonStyle.Secondary)));
        if(totalPages>1)components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`roleprev:${page}`).setLabel('◀ 前へ').setStyle(ButtonStyle.Secondary).setDisabled(page===0),
          new ButtonBuilder().setCustomId(`rolenext:${page}`).setLabel(`次へ ▶ (${page+1}/${totalPages})`).setStyle(ButtonStyle.Secondary).setDisabled(page>=totalPages-1)
        ));
        return interaction.update({components,embeds:[new EmbedBuilder().setTitle('🎭 ロール選択').setDescription(`登録ロール: **${valid.length}個**\nプルダウンから選択すると付与、所持中なら解除します。`)]});
      }

      if (kind === 'role') {
        const g=guildData(store,interaction.guildId);
        const configured=g.rolePanels?.[b]?.roleOptions?.find(x=>x.roleId===a);
        if(configured?.mode==='approval')return interaction.reply({content:'🔒 このロールは管理者承認が必要です。最新のパネルから申請してください。',ephemeral:true});
        const role=await interaction.guild.roles.fetch(a).catch(()=>null);
        if(!role){
          return interaction.reply({content:'❌ このロールは削除されているか、取得できません。管理者にパネルの作り直しを依頼してください。',ephemeral:true});
        }

        const problem=rolePanelProblem(interaction.guild,role);
        if(problem){
          return interaction.reply({content:`❌ ${problem}`,ephemeral:true});
        }

        const member=await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
        if(!member){
          return interaction.reply({content:'❌ メンバー情報を取得できませんでした。',ephemeral:true});
        }

        const has=member.roles.cache.has(role.id);

        try{
          if(has){
            await member.roles.remove(role,'ロールパネルから解除');
            return interaction.reply({content:`✅ **${role.name}** を外しました。`,ephemeral:true});
          }

          await member.roles.add(role,'ロールパネルから付与');
          return interaction.reply({content:`✅ **${role.name}** を付与しました。`,ephemeral:true});
        }catch(e){
          console.error('role panel error',e);
          return interaction.reply({
            content:'❌ ロールを変更できませんでした。BOTの「ロールの管理」権限とロール順序を確認してください。',
            ephemeral:true
          });
        }
      }
      if (kind === 'music') {
        const s=sessionForInteraction(interaction);
        if(!s)return interaction.reply({content:'先に対象のボイスチャンネルへ参加してください。',ephemeral:true});
        if(a==='stop'){
          s.queue.length=0;try{s.ffmpeg?.kill();}catch{};s.ffmpeg=null;s.current=null;s.playing=false;s.startedAt=null;s.player.stop(true);
          return interaction.reply({content:'⏹️ 再生を停止しました。BOTはVCに残ります。',ephemeral:true});
        }
        if(a==='leave'){
          s.queue.length=0;try{s.ffmpeg?.kill();}catch{};try{s.player.stop(true);}catch{};try{s.connection.destroy();}catch{};players.delete(s.key);
          return interaction.reply({content:'👋 音楽BOTをVCから退出させました。',ephemeral:true});
        }
        if(a==='pause'){s.player.pause();return interaction.reply({content:'⏸️ 一時停止しました。',ephemeral:true});}
        if(a==='resume'){s.player.unpause();return interaction.reply({content:'▶️ 再開しました。',ephemeral:true});}
        if(a==='skip'){s.player.stop(true);return interaction.reply({content:'⏭️ スキップしました。',ephemeral:true});}
      }

      if (kind === 'ticket' && a === 'create') {
        await interaction.deferReply({ephemeral:true});
        const g=guildData(store,interaction.guildId);
        const overwrites=[
          {id:interaction.guild.id,deny:[PermissionFlagsBits.ViewChannel]},
          {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
        ];
        if(g.ticketSupportRoleId){
          overwrites.push({
            id:g.ticketSupportRoleId,
            allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]
          });
        }

        const ch=await interaction.guild.channels.create({
          name:`ticket-${interaction.user.username}`.slice(0,90),
          type:ChannelType.GuildText,
          parent:g.ticketCategoryId || undefined,
          permissionOverwrites:overwrites
        });

        const ticketId=store.nextTicketId++;
        store.tickets[ticketId]={
          id:ticketId,guildId:interaction.guildId,channelId:ch.id,userId:interaction.user.id,
          status:'open',createdAt:new Date().toISOString()
        };
        saveStore(store);

        await ch.send({
          content:`<@${interaction.user.id}>`,
          embeds:[new EmbedBuilder().setTitle(`🎫 チケット #${ticketId}`).setDescription('サポート内容を送信してください。')],
          components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticketclose:${ticketId}`).setLabel('チケットを閉じる').setStyle(ButtonStyle.Danger)
          )]
        });
        let logNotice='';
        if(g.ticketLogChannelId){
          try{
            const logCh=await interaction.guild.channels.fetch(g.ticketLogChannelId);
            if(!logCh?.isTextBased() || !('send' in logCh))throw new Error('ログチャンネルが存在しないか、テキスト投稿に対応していません');
            const logMessage=await logCh.send({
              allowedMentions:{parse:[]},
              embeds:[new EmbedBuilder()
                .setTitle('🎫 チケット作成ログ')
                .addFields(
                  {name:'チケット番号',value:`#${ticketId}`,inline:true},
                  {name:'チケットチャンネル',value:`<#${ch.id}>`,inline:true},
                  {name:'作成者',value:`<@${interaction.user.id}> (${interaction.user.username})`,inline:false},
                  {name:'ユーザーID',value:interaction.user.id,inline:false},
                  {name:'作成日時',value:`<t:${Math.floor(Date.parse(store.tickets[ticketId].createdAt)/1000)}:F>`,inline:false}
                ).setTimestamp(new Date(store.tickets[ticketId].createdAt))]
            });
            store.tickets[ticketId].creationLogMessageId=logMessage.id;
            saveStore(store);
            console.log(`🎫 チケット作成ログ送信: #${ticketId} → ${logCh.id}`);
          }catch(error){
            console.error(`❌ チケット #${ticketId} 作成ログ送信失敗 (channel=${g.ticketLogChannelId})`,error);
            logNotice='\n⚠️ チケットは作成しましたが、作成ログの送信に失敗しました。管理者にログチャンネルの設定・BOT権限を確認してもらってください。';
          }
        }else{
          console.warn(`⚠️ チケット作成ログ未設定: guild=${interaction.guildId}`);
        }
        return interaction.editReply({content:`✅ ${ch} を作成しました。${logNotice}`});
      }

      if (kind === 'ticketclose') {
        const ticket=store.tickets?.[a];
        if(!ticket||ticket.guildId!==interaction.guildId)return interaction.reply({content:'❌ チケット情報がありません。',ephemeral:true});

        const g=guildData(store,interaction.guildId);
        const canClose =
          interaction.user.id===ticket.userId ||
          interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
          isBotOwnerUser(interaction.user) ||
          Boolean(g.ticketSupportRoleId && interaction.member?.roles?.cache?.has(g.ticketSupportRoleId));

        if(!canClose)return interaction.reply({content:'❌ チケットを閉じる権限がありません。',ephemeral:true});
        ticket.status='closed';
        ticket.closedAt=new Date().toISOString();
        saveStore(store);
        await interaction.reply('🔒 チケットを閉じます。');
        setTimeout(()=>interaction.channel?.delete('チケット終了').catch(()=>{}),1500);
        return;
      }
      if (kind === 'buy') {
        const shop=store.shops[a],product=shop?.products?.find(p=>p.id===b);
        if(!shop||!product)return interaction.reply({content:'❌ 商品が見つかりません。',ephemeral:true});
        const modal=new ModalBuilder().setCustomId(`buyModal:${shop.id}:${product.id}`).setTitle(product.name);
        const qty=new TextInputBuilder().setCustomId('qty').setLabel('購入数量').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1');
        const pay=new TextInputBuilder().setCustomId('paypay').setLabel('PayPay受け取りURL').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://pay.paypay.ne.jp/...');
        modal.addComponents(new ActionRowBuilder().addComponents(qty),new ActionRowBuilder().addComponents(pay));
        return interaction.showModal(modal);
      }
      if (kind === 'order') {
        const order=store.orders[a];if(!order)return interaction.reply({content:'❌ 注文が見つかりません。',ephemeral:true});
        const shop=store.shops[order.shopId];if(!isShopManager(interaction,shop))return interaction.reply({content:'❌ 管理権限がありません。',ephemeral:true});
        if(b==='complete'){
          if(order.status==='completed')return interaction.reply({content:'処理済みです。',ephemeral:true});
          const p=shop.products.find(x=>x.id===order.productId);
          if(!p)return interaction.reply({content:'❌ 商品が見つかりません。',ephemeral:true});
          if(p.stock>=0 && p.stock<order.qty)return interaction.reply({content:'❌ 在庫不足です。',ephemeral:true});

          if(p.stock>=0)p.stock-=order.qty;
          order.status='completed';
          order.completedAt=new Date().toISOString();
          saveStore(store);

          const user=await client.users.fetch(order.userId).catch(()=>null);
          const deliveryLink=
            p.deliveryMode==='zip' && p.zipFile?.url ? `📦 ZIPファイル: ${p.zipFile.url}` :
            p.deliveryMode==='gigafile' && p.gigafileUrl ? `📦 ギガファイル便: ${p.gigafileUrl}` :
            p.deliveryMode==='url' && p.downloadUrl ? `🔗 ダウンロードURL: ${p.downloadUrl}` :
            p.gigafileUrl ? `📦 ギガファイル便: ${p.gigafileUrl}` :
            p.zipFile?.url ? `📦 ZIPファイル: ${p.zipFile.url}` :
            p.downloadUrl ? `🔗 ダウンロードURL: ${p.downloadUrl}` : '';
          const dm=[
            `✅ 注文 #${order.id} 完了`,
            `商品: ${p.name} × ${order.qty}`,
            deliveryLink,
            p.deliveryMode==='gigafile' && p.gigafileExpiresAt ? `URL期限: ${new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium'}).format(new Date(p.gigafileExpiresAt))}` : '',
            p.delivery ? `\n${p.delivery}` : ''
          ].filter(Boolean).join('\n');
          await user?.send(dm).catch(()=>{});

          if(shop.salesChannelId){
            const salesCh=interaction.guild.channels.cache.get(shop.salesChannelId)
              || await interaction.guild.channels.fetch(shop.salesChannelId).catch(()=>null);
            if(salesCh?.isTextBased()){
              const salesEmbed=new EmbedBuilder()
                .setTitle('🎉 購入実績')
                .setDescription(`<@${order.userId}> さんが **${p.name}** を購入しました！\n数量: ${order.qty}\n販売者: <@${shop.ownerId}>`)
                .setTimestamp();
              if(p.imageUrl&&validHttpUrl(p.imageUrl))salesEmbed.setThumbnail(p.imageUrl);
              await salesCh.send({embeds:[salesEmbed]}).catch(()=>{});
            }
          }

          if(p.roleId){
            const member=await interaction.guild.members.fetch(order.userId).catch(()=>null);
            const role=await interaction.guild.roles.fetch(p.roleId).catch(()=>null);
            if(member&&role&&!rolePanelProblem(interaction.guild,role)){
              await member.roles.add(role,`購入商品 ${p.name} の特典ロール`).catch(()=>{});
            }
          }

          return interaction.reply('✅ 受け取り完了・商品配布しました。');
        }
        if(b==='reject'){order.status='rejected';saveStore(store);return interaction.reply('❌ 注文を却下しました。');}
      }
    }

    if(interaction.isModalSubmit() && interaction.customId==='shopuiCreateModal'){
      const name=interaction.fields.getTextInputValue('name').trim();
      const id=store.nextShopId++;
      const shop={id,guildId:interaction.guildId,ownerId:interaction.user.id,name,managerRoleId:null,orderChannelId:interaction.channelId,salesChannelId:null,historyChannelId:interaction.channelId,active:true,products:[],showSalesCount:false};
      store.shops[id]=shop;saveStore(store);
      return interaction.reply({content:`✅ 自動販売機 #${id}「${name}」を作成しました。\n\`/shop-admin\` → **自販機設定** から設定できます。`,ephemeral:true});
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('buyModal:')) {
      const [,shopId,productId]=interaction.customId.split(':'),shop=store.shops[shopId],p=shop?.products?.find(x=>x.id===productId);
      if(!shop||!p)return interaction.reply({content:'❌ 商品が見つかりません。',ephemeral:true});
      const qty=Number(interaction.fields.getTextInputValue('qty')),paypay=interaction.fields.getTextInputValue('paypay').trim();
      if(!Number.isInteger(qty)||qty<1)return interaction.reply({content:'❌ 数量が不正です。',ephemeral:true});
      if(p.stock>=0 && qty>p.stock)return interaction.reply({content:`❌ 在庫不足です。現在 ${p.stock} 個です。`,ephemeral:true});
      if(!paypay.startsWith('https://pay.paypay.ne.jp/'))return interaction.reply({content:'❌ PayPay受け取りURLを入力してください。',ephemeral:true});
      const id=store.nextOrderId++;
      const order={id,guildId:interaction.guildId,shopId:Number(shopId),productId,userId:interaction.user.id,buyerUsername:interaction.user.username,buyerDisplayName:interaction.user.globalName||interaction.user.username,qty,total:p.price*qty,paypay,status:'pending',createdAt:new Date().toISOString(),ticketChannelId:null};
      store.orders[id]=order;

      // 購入者・販売者・BOTだけが閲覧できる購入専用チケット
      let ticketChannel=null;
      try{
        const g=guildData(store,interaction.guildId);
        const safeName=`purchase-${id}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9ぁ-んァ-ヶ一-龠_-]/g,'-').slice(0,90);
        const overwrites=[
          {id:interaction.guild.id,deny:[PermissionFlagsBits.ViewChannel]},
          {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
          {id:shop.ownerId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
          {id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]}
        ];
        ticketChannel=await interaction.guild.channels.create({
          name:safeName,
          type:ChannelType.GuildText,
          parent:g.ticketCategoryId||undefined,
          permissionOverwrites:overwrites,
          reason:`自動販売機 注文 #${id}`
        });
        order.ticketChannelId=ticketChannel.id;
      }catch(e){console.error('purchase ticket create',e);}

      saveStore(store);
      const orderEmbed=new EmbedBuilder()
        .setTitle(`💰 注文 #${id}`)
        .setDescription(`販売者: <@${shop.ownerId}>\n購入者: <@${interaction.user.id}>（${interaction.user.username} / ID: ${interaction.user.id}）\n商品: **${p.name}**\n数量: **${qty}**\n合計: **¥${order.total.toLocaleString()}**\n配布方式: **${p.deliveryMode==='zip'?'ZIP':p.deliveryMode==='gigafile'?'ギガファイル便':p.deliveryMode==='url'?'URL':'手動'}**\nPayPay: ${paypay}`)
        .setTimestamp();
      if(p.imageUrl&&validHttpUrl(p.imageUrl))orderEmbed.setThumbnail(p.imageUrl);
      const controls=new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('PayPayリンクを開く').setStyle(ButtonStyle.Link).setURL(paypay),
        new ButtonBuilder().setCustomId(`order:${id}:complete`).setLabel('受け取り完了・商品配布').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`order:${id}:reject`).setLabel('却下').setStyle(ButtonStyle.Danger)
      );

      if(ticketChannel)await ticketChannel.send({content:`<@${shop.ownerId}> <@${interaction.user.id}>`,embeds:[orderEmbed],components:[controls]}).catch(()=>{});

      const notifyCh=interaction.guild.channels.cache.get(shop.orderChannelId||interaction.channelId);
      if(notifyCh)await notifyCh.send({
        content:`📩 <@${shop.ownerId}> 自動販売機「${shop.name}」に新しい注文があります。${ticketChannel?` 購入チケット: <#${ticketChannel.id}>`:''}`,
        embeds:[new EmbedBuilder().setTitle(`注文 #${id}`).setDescription(`商品: ${p.name} × ${qty}\n合計: ¥${order.total.toLocaleString()}\n購入者: <@${interaction.user.id}>`)]
      }).catch(()=>{});

      const historyChannelId=shop.historyChannelId||shop.orderChannelId;
      if(historyChannelId){
        const historyCh=interaction.guild.channels.cache.get(historyChannelId)||await interaction.guild.channels.fetch(historyChannelId).catch(()=>null);
        if(historyCh?.isTextBased())await historyCh.send({embeds:[new EmbedBuilder().setTitle(`🧾 購入履歴 #${id}`).addFields({name:'購入者',value:`<@${interaction.user.id}> / ${interaction.user.username} / ID: ${interaction.user.id}`},{name:'商品',value:`${p.name} × ${qty}`},{name:'合計',value:`¥${order.total.toLocaleString()}`},{name:'日時',value:new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})})]}).catch(()=>{});
      }

      const seller=await client.users.fetch(shop.ownerId).catch(()=>null);
      await seller?.send(`📩 自動販売機「${shop.name}」で商品が購入されました。\n注文 #${id}\n購入者: ${interaction.user.username} / <@${interaction.user.id}> / ID: ${interaction.user.id}\n商品: ${p.name} × ${qty}\n合計: ¥${order.total.toLocaleString()}${ticketChannel?`\n購入チケット: https://discord.com/channels/${interaction.guildId}/${ticketChannel.id}`:''}`).catch(()=>{});

      return interaction.reply({content:`✅ 注文 #${id} を送信しました。合計 ¥${order.total.toLocaleString()} です。${ticketChannel?`\n販売者との専用チケット: <#${ticketChannel.id}>`:'\n⚠️ 専用チケット作成に失敗したため、販売者へ通知しました。'}`,ephemeral:true});
    }
  } catch (e) {
    console.error('❌ Interaction処理エラー:', e);
    if(interaction.isRepliable()){
      const m={content:`❌ エラーが発生しました: **${e?.name||'Error'}**\n${String(e?.message||e).slice(0,1200)}`,ephemeral:true};
      if(interaction.replied||interaction.deferred)interaction.followUp(m).catch(()=>{});else interaction.reply(m).catch(()=>{});
    }
  }
});

async function playNext(key){
  const s=players.get(key);
  if(!s||s.playing||!s.queue.length)return;
  const track=s.queue.shift();
  try{
    const {proc,resource}=createFfmpegAudio(track.streamUrl);
    s.current=track;s.playing=true;s.ffmpeg=proc;s.startedAt=Date.now();
    resource.volume?.setVolume((s.volume??100)/100);recordTrackStart(s.guildId,track);
    proc.on('error',e=>{console.error('ffmpeg process error',e);s.playing=false;s.current=null;s.ffmpeg=null;try{s.player.stop(true);}catch{}});
    proc.on('close',code=>{if(code&&code!==0)console.error(`ffmpeg exited: ${code}`);});
    s.player.play(resource);
  }catch(e){s.current=null;s.playing=false;s.ffmpeg=null;console.error('playNext',e);return playNext(key);}
}

// 再生中VCの実リスナー滞在時間を60秒ごとに統計へ加算
setInterval(()=>{
  let changed=false;
  for(const s of players.values()){
    if(!s.playing)continue;
    const guild=client.guilds.cache.get(s.guildId);const vc=guild?.channels.cache.get(s.voiceChannelId);if(!vc?.members)continue;
    const st=musicStats(s.guildId);
    for(const member of vc.members.values()){
      if(member.user.bot)continue;
      const u=st.users[member.id]??={name:member.user.username,seconds:0};u.seconds+=60;u.name=member.user.username;changed=true;
    }
  }
  if(changed)saveStore(store);
},60000);

setInterval(async()=>{
  const now=Date.now();let changed=false;
  for(const s of store.schedules){
    if(s.done||new Date(s.at).getTime()>now)continue;
    try{
      const ch=await client.channels.fetch(s.channelId);
      if(ch?.isTextBased()){
        const sent=await ch.send(s.message);
        if(s.deleteAfterMinutes)setTimeout(()=>sent.delete().catch(()=>{}),s.deleteAfterMinutes*60000);
      }
      s.done=true;changed=true;
    }catch(e){console.error(e);}
  }
  if(changed)saveStore(store);
},15000);

// ギガファイル便URL期限監視: 残り24時間以内で販売者へ1回通知
setInterval(async()=>{
  const now=Date.now();
  for(const shop of Object.values(store.shops||{})){
    if(!shop?.active)continue;
    for(const p of shop.products||[]){
      if(!p.gigafileUrl||!p.gigafileExpiresAt||p.gigafileExpiryNotifiedAt)continue;
      const expires=new Date(p.gigafileExpiresAt).getTime(),remaining=expires-now;
      if(!Number.isFinite(expires)||remaining<=0||remaining>86400000)continue;
      const owner=await client.users.fetch(shop.ownerId).catch(()=>null);
      const expiryText=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'medium',timeStyle:'short'}).format(new Date(expires));
      await owner?.send(`⚠️ ギガファイル便URLの期限が残り1日以内です。\n自動販売機: ${shop.name} (#${shop.id})\n商品: ${p.name} (#${p.id})\n期限: ${expiryText}\n\n商品の他の設定は変更せず、URLのみ更新してください。\n/product-url-update shop_id:${shop.id} product_id:${p.id} gigafile_url:<新URL> url_expiry_days:<日数>`).catch(()=>{});
      const guild=client.guilds.cache.get(shop.guildId);
      const ch=guild?.channels.cache.get(shop.orderChannelId)||(guild?await guild.channels.fetch(shop.orderChannelId).catch(()=>null):null);
      if(ch?.isTextBased())await ch.send({content:`⚠️ <@${shop.ownerId}> **${p.name}** のギガファイル便URL期限が残り1日以内です。URLのみ更新してください。`}).catch(()=>{});
      p.gigafileExpiryNotifiedAt=new Date().toISOString();saveStore(store);
    }
  }
},60*60*1000);

// SNS最新情報: Twitter/X・YouTube・Instagram RSSを60秒ごとに確認
let socialWatcherBusy=false;
setInterval(async()=>{
  if(socialWatcherBusy)return;
  socialWatcherBusy=true;
  try{
  for(const guild of client.guilds.cache.values()){
    const g=guildData(store,guild.id);
    if(!g.socialSources?.length)continue;
    g.socialSeen??={};
    for(const source of g.socialSources){
      if(source.enabled===false||source.active===false)continue;
      try{
        const feed=await fetchSocialSource(source);
        source.lastError=null;
        const items=(feed.items||[]).slice(0,20),seen=new Set(g.socialSeen[source.id]||[]);
        const fresh=items.filter(i=>!seen.has(newsItemKey(i))).reverse();
        if(!fresh.length)continue;
        const ch=guild.channels.cache.get(source.channelId)||await guild.channels.fetch(source.channelId).catch(()=>null);
        if(!ch?.isTextBased())continue;
        for(const item of fresh.slice(-10)){
          await ch.send({content:`📡 **${source.platform} / 最新情報**`,embeds:[newsEmbed({name:source.name||source.platform},item)]});
          seen.add(newsItemKey(item));
          g.socialSeen[source.id]=[...seen].slice(-100);
          saveStore(store);
        }
      }catch(e){source.lastError=String(e.message||e).slice(0,300);saveStore(store);console.error(`social watcher ${guild.id}/${source.id}`,e);}
    }
  }
  }finally{socialWatcherBusy=false;}
},60*1000);

// NEWS ALERTS: RSS/Atomを60秒ごとに確認
setInterval(async()=>{
  for(const guild of client.guilds.cache.values()){
    const g=guildData(store,guild.id);
    if(!g.newsAutoEnabled||!g.newsSources?.length)continue;
    g.newsSeen??={};
    for(const source of g.newsSources){
      try{
        const feed=await fetchNewsFeed(source),items=(feed.items||[]).slice(0,20),seen=new Set(g.newsSeen[source.id]||[]);
        const fresh=items.filter(i=>!seen.has(newsItemKey(i))).reverse();
        if(!fresh.length)continue;
        const ch=guild.channels.cache.get(source.channelId)||await guild.channels.fetch(source.channelId).catch(()=>null);
        if(!ch?.isTextBased())continue;
        for(const item of fresh.slice(-10))await ch.send({content:`📰 **${source.name} / 新着ニュース**`,embeds:[newsEmbed(source,item)]});
        g.newsSeen[source.id]=[...new Set([...items.map(newsItemKey),...seen])].slice(0,100);saveStore(store);
      }catch(e){console.error(`news watcher ${guild.id}/${source.id}`,e);}
    }
  }
},60*1000);

let earthquakeWatcherBusy=false;
async function runEarthquakeWatcher(){
  if(earthquakeWatcherBusy)return;
  earthquakeWatcherBusy=true;
  try{
    const item=await fetchLatestEarthquake();
    if(!item)return;
    const eventId=String(item.id || item._id || item.time || JSON.stringify(item).slice(0,80));

    // 起動直後は現在の最新イベントを基準値にする。以後の新着のみ通知。
    if(store.lastEarthquakeEventId===null){
      store.lastEarthquakeEventId=eventId;saveStore(store);
      console.log(`🌏 地震監視開始: 基準イベント ${eventId}`);
      return;
    }
    if(store.lastEarthquakeEventId===eventId)return;
    store.lastEarthquakeEventId=eventId;saveStore(store);

    const e=item.earthquake,maxN=scaleToNumber(e?.maxScale);
    const areaText=(item.points||[]).map(p=>p.pref||p.addr||'').join(' ');
    for(const guild of client.guilds.cache.values()){
      const g=guildData(store,guild.id);
      const jobs=[...(g.earthquakeJobs||[])];
      // 従来の1件設定も互換維持。複数設定がある場合は両方を処理する。
      if(g.earthquakeAutoEnabled&&g.earthquakeChannelId)jobs.push({id:'legacy',regions:g.earthquakeRegions||[],channelId:g.earthquakeChannelId,minIntensity:g.minIntensity||3});
      const sentChannels=new Set();
      for(const job of jobs){
        if(maxN<Number(job.minIntensity||3))continue;
        const targets=job.regions||[];
        if(targets.length>0&&!targets.some(r=>areaText.includes(r.replace(/[都道府県]$/,''))))continue;
        // 同じイベントを同じチャンネルへ二重送信しない。
        if(sentChannels.has(job.channelId))continue;
        const ch=guild.channels.cache.get(job.channelId)||await guild.channels.fetch(job.channelId).catch(()=>null);
        if(!ch?.isTextBased()){console.warn(`⚠️ 地震自動通知 ${guild.id}: channel ${job.channelId} を取得できません`);continue;}
        try{await ch.send(earthquakeText(item));sentChannels.add(job.channelId);console.log(`🚨 地震速報を投稿: ${guild.name} / ${ch.name} / 設定#${job.id}`);}
        catch(err){console.error(`❌ 地震速報投稿失敗 ${guild.id}/#${job.id}`,err);}
      }
    }
  }catch(e){console.error('❌ earthquake watcher',e);}
  finally{earthquakeWatcherBusy=false;}
}

let weatherWatcherBusy=false;
async function runWeatherWatcher(){
  if(weatherWatcherBusy)return;
  weatherWatcherBusy=true;
  try{
    const now=new Date();
    const parts=new Intl.DateTimeFormat('ja-JP',{
      timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',hour12:false,hourCycle:'h23'
    }).formatToParts(now);
    const get=(type)=>parts.find(p=>p.type===type)?.value;
    const currentTime=`${get('hour')}:${get('minute')}`;
    const dateKey=`${get('year')}-${get('month')}-${get('day')}`;

    for(const guild of client.guilds.cache.values()){
      const g=guildData(store,guild.id);
      for(const job of (g.weatherJobs||[])){
        if(currentTime<job.time || job.lastSent===dateKey)continue;
        try{
          const ch=await guild.channels.fetch(job.channelId).catch(()=>null);
          if(!ch?.isTextBased())continue;
          const pages=await buildWeatherPages(job.regions);
          for(const page of pages)await ch.send(page).catch(e=>{throw new Error(`Discord投稿失敗: ${e.message||e}`)});
          job.lastSent=dateKey;saveStore(store);
          console.log(`🌤️ 天気追加設定 #${job.id} 投稿成功`);
        }catch(error){console.error(`❌ 天気追加設定 #${job.id}`,error);}
      }
      if(!g.weatherAutoEnabled)continue;
      if(!(g.weatherRegions||[]).length){console.warn(`⚠️ 天気自動投稿 ${guild.id}: 地域未登録`);continue;}
      const postTime=g.weatherAutoTime||'07:00';
      if(currentTime<postTime||g.lastWeatherPostDate===dateKey)continue;

      g.weatherChannelRoutes??={};
      const groups=new Map();
      for(const pref of g.weatherRegions){
        const channelId=g.weatherChannelRoutes[pref]||g.weatherChannelId;
        if(!channelId)continue;
        if(!groups.has(channelId))groups.set(channelId,[]);
        groups.get(channelId).push(pref);
      }
      if(!groups.size){console.warn(`⚠️ 天気自動投稿 ${guild.id}: 投稿先未設定`);continue;}

      g.weatherLastSentByChannel??={};
      let allSucceeded=true;
      for(const [channelId,regions] of groups){
        // 同じ日の投稿に成功済みのチャンネルは再送しない。失敗したチャンネルだけ15秒後に再試行する。
        if(g.weatherLastSentByChannel[channelId]===dateKey)continue;
        try{
          const ch=guild.channels.cache.get(channelId)||await guild.channels.fetch(channelId).catch(()=>null);
          if(!ch?.isTextBased())throw new Error(`投稿先 channel ${channelId} を取得できません`);
          const pages=await buildWeatherPages(regions);
          if(!pages.length)throw new Error('天気ページを生成できませんでした');
          for(const page of pages)await ch.send(page);
          g.weatherLastSentByChannel[channelId]=dateKey;
          saveStore(store);
          console.log(`🌤️ 天気予報を自動投稿: ${guild.name} / ${ch.name} / ${regions.length}地域`);
        }catch(error){
          allSucceeded=false;
          console.error(`❌ 天気自動投稿 ${guild.name} / channel ${channelId}:`,error);
        }
      }
      const pending=[...groups.keys()].filter(id=>g.weatherLastSentByChannel[id]!==dateKey);
      if(allSucceeded && pending.length===0){
        g.lastWeatherPostDate=dateKey;
        saveStore(store);
        console.log(`✅ 天気自動投稿 完了: ${guild.name} / ${dateKey}`);
      }else if(pending.length){
        console.warn(`⚠️ 天気自動投稿 再試行待ち: ${guild.name} / ${pending.length}チャンネル`);
      }
    }
  }catch(e){console.error('❌ weather auto watcher',e);}
  finally{weatherWatcherBusy=false;}
}

client.once(Events.ClientReady,async readyClient=>{
  console.log(`✅ Discordログイン完了: ${readyClient.user.tag} / ${readyClient.user.id}`);
  console.log(`🌤️ 天気自動投稿監視: 15秒間隔 / JST`);
  console.log(`🌏 地震速報監視: 約${config.earthquakePollSeconds}秒間隔`);
  // setIntervalの重なりを避ける自己復帰型スケジューラ。
  // 1回失敗しても次回監視を必ず予約するため、更新系が止まりにくい。
  const scheduleLoop=(name,fn,delay)=>{
    const tick=async()=>{
      try{await fn();}catch(e){console.error(`❌ ${name} loop`,e);}
      finally{setTimeout(tick,delay);}
    };
    tick();
  };
  scheduleLoop('earthquake',runEarthquakeWatcher,Math.max(5000,config.earthquakePollSeconds*1000));
  scheduleLoop('weather',runWeatherWatcher,15000);
});


const extraMusicTokens=[process.env.MUSIC_BOT_TOKEN_2,process.env.MUSIC_BOT_TOKEN_3,process.env.MUSIC_BOT_TOKEN_4].filter(Boolean);
for(const [i,token] of extraMusicTokens.entries()){
  const c=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates]});
  c.once(Events.ClientReady,()=>console.log(`🎵 追加音楽BOT ${i+2} ログイン: ${c.user.tag}`));
  c.login(token).catch(e=>console.error(`❌ 追加音楽BOT ${i+2} ログイン失敗`,e));musicBotClients.push(c);
}

client.login(config.token);
