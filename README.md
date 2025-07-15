# Discord Stream Monitor Bot

A comprehensive Discord bot that monitors live streams across multiple platforms and sends notifications when your favorite streamers go live.

## 🎯 Features

- **Multi-Platform Support**: Monitor streams on YouTube, Twitch, TikTok, and Kick
- **Real-time Notifications**: Get instant Discord notifications when streamers go live
- **Robust Detection**: Advanced web scraping and API integration for reliable stream detection
- **Anti-Rate Limiting**: Built-in delays and fallback methods to avoid platform restrictions
- **Easy Management**: Simple slash commands to add, remove, and list monitored streamers
- **Persistent Storage**: Automatically saves your monitored streamers between bot restarts

## 🚀 Supported Platforms

| Platform | Status | Method | Notes |
|----------|--------|--------|-------|
| **YouTube** | ✅ Full Support | Official API | Requires API key |
| **Twitch** | ✅ Full Support | Official API | Requires Client ID & Secret |
| **TikTok** | ✅ Full Support | Web Scraping | No API key needed |
| **Kick** | ✅ Full Support | API + Web Scraping | Dual fallback method |

## 📋 Requirements

- Node.js 16.0.0 or higher
- Discord Bot Token
- Discord Application Client ID
- Discord Webhook URL (for notifications)

### Optional API Keys (for enhanced functionality):
- YouTube Data API v3 Key
- Twitch Client ID & Client Secret

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/discord-stream-monitor-bot.git
   cd discord-stream-monitor-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   ```

4. **Configure your environment variables** (see Configuration section below)

5. **Start the bot**
   ```bash
   npm start
   ```

## ⚙️ Configuration

Create a `.env` file in the root directory with the following variables:

```env
# Required Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
WEBHOOK_URL=your_discord_webhook_url_here

# Optional API Keys (for enhanced functionality)
YOUTUBE_API_KEY=your_youtube_api_key_here
TWITCH_CLIENT_ID=your_twitch_client_id_here
TWITCH_CLIENT_SECRET=your_twitch_client_secret_here
```

### Getting Required Tokens

#### Discord Setup
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token for `DISCORD_TOKEN`
5. Copy the application ID for `DISCORD_CLIENT_ID`
6. Create a webhook in your Discord channel for `WEBHOOK_URL`

#### YouTube API (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable YouTube Data API v3
4. Create credentials (API key)
5. Copy the API key for `YOUTUBE_API_KEY`

#### Twitch API (Optional)
1. Go to [Twitch Developer Console](https://dev.twitch.tv/console)
2. Create a new application
3. Copy Client ID for `TWITCH_CLIENT_ID`
4. Generate a new secret for `TWITCH_CLIENT_SECRET`

## 🎮 Commands

The bot uses Discord slash commands for easy interaction:

### `/track`
Add a user to the monitoring list
- **platform**: Choose from YouTube, Twitch, TikTok, or Kick
- **username**: The username/channel to monitor
- **display_name**: (Optional) Custom display name for notifications

**Examples:**
```
/track platform:YouTube username:@MrBeast display_name:MrBeast
/track platform:Twitch username:ninja
/track platform:TikTok username:charlidamelio
/track platform:Kick username:trainwreckstv
```

### `/remove`
Remove a user from the monitoring list
- **platform**: The platform to remove from
- **username**: The username to remove

**Example:**
```
/remove platform:Twitch username:ninja
```

### `/list`
Display all currently monitored users with their live status

### `/ping`
Check if the bot is online and responsive

## 🔧 Usage Examples

### Adding Streamers
```bash
# Add a YouTube channel
/track platform:YouTube username:UC-lHJZR3Gqxm24_Vd_AJ5Yw display_name:PewDiePie

# Add a Twitch streamer
/track platform:Twitch username:shroud

# Add a TikTok user
/track platform:TikTok username:khaby.lame

# Add a Kick streamer
/track platform:Kick username:trainwreckstv
```

### Managing Your List
```bash
# View all monitored streamers
/list

# Remove a streamer
/remove platform:YouTube username:UC-lHJZR3Gqxm24_Vd_AJ5Yw

# Check bot status
/ping
```

## 🔍 How It Works

1. **Monitoring Loop**: The bot checks all monitored streamers every 5 minutes
2. **Platform Detection**: Uses appropriate method for each platform:
   - YouTube: Official API with channel resolution
   - Twitch: Official Helix API
   - TikTok: Advanced web scraping with multiple detection methods
   - Kick: API with web scraping fallback for 403 errors
3. **Notifications**: Sends rich embed notifications via Discord webhook when streamers go live
4. **Data Persistence**: Stores monitored users in `monitored_users.json`

## 🚨 Troubleshooting

### Common Issues

#### "Missing required environment variables"
- Ensure `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` are set in your `.env` file
- Check that your `.env` file is in the root directory

#### "YouTube API key not configured"
- Add your YouTube API key to the `.env` file
- Verify the YouTube Data API v3 is enabled in Google Cloud Console

#### "Kick API returned 403"
- This is normal - the bot will automatically fall back to web scraping
- The bot includes built-in rate limiting to minimize 403 errors

#### "TikTok/Kick detection not working"
- These platforms may change their structure frequently
- The bot uses multiple detection methods to maintain reliability
- Some users may not be detectable if their profiles are private

### Bot Permissions
Ensure your Discord bot has the following permissions:
- `Send Messages`
- `Use Slash Commands`
- `Embed Links`
- `Read Message History`

## 📊 Monitoring Intervals

- **Check Interval**: 5 minutes (configurable in `CONFIG.CHECK_INTERVAL`)
- **Kick Rate Limiting**: 3 seconds between requests
- **API Timeouts**: 10-15 seconds per request

## 🔮 Future Features

- [ ] Support for more platforms (Rumble, Dailymotion, etc.)
- [ ] Custom notification messages
- [ ] Role mentions for specific streamers
- [ ] Stream category/game detection
- [ ] Historical stream data
- [ ] Web dashboard for management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This bot uses web scraping for some platforms (TikTok, Kick) where official APIs are not available. Web scraping may be affected by platform changes and should be used responsibly. Always comply with each platform's terms of service.

## 🆘 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Review the console logs for error messages
3. Create an issue on GitHub with detailed information
4. Include your environment (Node.js version, OS, etc.)

---

**Made with ❤️ for the streaming community**