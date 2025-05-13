import { Client, GatewayIntentBits, Collection } from "discord.js";
import * as fs from "fs";
import * as path from "path";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import * as dotenv from 'dotenv';
const envResult = dotenv.config({ path: '.env' });

// Configure dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);
const TIMEZONE = process.env.TIMEZONE || "America/Chicago";
dayjs.tz.setDefault(TIMEZONE);

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error("Error: DISCORD_TOKEN is not set in .env file.");
  process.exit(1);
}

// Parse command-line arguments
const args = process.argv.slice(2);
const nMessages = parseInt(args[0]) || 1000; // Default to 1200 messages
const serverIdArg = args.find(arg => arg.startsWith("--server="))?.split("=")[1];
const channelIdArg = args.find(arg => arg.startsWith("--channel="))?.split("=")[1];

if (isNaN(nMessages) || nMessages <= 0) {
  console.error("Error: Please provide a valid number of messages to fetch (e.g., node fetch_messages 100).");
  process.exit(1);
}

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// Memory structure
const memory = {
  timestamp: dayjs().tz(TIMEZONE).toISOString(),
  conversations: new Collection(),
  userInfo: new Collection()
};

// Ensure memory directory exists
const memoryDir = ("memory");
if (!fs.existsSync(memoryDir)) {
  fs.mkdirSync(memoryDir);
}

// Log file path
const date = dayjs().tz(TIMEZONE).format("YYYY-MM-DD");
const logFile = path.join(memoryDir, `memory-log-${date}.json`);

async function fetchMessages() {
  try {
    console.log(`Starting message fetch: ${nMessages} messages per channel`);

    // If a specific channel is provided, fetch only from that channel
    if (channelIdArg) {
      const channel = await client.channels.fetch(channelIdArg).catch(err => {
        console.error(`Error fetching channel ${channelIdArg}:`, err.message);
        return null;
      });
      if (!channel || !channel.isTextBased()) {
        console.error(`Channel ${channelIdArg} is invalid or not a text channel.`);
        process.exit(1);
      }
      await fetchMessagesFromChannel(channel);
    } else {
      // Fetch from specific server or all servers
      const guilds = serverIdArg
        ? [await client.guilds.fetch(serverIdArg).catch(err => {
            console.error(`Error fetching server ${serverIdArg}:`, err.message);
            return null;
          })]
        : client.guilds.cache.values();
      
      for (const guild of guilds) {
        if (!guild) continue;
        console.log(`Processing server: ${guild.name} (${guild.id})`);
        
        // Fetch all text-based channels
        const channels = guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(client.user).has(["VIEW_CHANNEL", "READ_MESSAGE_HISTORY"]));
        for (const channel of channels.values()) {
          await fetchMessagesFromChannel(channel);
        }
      }
    }

    // Save memory to file
    saveMemory();
    console.log(`Memory log saved to ${logFile}`);
    console.log(`Fetched messages from ${memory.conversations.size} servers, ${[...memory.conversations.values()].reduce((sum, msgs) => sum + msgs.length, 0)} total messages`);
  } catch (error) {
    console.error("Error during message fetch:", error);
  } finally {
    client.destroy();
  }
}

async function fetchMessagesFromChannel(channel) {
  try {
    console.log(`Fetching ${nMessages} messages from channel: ${channel.name} (${channel.id})`);
    
    // Fetch messages
    let messages = [];
    let lastId = null;
    while (messages.length < nMessages) {
      const batch = await channel.messages.fetch({
        limit: Math.min(100, nMessages - messages.length),
        before: lastId
      });
      if (batch.size === 0) break;
      messages.push(...batch.values());
      lastId = batch.last()?.id;
    }
    
    // Process messages
    const serverId = channel.guild.id;
    if (!memory.conversations.has(serverId)) {
      memory.conversations.set(serverId, []);
    }
    const serverMessages = memory.conversations.get(serverId);
    
    for (const message of messages) {
      if (!message.author || !message.content) continue; // Skip invalid messages
      
      const messageObj = {
        id: message.id,
        userId: message.author.id,
        username: message.author.username,
        displayName: message.member?.displayName || message.author.username,
        content: message.content,
        isBot: message.author.bot,
        timestamp: message.createdAt.toISOString()
      };
      
      serverMessages.push(messageObj);
      
      // Update userInfo
      if (!message.author.bot) {
        memory.userInfo.set(message.author.id, {
          userId: message.author.id,
          username: message.author.username,
          displayName: message.member?.displayName || message.author.username,
          lastSeen: message.createdAt.toISOString()
        });
      }
    }
    
    // Sort messages by timestamp (ascending) and limit to nMessages
    serverMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    if (serverMessages.length > nMessages) {
      serverMessages.splice(0, serverMessages.length - nMessages);
    }
    
    console.log(`Fetched ${serverMessages.length} messages from ${channel.name}`);
  } catch (error) {
    console.error(`Error fetching messages from channel ${channel.name} (${channel.id}):`, error.message);
  }
}

function saveMemory() {
  try {
    // Convert Collection to plain object for JSON
    const memoryData = {
      timestamp: memory.timestamp,
      conversations: Object.fromEntries(memory.conversations),
      userInfo: Object.fromEntries(memory.userInfo)
    };
    
    // Write to file
    fs.writeFileSync(logFile, JSON.stringify(memoryData, null, 2));
  } catch (error) {
    console.error("Error saving memory log:", error);
  }
}

client.once("ready", async () => {
  console.log(`Bot logged in as ${client.user.tag}`);
  await fetchMessages();
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error("Failed to login:", err.message);
  process.exit(1);
});