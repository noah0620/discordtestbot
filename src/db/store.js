import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const dir = path.resolve(config.dataDir);
const file = path.join(dir, 'store.json');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

function initial() {
  return {
    guilds: {},
    shops: {},
    orders: {},
    schedules: [],
    moderationRules: [],
    verificationRequests: {},
    nextVerificationRequestId: 1,
    tickets: {},
    nextTicketId: 1,
    nextShopId: 1,
    nextOrderId: 1,
    nextScheduleId: 1,
    nextRuleId: 1,
    lastEarthquakeEventId: null
  };
}

export function loadStore() {
  if (!fs.existsSync(file)) {
    const s = initial();
    fs.writeFileSync(file, JSON.stringify(s, null, 2), 'utf8');
    return s;
  }
  try {
    return { ...initial(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch {
    const s = initial();
    fs.writeFileSync(file, JSON.stringify(s, null, 2), 'utf8');
    return s;
  }
}
export function saveStore(store) {
  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
}
export function guildData(store, guildId) {
  store.guilds[guildId] ??= {
    joinLogChannelId: null,
    joinTitle: '📥 メンバー参加',
    verificationPanelChannelId: null,
    mediaLibrary: [],
    nextMediaId: 1,
    leaveLogChannelId: null,
    adminRoleId: null,
    adminRoleIds: [],
    verificationRoleId: null,
    verificationReviewChannelId: null,
    ticketCategoryId: null,
    ticketSupportRoleId: null,
    ticketLogChannelId: null,
    roleOptions: [],
    rolePanels: {},
    verificationPanels: {},
    earthquakeChannelId: null,
    weatherChannelId: null,
    autoReplies: {},
    socialSources: [],
    nextSocialSourceId: 1,
    socialSeen: {},
    newsAutoEnabled: false,
    newsSources: [],
    nextNewsSourceId: 1,
    newsSeen: {},
    weatherRegions: [],
    weatherChannelRoutes: {},
    earthquakeRegions: [],
    minIntensity: 3,
    weatherAutoEnabled: false,
    weatherAutoTime: '07:00',
    earthquakeAutoEnabled: false,
    earthquakeJobs: [],
    lastWeatherPostDate: null,
    weatherSetupUpdatedAt: null,
    earthquakeSetupUpdatedAt: null,
    musicStats: { users: {}, tracks: {}, totalPlays: 0 }
  };
  const g = store.guilds[guildId];
  g.joinTitle ??= '📥 メンバー参加';
  g.verificationPanelChannelId ??= null;
  g.mediaLibrary ??= [];
  g.nextMediaId ??= 1;
  g.weatherAutoTime ??= '07:00';
  g.weatherAutoEnabled ??= false;
  g.earthquakeAutoEnabled ??= false;
  g.earthquakeJobs ??= [];
  g.minIntensity ??= 3;
  g.socialSources ??= [];
  g.nextSocialSourceId ??= 1;
  g.socialSeen ??= {};
  g.newsAutoEnabled ??= false;
  g.newsSources ??= [];
  g.nextNewsSourceId ??= 1;
  g.newsSeen ??= {};
  g.weatherRegions ??= [];
  g.weatherChannelRoutes ??= {};
  g.weatherLastSentByChannel ??= {};
  g.earthquakeRegions ??= [];
  g.weatherSetupUpdatedAt ??= null;
  g.earthquakeSetupUpdatedAt ??= null;
  g.musicStats ??= { users: {}, tracks: {}, totalPlays: 0 };
  g.musicStats.users ??= {}; g.musicStats.tracks ??= {}; g.musicStats.totalPlays ??= 0;
  g.autoReplies ??= {};
  g.adminRoleId ??= null;
  g.adminRoleIds ??= [];
  // 旧版の単一管理者ロール設定を自動移行
  if (g.adminRoleId && !g.adminRoleIds.includes(g.adminRoleId)) g.adminRoleIds.push(g.adminRoleId);
  g.verificationReviewChannelId ??= null;
  g.ticketCategoryId ??= null;
  g.ticketSupportRoleId ??= null;
  g.ticketLogChannelId ??= null;
  g.roleOptions ??= [];
  g.rolePanels ??= {};
  g.verificationPanels ??= {};
  store.verificationRequests ??= {};
  store.nextVerificationRequestId ??= 1;
  store.tickets ??= {};
  store.nextTicketId ??= 1;
  return g;
}
