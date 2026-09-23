import { REST, Routes } from 'discord.js';
import { config, assertConfig } from './config.js';
assertConfig();
const rest = new REST({ version: '10' }).setToken(config.token);
await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
console.log('✅ Global commands cleared');
