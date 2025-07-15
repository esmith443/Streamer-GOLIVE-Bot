const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

// Load environment variables
require('dotenv').config();

// Configuration
const CONFIG = {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET,
    WEBHOOK_URL: process.env.WEBHOOK_URL,
    CHECK_INTERVAL: 5 * 60 * 1000, // 5 minutes
    DATA_FILE: 'monitored_users.json'
};

// Validate required environment variables
function validateConfig() {
    const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
    const missing = required.filter(key => !CONFIG[key]);
    
    if (missing.length > 0) {
        console.error('Missing required environment variables:', missing);
        console.error('Please check your .env file and ensure these variables are set');
        process.exit(1);
    }
    
    console.log('✓ Required Discord configuration found');
}

class StreamMonitorBot {
    constructor() {
        this.client = new Client({
            intents: [GatewayIntentBits.Guilds]
        });
        this.monitoredUsers = new Map();
        this.liveStatus = new Map();
        this.twitchToken = null;
        this.checkInterval = null;
        this.lastKickRequest = 0;
        this.kickRequestDelay = 3000; // 3 seconds between Kick requests
        
        this.init();
    }

    async init() {
        // Validate configuration first
        validateConfig();
        
        await this.loadMonitoredUsers();
        await this.setupCommands();
        this.setupEventHandlers();
        await this.client.login(CONFIG.DISCORD_TOKEN);
    }

    async loadMonitoredUsers() {
        try {
            const data = await fs.readFile(CONFIG.DATA_FILE, 'utf8');
            const users = JSON.parse(data);
            this.monitoredUsers = new Map(users);
            console.log(`Loaded ${this.monitoredUsers.size} monitored users`);
        } catch (error) {
            console.log('No existing data file found, starting fresh');
            this.monitoredUsers = new Map();
        }
    }

    async saveMonitoredUsers() {
        try {
            const data = Array.from(this.monitoredUsers.entries());
            await fs.writeFile(CONFIG.DATA_FILE, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving monitored users:', error);
        }
    }

    async setupCommands() {
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

        const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);

        try {
            console.log('Refreshing slash commands...');
            console.log(`Registering commands for client ID: ${CONFIG.DISCORD_CLIENT_ID}`);
            
            const data = await rest.put(
                Routes.applicationCommands(CONFIG.DISCORD_CLIENT_ID),
                { body: commands.map(command => command.toJSON()) }
            );
            
            console.log(`Successfully registered ${data.length} slash commands`);
            data.forEach(cmd => console.log(`  - /${cmd.name}: ${cmd.description}`));
        } catch (error) {
            console.error('Error registering slash commands:', error);
            if (error.status === 401) {
                console.error('❌ Invalid bot token or client ID');
            } else if (error.status === 403) {
                console.error('❌ Bot lacks permission to register commands');
            }
        }
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            console.log(`Bot is ready! Logged in as ${this.client.user.tag}`);
            this.startMonitoring();
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const { commandName } = interaction;

            try {
                switch (commandName) {
                    case 'track':
                        await this.handleTrackCommand(interaction);
                        break;
                    case 'remove':
                        await this.handleRemoveCommand(interaction);
                        break;
                    case 'list':
                        await this.handleListCommand(interaction);
                        break;
                    case 'ping':
                        await this.handlePingCommand(interaction);
                        break;
                }
            } catch (error) {
                console.error('Error handling command:', error);
                await interaction.reply({ content: 'An error occurred while processing your command.', ephemeral: true });
            }
        });
    }

    async handleTrackCommand(interaction) {
        const platform = interaction.options.getString('platform');
        const username = interaction.options.getString('username');
        const displayName = interaction.options.getString('display_name') || username;

        const key = `${platform}:${username}`;
        
        if (this.monitoredUsers.has(key)) {
            await interaction.reply({ content: `${username} on ${platform} is already being monitored!`, ephemeral: true });
            return;
        }

        // Validate input based on platform
        const validationResult = await this.validateUser(platform, username);
        if (!validationResult.valid) {
            await interaction.reply({ 
                content: `❌ ${validationResult.message}`, 
                ephemeral: true 
            });
            return;
        }

        this.monitoredUsers.set(key, {
            platform,
            username,
            displayName,
            addedAt: new Date().toISOString(),
            resolvedId: validationResult.resolvedId // Store resolved channel ID for YouTube
        });

        await this.saveMonitoredUsers();
        await interaction.reply({ 
            content: `✅ Now monitoring **${displayName}** on ${platform}!\n${validationResult.note || ''}`, 
            ephemeral: true 
        });
    }

    async validateUser(platform, username) {
        switch (platform) {
            case 'youtube':
                return await this.validateYouTubeUser(username);
            case 'twitch':
                return await this.validateTwitchUser(username);
            case 'tiktok':
                return { valid: true, message: 'TikTok user added (limited functionality)' };
            case 'kick':
                return { valid: true, message: 'Kick user added' };
            default:
                return { valid: false, message: 'Unsupported platform' };
        }
    }

    async validateYouTubeUser(username) {
        if (!CONFIG.YOUTUBE_API_KEY) {
            return { 
                valid: false, 
                message: 'YouTube API key not configured' 
            };
        }

        try {
            let channelId = username;
            let note = '';

            // Try to resolve channel if it's not already an ID
            if (!username.startsWith('UC')) {
                channelId = await this.resolveYouTubeChannel(username);
                if (!channelId) {
                    return { 
                        valid: false, 
                        message: `Could not find YouTube channel: ${username}. Try using the channel ID instead.` 
                    };
                }
                note = `Resolved to channel ID: ${channelId}`;
            }

            return { 
                valid: true, 
                resolvedId: channelId,
                note: note
            };
        } catch (error) {
            return { 
                valid: false, 
                message: `Error validating YouTube channel: ${error.message}` 
            };
        }
    }

    async validateTwitchUser(username) {
        if (!CONFIG.TWITCH_CLIENT_ID || !CONFIG.TWITCH_CLIENT_SECRET) {
            return { 
                valid: false, 
                message: 'Twitch API credentials not configured' 
            };
        }

        try {
            if (!this.twitchToken) {
                await this.getTwitchToken();
            }

            const response = await axios.get(`https://api.twitch.tv/helix/users`, {
                params: {
                    login: username
                },
                headers: {
                    'Client-ID': CONFIG.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${this.twitchToken}`
                }
            });

            if (response.data.data.length === 0) {
                return { 
                    valid: false, 
                    message: `Twitch user "${username}" not found` 
                };
            }

            return { valid: true };
        } catch (error) {
            return { 
                valid: false, 
                message: `Error validating Twitch user: ${error.message}` 
            };
        }
    }

    async handleRemoveCommand(interaction) {
        const platform = interaction.options.getString('platform');
        const username = interaction.options.getString('username');
        const key = `${platform}:${username}`;

        if (!this.monitoredUsers.has(key)) {
            await interaction.reply({ content: `${username} on ${platform} is not being monitored.`, ephemeral: true });
            return;
        }

        this.monitoredUsers.delete(key);
        this.liveStatus.delete(key);
        await this.saveMonitoredUsers();
        await interaction.reply({ content: `Removed ${username} from ${platform} monitoring.`, ephemeral: true });
    }

    async handleListCommand(interaction) {
        if (this.monitoredUsers.size === 0) {
            await interaction.reply({ content: 'No users are currently being monitored.', ephemeral: true });
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📺 Monitored Users')
            .setColor(0x00AE86)
            .setTimestamp();

        const platforms = {};
        for (const [key, user] of this.monitoredUsers) {
            if (!platforms[user.platform]) {
                platforms[user.platform] = [];
            }
            const status = this.liveStatus.get(key) ? '🔴 LIVE' : '⚫ Offline';
            platforms[user.platform].push(`${status} ${user.displayName} (${user.username})`);
        }

        for (const [platform, users] of Object.entries(platforms)) {
            embed.addFields({
                name: `${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
                value: users.join('\n') || 'None',
                inline: true
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handlePingCommand(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🏓 Pong!')
            .setDescription('Bot is online and responding to commands')
            .setColor(0x00FF00)
            .addFields(
                { name: 'Latency', value: `${Date.now() - interaction.createdTimestamp}ms`, inline: true },
                { name: 'Monitored Users', value: `${this.monitoredUsers.size}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    startMonitoring() {
        console.log('Starting stream monitoring...');
        this.checkAllStreams();
        this.checkInterval = setInterval(() => {
            this.checkAllStreams();
        }, CONFIG.CHECK_INTERVAL);
    }

    async checkAllStreams() {
        console.log('Checking all streams...');
        
        for (const [key, user] of this.monitoredUsers) {
            try {
                const isLive = await this.checkStreamStatus(user.platform, user.username);
                const wasLive = this.liveStatus.get(key) || false;

                if (isLive && !wasLive) {
                    console.log(`${user.displayName} went live on ${user.platform}!`);
                    await this.sendLiveNotification(user);
                    this.liveStatus.set(key, true);
                } else if (!isLive && wasLive) {
                    console.log(`${user.displayName} went offline on ${user.platform}`);
                    this.liveStatus.set(key, false);
                }
            } catch (error) {
                console.error(`Error checking ${user.username} on ${user.platform}:`, error);
            }
        }
    }

    async checkStreamStatus(platform, username) {
        switch (platform) {
            case 'youtube':
                return await this.checkYouTubeLive(username);
            case 'twitch':
                return await this.checkTwitchLive(username);
            case 'tiktok':
                return await this.checkTikTokLive(username);
            case 'kick':
                return await this.checkKickLive(username);
            default:
                return false;
        }
    }

    async checkYouTubeLive(channelInput) {
        if (!CONFIG.YOUTUBE_API_KEY) {
            console.log('YouTube API key not configured');
            return false;
        }

        try {
            let channelId = channelInput;
            
            // If the input doesn't look like a channel ID (UC...), try to resolve it
            if (!channelInput.startsWith('UC')) {
                channelId = await this.resolveYouTubeChannel(channelInput);
                if (!channelId) {
                    console.error(`Could not resolve YouTube channel: ${channelInput}`);
                    return false;
                }
            }

            const response = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
                params: {
                    part: 'snippet',
                    channelId: channelId,
                    eventType: 'live',
                    type: 'video',
                    key: CONFIG.YOUTUBE_API_KEY
                }
            });
            return response.data.items.length > 0;
        } catch (error) {
            console.error(`YouTube API error for ${channelInput}:`, error.response?.data?.error?.message || error.message);
            return false;
        }
    }

    async resolveYouTubeChannel(input) {
        try {
            // First try to search for the channel by username/handle
            const searchResponse = await axios.get(`https://www.googleapis.com/youtube/v3/search`, {
                params: {
                    part: 'snippet',
                    q: input,
                    type: 'channel',
                    maxResults: 1,
                    key: CONFIG.YOUTUBE_API_KEY
                }
            });

            if (searchResponse.data.items.length > 0) {
                return searchResponse.data.items[0].snippet.channelId;
            }

            // If search fails, try the channels endpoint with forUsername
            const channelResponse = await axios.get(`https://www.googleapis.com/youtube/v3/channels`, {
                params: {
                    part: 'id',
                    forUsername: input,
                    key: CONFIG.YOUTUBE_API_KEY
                }
            });

            if (channelResponse.data.items.length > 0) {
                return channelResponse.data.items[0].id;
            }

            return null;
        } catch (error) {
            console.error(`Error resolving YouTube channel ${input}:`, error.response?.data?.error?.message || error.message);
            return null;
        }
    }

    async checkTwitchLive(username) {
        try {
            if (!this.twitchToken) {
                await this.getTwitchToken();
            }

            const response = await axios.get(`https://api.twitch.tv/helix/streams`, {
                params: {
                    user_login: username
                },
                headers: {
                    'Client-ID': CONFIG.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${this.twitchToken}`
                }
            });

            return response.data.data.length > 0;
        } catch (error) {
            console.error('Twitch API error:', error);
            return false;
        }
    }

    async getTwitchToken() {
        try {
            const response = await axios.post('https://id.twitch.tv/oauth2/token', {
                client_id: CONFIG.TWITCH_CLIENT_ID,
                client_secret: CONFIG.TWITCH_CLIENT_SECRET,
                grant_type: 'client_credentials'
            });
            this.twitchToken = response.data.access_token;
        } catch (error) {
            console.error('Error getting Twitch token:', error);
        }
    }

    async checkTikTokLive(username) {
        try {
            // TikTok doesn't have a public API, so we'll scrape the live page
            const url = `https://www.tiktok.com/@${username}/live`;
            
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 15000, // 15 second timeout
                maxRedirects: 5
            });

            const $ = cheerio.load(response.data);
            
            // Check for various indicators that the user is live
            const indicators = [
                // Look for live status in the page title
                $('title').text().toLowerCase().includes('live'),
                
                // Look for live indicators in meta tags
                $('meta[property="og:title"]').attr('content')?.toLowerCase().includes('live'),
                $('meta[name="description"]').attr('content')?.toLowerCase().includes('live'),
                
                // Look for live status in JSON-LD structured data
                $('script[type="application/ld+json"]').length > 0 && 
                $('script[type="application/ld+json"]').text().toLowerCase().includes('live'),
                
                // Look for specific TikTok live elements (these may change)
                $('.live-room').length > 0,
                $('[data-e2e="live-room"]').length > 0,
                $('.live-stream').length > 0,
                $('[data-testid="live-stream"]').length > 0,
                
                // Look for live text content
                $('body').text().toLowerCase().includes('is live'),
                $('body').text().toLowerCase().includes('live now'),
                
                // Check for specific TikTok live page elements
                $('.live-container').length > 0,
                $('[class*="live"]').length > 0 && $('[class*="room"]').length > 0
            ];
            
            const isLive = indicators.some(indicator => indicator);
            
            // Additional check: if the page redirects to the main profile, user is likely not live
            if (response.request.res.responseUrl && !response.request.res.responseUrl.includes('/live')) {
                return false;
            }
            
            // Log some debug info
            console.log(`TikTok live check for ${username}: ${isLive ? 'LIVE' : 'NOT LIVE'}`);
            
            return isLive;
            
        } catch (error) {
            if (error.response?.status === 404) {
                console.error(`TikTok user ${username} not found (404)`);
            } else if (error.response?.status === 403) {
                console.error(`TikTok blocked request for ${username} (403) - might need to use proxy`);
            } else if (error.code === 'ECONNABORTED') {
                console.error(`TikTok request timeout for ${username}`);
            } else {
                console.error(`TikTok API error for ${username}:`, error.response?.status || error.message);
            }
            return false;
        }
    }

    async checkKickLive(username) {
        // Implement rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastKickRequest;
        if (timeSinceLastRequest < this.kickRequestDelay) {
            await new Promise(resolve => setTimeout(resolve, this.kickRequestDelay - timeSinceLastRequest));
        }
        this.lastKickRequest = Date.now();

        try {
            // First try the API endpoint with enhanced headers
            const response = await this.tryKickAPI(username);
            if (response) {
                return response;
            }
            
            // If API fails, try web scraping as fallback
            console.log(`Kick API failed for ${username}, trying web scraping...`);
            return await this.tryKickWebScraping(username);
            
        } catch (error) {
            console.error(`All Kick methods failed for ${username}:`, error.message);
            return false;
        }
    }

    async tryKickAPI(username) {
        try {
            // Generate random-looking headers
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
            ];
            
            const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
            
            const response = await axios.get(`https://kick.com/api/v1/channels/${username}`, {
                headers: {
                    'User-Agent': randomUA,
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Referer': `https://kick.com/${username}`,
                    'Origin': 'https://kick.com'
                },
                timeout: 15000
            });
            
            return response.data.livestream !== null;
        } catch (error) {
            if (error.response?.status === 403) {
                console.log(`Kick API returned 403 for ${username}, trying alternative approach...`);
                return null; // Signal to try fallback method
            }
            throw error;
        }
    }

    async tryKickWebScraping(username) {
        try {
            const userAgents = [
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            ];
            
            const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
            
            const response = await axios.get(`https://kick.com/${username}`, {
                headers: {
                    'User-Agent': randomUA,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 15000,
                maxRedirects: 5
            });

            const $ = cheerio.load(response.data);
            
            // Look for live indicators in the HTML
            const liveIndicators = [
                // Check for live status in page title
                $('title').text().toLowerCase().includes('live'),
                
                // Check for meta tags indicating live status
                $('meta[property="og:title"]').attr('content')?.toLowerCase().includes('live'),
                $('meta[name="description"]').attr('content')?.toLowerCase().includes('live'),
                
                // Look for live elements in the page
                $('.live-indicator').length > 0,
                $('[data-testid="live-indicator"]').length > 0,
                $('.livestream-container').length > 0,
                
                // Check for live text content
                $('body').text().toLowerCase().includes('is live'),
                $('body').text().toLowerCase().includes('live now'),
                
                // Look for video player elements that might indicate live stream
                $('video').length > 0 && $('body').text().toLowerCase().includes('live'),
                
                // Check for JSON data that might contain live status
                $('script').text().includes('"livestream"') && $('script').text().includes('true')
            ];
            
            const isLive = liveIndicators.some(indicator => indicator);
            console.log(`Kick web scraping for ${username}: ${isLive ? 'LIVE' : 'NOT LIVE'}`);
            
            return isLive;
            
        } catch (error) {
            console.error(`Kick web scraping failed for ${username}:`, error.response?.status || error.message);
            return false;
        }
    }

    async sendLiveNotification(user) {
        const liveUrl = this.generateLiveUrl(user.platform, user.username);
        
        const embed = new EmbedBuilder()
            .setTitle(`🔴 ${user.displayName} is now LIVE!`)
            .setDescription(`${user.displayName} just went live on ${user.platform.charAt(0).toUpperCase() + user.platform.slice(1)}`)
            .setColor(0xFF0000)
            .setURL(liveUrl)
            .addFields({
                name: 'Platform',
                value: user.platform.charAt(0).toUpperCase() + user.platform.slice(1),
                inline: true
            })
            .setTimestamp();

        try {
            await axios.post(CONFIG.WEBHOOK_URL, {
                embeds: [embed.toJSON()]
            });
        } catch (error) {
            console.error('Error sending webhook:', error);
        }
    }

    generateLiveUrl(platform, username) {
        const urls = {
            youtube: this.generateYouTubeUrl(username),
            twitch: `https://twitch.tv/${username}`,
            tiktok: `https://tiktok.com/@${username}/live`,
            kick: `https://kick.com/${username}`
        };
        return urls[platform] || '#';
    }

    generateYouTubeUrl(channelInput) {
        // If it's a channel ID (starts with UC), use channel URL
        if (channelInput.startsWith('UC')) {
            return `https://youtube.com/channel/${channelInput}/live`;
        }
        // Otherwise assume it's a username/handle
        return `https://youtube.com/@${channelInput}/live`;
    }

    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.client.destroy();
    }
}

// Initialize and start the bot
const bot = new StreamMonitorBot();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down bot...');
    bot.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down bot...');
    bot.stop();
    process.exit(0);
});