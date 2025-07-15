
// Simple setup verification script
require('dotenv').config();

console.log('🔍 Environment Setup Check\n');

const requiredVars = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID',
    'WEBHOOK_URL'
];

const optionalVars = [
    'YOUTUBE_API_KEY',
    'TWITCH_CLIENT_ID',
    'TWITCH_CLIENT_SECRET'
];

console.log('Required Variables:');
requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✓ ${varName}: ${value.substring(0, 10)}...`);
    } else {
        console.log(`❌ ${varName}: NOT SET`);
    }
});

console.log('\nOptional Variables:');
optionalVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`✓ ${varName}: ${value.substring(0, 10)}...`);
    } else {
        console.log(`⚠️  ${varName}: NOT SET`);
    }
});

console.log('\n📋 Setup Instructions:');
console.log('1. Make sure you have a .env file in your project root');
console.log('2. Copy the contents from .env.example to .env');
console.log('3. Fill in your actual tokens and API keys');
console.log('4. Run: npm start');

// Check if .env file exists
const fs = require('fs');
if (fs.existsSync('.env')) {
    console.log('\n✓ .env file found');
} else {
    console.log('\n❌ .env file not found! Please create one based on .env.example');
}