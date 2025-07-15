// Separate script to register slash commands
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    GUILD_ID: process.env.GUILD_ID // Optional: for guild-specific commands
};

const commands = [
    new SlashCommandBuilder()
        .setName('track')
        .setDescription('Add a user to the monitoring list')
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('Platform to monitor')
                .setRequired(true)
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'Twitch', value: 'twitch' },
                    { name: 'TikTok', value: 'tiktok' },
                    { name: 'Kick', value: 'kick' }
                ))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Username to monitor')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('display_name')
                .setDescription('Display name for notifications')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove a user from the monitoring list')
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('Platform')
                .setRequired(true)
                .addChoices(
                    { name: 'YouTube', value: 'youtube' },
                    { name: 'Twitch', value: 'twitch' },
                    { name: 'TikTok', value: 'tiktok' },
                    { name: 'Kick', value: 'kick' }
                ))
        .addStringOption(option =>
            option.setName('username')
                .setDescription('Username to remove')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('list')
        .setDescription('List all monitored users'),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Test if the bot is responding')
];

async function registerCommands() {
    if (!CONFIG.DISCORD_TOKEN || !CONFIG.DISCORD_CLIENT_ID) {
        console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env file');
        process.exit(1);
    }

    const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);

    try {
        console.log('🔄 Started refreshing application (/) commands.');
        console.log(`📋 Registering ${commands.length} commands...`);

        let data;
        
        if (CONFIG.GUILD_ID) {
            // Register guild-specific commands (instant)
            console.log(`📍 Registering commands for guild: ${CONFIG.GUILD_ID}`);
            data = await rest.put(
                Routes.applicationGuildCommands(CONFIG.DISCORD_CLIENT_ID, CONFIG.GUILD_ID),
                { body: commands.map(command => command.toJSON()) },
            );
        } else {
            // Register global commands (takes up to 1 hour to propagate)
            console.log('🌍 Registering global commands (may take up to 1 hour to appear)');
            data = await rest.put(
                Routes.applicationCommands(CONFIG.DISCORD_CLIENT_ID),
                { body: commands.map(command => command.toJSON()) },
            );
        }

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        
        data.forEach(cmd => {
            console.log(`   /${cmd.name} - ${cmd.description}`);
        });

        console.log('\n📝 Next steps:');
        console.log('1. Wait a few minutes for commands to sync');
        console.log('2. Type "/" in Discord to see available commands');
        console.log('3. If commands don\'t appear, check bot permissions');
        
    } catch (error) {
        console.error('❌ Error registering commands:', error);
        
        if (error.status === 401) {
            console.error('🔑 Invalid bot token - check your DISCORD_TOKEN');
        } else if (error.status === 403) {
            console.error('🚫 Bot lacks permissions - check bot permissions in server');
        } else if (error.status === 404) {
            console.error('🔍 Invalid client ID - check your DISCORD_CLIENT_ID');
        }
    }
}

// Check if we want to clear commands first
if (process.argv.includes('--clear')) {
    console.log('🗑️  Clearing existing commands...');
    registerCommands().then(() => {
        console.log('Commands cleared and re-registered');
    });
} else {
    registerCommands();
}