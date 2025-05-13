/**
 * @license
 * Copyright (C) 2025 SR3397
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This file is part of llm-discord-bot.
 */

console.log("Script starting...");

// Main bot application using Discord.js
import { Client, GatewayIntentBits, Partials, Collection } from "discord.js";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration.js"; // Added for humanize
import relativeTime from "dayjs/plugin/relativeTime.js";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
const processing = new Map();
import chalk from 'chalk';

import * as dotenv from 'dotenv';
const envResult = dotenv.config({ path: '.env' });
console.log("Dotenv loaded, DISCORD_TOKEN exists:", !!process.env.DISCORD_TOKEN);

// Check if dotenv loaded successfully
if (envResult.error) {
  console.error('\x1b[31m%s\x1b[0m', '┌───────────────────────────────────────────────────┐');
  console.error('\x1b[31m%s\x1b[0m', '│               .ENV FILE NOT FOUND                 │');
  console.error('\x1b[31m%s\x1b[0m', '└───────────────────────────────────────────────────┘');
  console.error('\x1b[33m%s\x1b[0m', `Error loading .env file: ${envResult.error.message}`);
  console.error('\x1b[33m%s\x1b[0m', `Path attempted: ${path.resolve(__dirname, '.env')}`);
  process.exit(1);
}

// Check for required variables
const requiredEnvVars = [
  'DISCORD_TOKEN',
  'LLM_API_KEY',
  'BOT_NAME',
  'SYSTEM_PROMPT'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('\x1b[31m%s\x1b[0m', '┌───────────────────────────────────────────────────┐');
  console.error('\x1b[31m%s\x1b[0m', '│               MISSING CONFIGURATION               │');
  console.error('\x1b[31m%s\x1b[0m', '└───────────────────────────────────────────────────┘');
  console.error('\x1b[33m%s\x1b[0m', `Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('\x1b[33m%s\x1b[0m', '\nPlease create a .env file with these variables. You can:');
  console.error('\x1b[33m%s\x1b[0m', '1. Copy a template from the /templates directory');
  console.error('\x1b[33m%s\x1b[0m', '2. Rename it to .env');
  console.error('\x1b[33m%s\x1b[0m', '3. Fill in your API keys and customize the personality\n');
  console.error('\x1b[33m%s\x1b[0m', 'Example:');
  console.error('\x1b[33m%s\x1b[0m', '  cp templates/ali_g.env.example .env');
  console.error('\x1b[33m%s\x1b[0m', '  # Edit .env with your preferred text editor\n');
  process.exit(1);
}

// Configure dayjs with timezone support
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(duration); // Added for humanize
dayjs.extend(relativeTime);
dayjs.tz.setDefault("America/Chicago"); // Set default timezone to CST/CDT

// Import p-queue
import PQueue from "p-queue";

// Helper function for delays
const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let lastBotReplyTimestamp = 0; // Timestamp of the last reply sent by the bot (for global rate limiting)

// Import the new LLM call function
import { callLLM_new } from "./llm_enhancements.js";

// Import moderation functions and db instance
import {
    isUserTimedOut,
    containsEgregiousProfanity,
    sanitizeText,
    incrementOffense,
    generateAntiAbuseMessage,
    db as moderationDb
} from "./moderation.js";

const ERROR_MESSAGE = process.env.ERROR_MESSAGE || "Error: Bot encountered a problem. To customize this message, set ERROR_MESSAGE in your .env file.";

const config = {
  token: process.env.DISCORD_TOKEN,
  llmApiKey: process.env.LLM_API_KEY,
  llmApiUrl: process.env.LLM_API_URL,
  tenorApiKey: process.env.TENOR_API_KEY,
  responseChance: parseInt(process.env.RESPONSE_CHANCE) || 8,  // % of replying randomly.
  gifChance: parseInt(process.env.GIF_CHANCE) || 40,  // % it uses GIF in reply
  cooldown: parseInt(process.env.COOLDOWN) || 12000,  // milliseconds for random reply cooldown
  replyRateLimitSeconds: parseInt(process.env.REPLY_RATE_LIMIT_SECONDS) || 18,  // time limit between messages
  typingWpm: parseInt(process.env.TYPING_WPM) || 60,  // speed at which it types (artificial limit)
  dateFormatForLogNames: process.env.DATE_FORMAT_LOG_NAMES || "YYYY-MM-DD",

  sanitizationReplyMessage: process.env.SANITIZATION_REPLY_MESSAGE || "Hey, watch your language! Your message has been sanitized.",
  enableSanitizationReply: (process.env.ENABLE_SANITIZATION_REPLY || "true").toLowerCase() === "false", // Whether to reply with a message when a user's message is sanitized due to profanity
  timeoutDMMessageTemplate: process.env.TIMEOUT_DM_MESSAGE_TEMPLATE || "You are still timed out for {timeLeftFormatted}. Please wait before sending more messages.", // Use {timeLeftFormatted} as a placeholder
  sendTimeoutDM: (process.env.SEND_TIMEOUT_DM || "false").toLowerCase() === "true", // Control if DM is sent
  memory: {
    memoryDir: "memory",
    maxMessages: 250,
    maxMessagesToSummarize: 1000,
    summaryMaxTokens: 1200
  },

  enableUnpromptedMessages: (process.env.ENABLE_UNPROMPTED_MESSAGES || "true").toLowerCase() === "true",
  unpromptedChanceBuildIntervalSeconds: parseInt(process.env.UNPROMPTED_CHANCE_BUILD_INTERVAL_SECONDS) || 600,
  unpromptedChanceBuildAmount: parseFloat(process.env.UNPROMPTED_CHANCE_BUILD_AMOUNT) || 0.1,
  unpromptedRollIntervalSeconds: parseInt(process.env.UNPROMPTED_ROLL_INTERVAL_SECONDS) || 600,
  defaultUnpromptedChannelId: process.env.DEFAULT_UNPROMPTED_CHANNEL_ID || null,
  unpromptedMessageSystemPrompt: process.env.UNPROMPTED_MESSAGE_SYSTEM_PROMPT || null,
  unpromptedMessageBasePrompt: process.env.UNPROMPTED_MESSAGE_BASE_PROMPT || `NOTE: Configure a personality-appropriate unprompted message prompt in your .env file using UNPROMPTED_MESSAGE_BASE_PROMPT. This should guide the bot on generating spontaneous messages that match its character.`,
  unpromptedTimePeriods: {
    morning: { startHour: 8, endHour: 12, modifier: parseFloat(process.env.UNPROMPTED_MODIFIER_MORNING) || 6 },
    afternoon: { startHour: 12, endHour: 22, modifier: parseFloat(process.env.UNPROMPTED_MODIFIER_AFTERNOON) || 8.4 },
    evening: { startHour: 22, endHour: 2, modifier: parseFloat(process.env.UNPROMPTED_MODIFIER_EVENING) || 10.5 },
    night: { startHour: 2, endHour: 8, modifier: parseFloat(process.env.UNPROMPTED_MODIFIER_NIGHT) || 1 }
  },
};

if (!fs.existsSync(config.memory.memoryDir)) {
  fs.mkdirSync(config.memory.memoryDir);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const llmApiQueue = new PQueue({ concurrency: 5 });
const cooldowns = new Map();
const personalities = new Map();

const DEFAULT_PERSONALITY = {
  name: process.env.BOT_NAME || "Discord Bot",
  systemPrompt: process.env.SYSTEM_PROMPT || `CONFIGURATION REQUIRED: Please set a SYSTEM_PROMPT in your .env file to define this bot's personality.
    
    You can copy a template from the templates directory (e.g., templates/.env.example) to get started.
    
    The SYSTEM_PROMPT is the most important configuration as it defines how the bot speaks, acts, and responds.
    
    Until configured, this bot will respond plainly without any specific character traits.`,
  responseChance: config.responseChance,
};

class MemoryManager {
  constructor(clientInstance, memoryConfig) {
    this.client = clientInstance;
    this.memoryConfig = memoryConfig;
    this.conversations = new Collection();
    this.userInfo = new Collection();
    const date = dayjs().tz("America/Chicago").format(config.dateFormatForLogNames);
    this.logFile = path.join(this.memoryConfig.memoryDir, `memory-log-${date}.json`);
    this.initializeMemory();
  }

  async initializeMemory() {
      const date = dayjs().tz("America/Chicago").format(config.dateFormatForLogNames);
      const todayFile = `memory-log-${date}.json`;
      const todayFilePath = path.join(this.memoryConfig.memoryDir, todayFile);
    
      // First, try to load today's file if it exists
      if (fs.existsSync(todayFilePath)) {
          try {
              console.log(`Loading today's memory file: ${todayFile}`);
              const fileContent = fs.readFileSync(todayFilePath, "utf8");
              const data = JSON.parse(fileContent);
            
              // Load conversations
              if (data.conversations) {
                  Object.entries(data.conversations).forEach(([serverId, messages]) => {
                      this.conversations.set(serverId, messages);
                  });
                  console.log(`Loaded conversations from today's memory file for ${this.conversations.size} servers`);
              }
            
              // Load user info
              if (data.userInfo) {
                  Object.entries(data.userInfo).forEach(([userId, userInfo]) => {
                      this.userInfo.set(userId, userInfo);
                  });
                  console.log(`Loaded user info for ${this.userInfo.size} users from today's memory file`);
              }
          } catch (error) {
              console.error(`Error loading today's memory file: ${error}`);
          }
      }
    
      // Then offer to summarize previous files
      const memoryFiles = fs.readdirSync(this.memoryConfig.memoryDir)
          .filter(file => file.startsWith("memory-log-") && file.endsWith(".json") && file !== todayFile)
          .sort()
          .reverse();
        
      if (memoryFiles.length === 0) {
          console.log("No previous memory files found for summarization.");
          return;
      }
    
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => {
          rl.question("Would you like to summarize previous conversations? (yes/no): ", resolve);
      });
      rl.close();
    
      if (answer.toLowerCase() === "yes") {
          await this.summarizePreviousConversations(memoryFiles, llmApiQueue, axios, config, this);
      }
  }

  async summarizePreviousConversations(memoryFiles, queue, axiosInstance, appConfig, memManagerInstance) {
    console.log("Summarizing previous conversations...");
    const previousMessages = new Collection();
    let messageCount = 0;
    for (const file of memoryFiles) {
      if (messageCount >= this.memoryConfig.maxMessagesToSummarize) break;
      try {
        const fileContent = fs.readFileSync(path.join(this.memoryConfig.memoryDir, file), "utf8");
        const data = JSON.parse(fileContent);
        for (const [serverId, serverData] of Object.entries(data.conversations || {})) {
          if (!previousMessages.has(serverId)) {
            previousMessages.set(serverId, []);
          }
          const serverMessages = previousMessages.get(serverId);
          serverMessages.push(...serverData);
          if (serverMessages.length > this.memoryConfig.maxMessagesToSummarize) {
            serverMessages.splice(0, serverMessages.length - this.memoryConfig.maxMessagesToSummarize);
          }
          messageCount += serverData.length;
        }
        if (data.userInfo) {
          for (const [userId, userInfo] of Object.entries(data.userInfo)) {
            this.userInfo.set(userId, userInfo);
          }
        }
      } catch (error) {
        console.error(`Error reading memory file ${file}:`, error);
      }
    }
    for (const [serverId, messages] of previousMessages.entries()) {
      if (messages.length === 0) continue;
      try {
        const conversationText = messages.map(msg => `${msg.displayName || msg.username}: ${msg.content}`).join("\n");
        const summaryPromptContent = `Here\'s a conversation from a Discord server. Please create a comprehensive summary:\n\n${conversationText}`;
        
        const summary = await callLLM_new(
          summaryPromptContent, 
          `You are an advanced RAG (Retrieval-Augmented Generation) summarization assistant designed to synthesize information from retrieved documents. Your purpose is to provide accurate, comprehensive summaries while maintaining strict adherence to the source material.\n\n## **Key Responsibilities**\n\n1. **Accurate Synthesis**: Create concise, coherent summaries that accurately reflect the key information in the retrieved documents. Maintain the core meaning, important details, and the overall structure of the original content.\n2. **Source Fidelity**: Ground all information in your summaries directly in the retrieved documents. Never introduce information, examples, or concepts not present in the source material, even if they would make the summary more engaging or comprehensive.\n3. **Balanced Coverage**: Provide balanced coverage of the source material, avoiding over-emphasis on certain sections while neglecting others. Maintain proportional representation of the original content\'s focus areas.\n4. **Citation Transparency**: When requested, include references to specific sections of the source documents using appropriate citation formats. Make it clear which parts of your summary correspond to which source documents.`,
          serverId, 
          null, 
          null, 
          null, 
          [],   
          queue, 
          axiosInstance, 
          appConfig, 
          memManagerInstance 
        );
        
        this.ensureServerExists(serverId);
        this.conversations.get(serverId).unshift({
          type: "summary",
          content: summary,
          timestamp: new Date().toISOString()
        });
        console.log(`Created summary for server ${serverId}`);
      } catch (error) {
        console.error(`Error summarizing conversations for server ${serverId}:`, error);
      }
    }
    if (previousMessages.size > 0) {
        memManagerInstance.saveToFile();
        console.log("Memory file updated with new summaries.");
    }
    console.log("Summarization complete.");
  }

  ensureServerExists(serverId) {
    if (!this.conversations.has(serverId)) {
      this.conversations.set(serverId, []);
    }
    return this.conversations.get(serverId);
  }

  addMessage(serverId, message, isBot = false) {
    const serverConversation = this.ensureServerExists(serverId);
    const messageObj = {
      id: message.id,
      userId: isBot ? this.client.user.id : message.author.id,
      username: isBot ? this.client.user.username : message.author.username,
      displayName: isBot ? (this.client.user.displayName || this.client.user.username) : (message.member?.displayName || message.author.username),
      content: message.content,
      timestamp: message.createdAt.toISOString(),
      channelId: message.channel.id,
      channelName: message.channel.name,
      guildId: message.guild?.id,
      guildName: message.guild?.name
    };
    serverConversation.push(messageObj);
    if (serverConversation.length > this.memoryConfig.maxMessages) {
      serverConversation.shift();
    }
    if (!isBot) {
        this.updateUserInfo(message.author.id, message.author.username, message.member?.displayName || message.author.username, message.guild?.id);
    }
    this.saveToFile();
  }

  updateUserInfo(userId, username, displayName, guildId) {
    const key = guildId ? `${guildId}-${userId}` : userId;
    this.userInfo.set(key, { username, displayName, lastSeen: new Date().toISOString() });
  }

  getServerContext(serverId, maxMessages) {
    const serverConversation = this.conversations.get(serverId);
    if (!serverConversation) return "";
    return serverConversation.slice(-maxMessages).map(msg => {
        const userIdentifier = msg.displayName || msg.username;
        return `${userIdentifier}: ${msg.content}`;
    }).join("\n");
  }

  getUserContext(serverId, channelId) { 
    let context = "Known users in this server (from memory):\n";
    let count = 0;
    for (const [key, info] of this.userInfo.entries()) {
        if (serverId && key.startsWith(serverId)) {
            context += `- ${info.displayName || info.username} (ID: ${key.split("-")[1]})\n`;
            count++;
        }
    }
    return count > 0 ? context : "";
  }

  saveToFile() {
    const dataToSave = {
      conversations: Object.fromEntries(this.conversations),
      userInfo: Object.fromEntries(this.userInfo)
    };
    fs.writeFileSync(this.logFile, JSON.stringify(dataToSave, null, 2));
  }
}

const memoryManager = new MemoryManager(client, config.memory);

client.once("ready", () => {
  console.log(chalk.cyan(`Logged in as ${client.user.tag}!`));
  console.log(chalk.cyan(`Default personality: ${DEFAULT_PERSONALITY.name}`));
  console.log(chalk.yellow(`Response chance: ${config.responseChance}%`));
  console.log(chalk.yellow(`GIF chance: ${config.gifChance}%`));
  console.log(chalk.yellow(`Cooldown: ${config.cooldown / 1000}s`));
  console.log(chalk.yellow(`Rate Limit: ${config.replyRateLimitSeconds}s`));
  console.log(chalk.magenta(`Unprompted Messages Enabled: ${config.enableUnpromptedMessages}`));
  if (config.enableUnpromptedMessages) {
    console.log(chalk.magenta(`Unprompted Default Channel ID: ${config.defaultUnpromptedChannelId || "Not Set - Unprompted messages will fail if not set."}`));
    initializeUnpromptedMessages();
  }
});

async function getGifSearchTerms(botResponseText, currentMessage) {
  try {
    const serverId = currentMessage.guild?.id || null;
    const channelId = currentMessage.channel.id;
    const serverName = currentMessage.guild?.name || null;
    const channelName = currentMessage.channel.name || (currentMessage.channel.type === "DM" ? "Direct Message" : null);
    let userList = [];
    if (currentMessage.guild && currentMessage.guild.members.cache) {
      userList = currentMessage.guild.members.cache.map(member => ({
        id: member.user.id,
        username: member.user.username,
        displayName: member.displayName,
        bot: member.user.bot
      }));
    } else {
      userList = [{ id: currentMessage.author.id, username: currentMessage.author.username, displayName: currentMessage.author.username, bot: currentMessage.author.bot }];
    }

    const llmResponseForGif = await callLLM_new(
      `Given the bot's response: "${botResponseText}". What are 1-3 concise, humorous search terms for a GIF that would complement it? Return ONLY the search terms, comma-separated. E.g.: \"happy dance\" or \"mind blown\". If no GIF is suitable, return \"NO_GIF\".`,
      "You are an assistant that suggests GIF search terms. Be concise.",
      serverId,
      channelId,
      serverName,
      channelName,
      userList,
      llmApiQueue,
      axios,
      config,
      memoryManager,
      "claude-3-5-sonnet-20240620",
      { useShortContext: true, messageCount: 3 }
    );

    if (llmResponseForGif && llmResponseForGif.toUpperCase() !== "NO_GIF") {
      return llmResponseForGif.split(",").map(term => term.trim()).filter(term => term.length > 0);
    }
    return null;
  } catch (error) {
    console.error("Error in getGifSearchTerms:", error);
    return null;
  }
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const serverId = message.guild ? message.guild.id : "dm";
  const channelId = message.channel.id;
  const userId = message.author.id;
  
  // Add to memory regardless of whether we'll respond
  memoryManager.addMessage(serverId, message);
  
  // Set processing flag immediately to block concurrent messages
  if (processing.get(serverId)) {
    console.log(`Already processing a message for server ${serverId}. Ignoring new message.`);
    return;
  }
  processing.set(serverId, true);

  try {
    // Check if we're within rate limit period
    const now = Date.now();
    if (now - lastBotReplyTimestamp < config.replyRateLimitSeconds * 1000) {
      console.log(`Global rate limit hit. Suppressing reply to ${userId} in ${serverId}.`);
      processing.delete(serverId); // Make sure to clear the processing flag
      return;
    }
    
    // Check server cooldown
    const serverCooldown = cooldowns.get(serverId);
    if (serverCooldown && now - serverCooldown < config.cooldown) {
      console.log(`Server cooldown active for ${serverId}. Suppressing reply.`);
      processing.delete(serverId); // Make sure to clear the processing flag
      return;
    }

    // UPDATE TIMESTAMPS RIGHT AFTER CHECKS PASS - this is crucial!
    // By updating timestamps before processing, other incoming messages will see these updates
    lastBotReplyTimestamp = now;
    cooldowns.set(serverId, now);

    // Add a random delay before processing the message
    const delaySeconds = Math.floor(Math.random() * (21 - 7 + 1)) + 7;
    console.log(`Delaying response to ${userId} by ${delaySeconds} seconds`);
    await _sleep(delaySeconds * 1000);

    // Check timeout status AFTER the delay - the user might be out of timeout by now
    const userTimeoutStatus = await isUserTimedOut(userId);
    if (userTimeoutStatus.timedOut) {
      const timeLeftMs = userTimeoutStatus.timeLeft;
      if (timeLeftMs === Infinity) {
          console.log(`User ${userId} is permanently timed out. Ignoring message.`);
          return;
      } else {
          const timeLeftFormatted = dayjs.duration(timeLeftMs).humanize();
          console.log(`User ${userId} is timed out for ${timeLeftFormatted}. Ignoring message.`);
          if (config.sendTimeoutDM) { // Check if sending DM is enabled
              const dmMessage = config.timeoutDMMessageTemplate.replace("{timeLeftFormatted}", timeLeftFormatted);
              message.author.send(dmMessage).catch(console.error);
          }
          return;
      }
    }

    const sanitizedContent = await sanitizeText(message.content);
    if (sanitizedContent !== message.content && config.enableSanitizationReply) {
      await message.reply(config.sanitizationReplyMessage); // Use configured message
    }

    // Check for egregious profanity after sanitization
    if (containsEgregiousProfanity(message.content)) {
        const offenseData = await incrementOffense(userId);
        const timeoutDurationMs = offenseData.timeoutUntil === Infinity ? Infinity : offenseData.timeoutUntil - Date.now();
        const timeoutFormatted = formatDuration(timeoutDurationMs);

        let replyMessage = `Your offense count is now ${offenseData.offenseCount}.`;
        if (timeoutDurationMs > 0) {
            replyMessage += ` You have been timed out for ${timeoutFormatted}.`;
            if (message.guild && message.member && message.member.moderatable) {
                try {
                    await message.member.timeout(timeoutDurationMs, `Offense #${offenseData.offenseCount} - Egregious profanity.`);
                    replyMessage += ` Discord timeout applied.`;
                } catch (err) {
                    if (err.code === 50013) { // Missing Permissions
                        console.error("Failed to apply Discord timeout: Missing Permissions");
                        replyMessage += ` Failed to apply Discord timeout (bot lacks permissions).`;
                    } else {
                        console.error("Failed to apply Discord timeout:", err);
                        replyMessage += ` Failed to apply Discord timeout (unexpected error).`;
                    }
                }
            } else {
                replyMessage += ` Cannot apply Discord timeout (bot lacks permissions or user is higher role).`;
            }
        } else if (offenseData.offenseCount === 4) {
            replyMessage += ` This is a warning. Further offenses will result in a timeout.`;
        }
        await message.reply(replyMessage);
      
        // Don't process the message further after detecting egregious profanity
        return;
    }

    // Determine if we should respond based on mention or random chance
    const currentPersonality = personalities.get(serverId) || DEFAULT_PERSONALITY;
    const mentionRegex = new RegExp(`^<@!?${client.user.id}>`);
    const isMentioned = mentionRegex.test(message.content.trim());
    const randomChance = Math.random() * 100;
	
	console.log(`[${serverId}] Random response roll: ${randomChance.toFixed(2)}% vs threshold ${currentPersonality.responseChance}%`);
	
    const shouldRespond = isMentioned || randomChance < currentPersonality.responseChance;

    console.log(`[${serverId}] Should respond: ${shouldRespond} (mentioned: ${isMentioned}, random chance: ${randomChance.toFixed(2)}% < ${currentPersonality.responseChance}%: ${randomChance < currentPersonality.responseChance})`);

    if (!shouldRespond) {
      console.log(`[${serverId}] Not responding to message from ${userId} due to random chance`);
      processing.delete(serverId);
      return;
    }

    const serverName = message.guild ? message.guild.name : null;
    const channelName = message.channel.name || (message.channel.type === "DM" ? "Direct Message" : null);
    let userList = [];
    if (message.guild && message.guild.members.cache) {
      try {
          userList = message.guild.members.cache.map(member => ({
              id: member.user.id,
              username: member.user.username,
              displayName: member.displayName,
              bot: member.user.bot
          }));
      } catch (err) {
          console.error("Error fetching guild members for userList:", err);
          userList = [{ id: message.author.id, username: message.author.username, displayName: message.member?.displayName || message.author.username, bot: message.author.bot }];
      }
    } else {
      userList = [{ id: message.author.id, username: message.author.username, displayName: message.author.username, bot: message.author.bot }];
    }

    await message.channel.sendTyping();
    const typingDuration = Math.floor((message.content.length / (config.typingWpm / 60)) * 1000);
    await _sleep(typingDuration > 5000 ? 5000 : typingDuration); 

    const llmResponse = await callLLM_new(
      sanitizedContent, 
      currentPersonality.systemPrompt,
      serverId,
      channelId,
      serverName,      
      channelName,     
      userList,        
      llmApiQueue,
      axios,
      config,
      memoryManager
    );

    if (llmResponse) {
      let sentMessage;
      if (Math.random() * 100 < config.gifChance && config.tenorApiKey) {
        try {
          const searchTerms = await getGifSearchTerms(llmResponse, message);
          if (searchTerms && searchTerms.length > 0) {
            const gifQuery = searchTerms.join(" "); // Combine terms into a single query string
            const tenorUrl = `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(gifQuery)}&key=${config.tenorApiKey}&limit=1&media_filter=minimal`;
            const tenorResponse = await axios.get(tenorUrl);
            if (tenorResponse.data.results && tenorResponse.data.results.length > 0) {
              sentMessage = await message.reply(`${llmResponse}\n${tenorResponse.data.results[0].url}`);
            } else {
              sentMessage = await message.reply(llmResponse);
            }
          } else {
            sentMessage = await message.reply(llmResponse); // No GIF terms, send text only
          }
        } catch (gifError) {
          console.error("Error fetching GIF:", gifError);
          sentMessage = await message.reply(llmResponse);
        }
      } else {
        sentMessage = await message.reply(llmResponse);
      }
      
      // Add the bot's response to memory
      if (sentMessage) {
        memoryManager.addMessage(serverId, sentMessage, true); // Note the third parameter 'true' to indicate it's a bot message
      }
    }
  } catch (error) {
    console.error("Error processing message or calling LLM:", error);
    const errorMsg = await message.reply(ERROR_MESSAGE);
    if (errorMsg) {
      memoryManager.addMessage(serverId, errorMsg, true);
    }
  } finally {
    // ALWAYS clear the processing flag when done, even if there was an error
    processing.delete(serverId);
  }
});

let unpromptedChance = 0;
let unpromptedMessageInterval = null;
let unpromptedRollIntervalTimer = null;

function formatDuration(ms) {
    if (ms === Infinity) return "permanently";
    if (ms <= 0) return "already expired";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

function getCurrentUnpromptedChanceModifier() {
    const now = dayjs().tz("America/Chicago");
    const currentHour = now.hour();

    for (const periodName in config.unpromptedTimePeriods) {
        const period = config.unpromptedTimePeriods[periodName];
        let isActive = false;
        if (period.startHour <= period.endHour) { 
            isActive = currentHour >= period.startHour && currentHour < period.endHour;
        } else { 
            isActive = currentHour >= period.startHour || currentHour < period.endHour;
        }
        if (isActive) return period.modifier;
    }
    return 1; 
}

function buildUnpromptedChance() {
    if (!config.enableUnpromptedMessages || !config.defaultUnpromptedChannelId) {
        console.log(chalk.yellow("Unprompted messages are disabled or channel ID is not set. Skipping chance build."));
        return;
    }
    
    const previousChance = unpromptedChance;
    const modifier = getCurrentUnpromptedChanceModifier();
    const increment = config.unpromptedChanceBuildAmount * modifier;
    
    unpromptedChance += increment;
    if (unpromptedChance > 100) unpromptedChance = 100;
    
    console.log(chalk.magenta('[UNPROMPTED MOD]') + chalk.blue(' Time period modifier: ') + chalk.white(modifier.toFixed(2)));
    console.log(chalk.magenta('[UNPROMPTED BUILD]') + chalk.blue(' Chance: ') + chalk.white(`${previousChance.toFixed(2)}% → ${unpromptedChance.toFixed(2)}% (+${increment.toFixed(2)}%)`));
    
    const now = dayjs().tz("America/Chicago").format("YYYY-MM-DD HH:mm:ss");
    console.log(chalk.magenta('[UNPROMPTED TIME]') + chalk.blue(' Current time: ') + chalk.white(now));
}

async function rollForUnpromptedMessage() {
    if (!config.enableUnpromptedMessages || !config.defaultUnpromptedChannelId) {
        console.log(chalk.yellow("Unprompted messages are disabled or channel ID is not set. Skipping roll."));
        return;
    }

    const roll = Math.random() * 100;
    console.log(chalk.magenta('[UNPROMPTED ROLL]') + chalk.blue(' Current chance: ') + chalk.white(`${unpromptedChance.toFixed(2)}%, Roll: ${roll.toFixed(2)}%`));
    
    if (roll < unpromptedChance) {
        console.log(chalk.magenta('[UNPROMPTED RESULT]') + chalk.green(' SUCCESS! ') + chalk.white(`Roll ${roll.toFixed(2)} < ${unpromptedChance.toFixed(2)}`));
        try {
            const targetChannel = await client.channels.fetch(config.defaultUnpromptedChannelId);
            if (targetChannel && targetChannel.isTextBased()) {
                console.log(chalk.magenta('[UNPROMPTED MESSAGE]') + chalk.cyan(' Preparing to send message to channel: ') + chalk.white(`${targetChannel.name} (${config.defaultUnpromptedChannelId})`));
                await targetChannel.sendTyping();
                
                let serverNameUnprompted = null;
                let channelNameUnprompted = null;
                let userListUnprompted = [];
                let serverIdUnprompted = null;

                if (targetChannel.guild) {
                    serverIdUnprompted = targetChannel.guild.id;
                    serverNameUnprompted = targetChannel.guild.name;
                    channelNameUnprompted = targetChannel.name;
                    console.log(chalk.magenta('[UNPROMPTED MESSAGE]') + chalk.cyan(' Server context: ') + chalk.white(`${serverNameUnprompted} (${serverIdUnprompted})`));
                }

                const systemPromptForUnprompted = config.unpromptedMessageSystemPrompt || DEFAULT_PERSONALITY.systemPrompt;
                const basePromptForUnprompted = config.unpromptedMessageBasePrompt;

                console.log(chalk.magenta('[UNPROMPTED MESSAGE]') + chalk.cyan(' Calling LLM API...'));
                const llmResponse = await callLLM_new(
                    basePromptForUnprompted,
                    systemPromptForUnprompted,
                    serverIdUnprompted, 
                    config.defaultUnpromptedChannelId, 
                    serverNameUnprompted, 
                    channelNameUnprompted, 
                    userListUnprompted, 
                    llmApiQueue,
                    axios,
                    config,
                    memoryManager,
                    undefined, 
                    { useShortContext: true, messageCount: 0 } 
                );

                if (llmResponse) {
                    await targetChannel.send(llmResponse);
                    console.log(chalk.magenta('[UNPROMPTED MESSAGE]') + chalk.green(' Message sent: ') + chalk.white(`"${llmResponse.substring(0, 100)}${llmResponse.length > 100 ? '...' : ''}"`));
                    const previousChance = unpromptedChance;
                    unpromptedChance = 0; 
                    console.log(chalk.magenta('[UNPROMPTED MESSAGE]') + chalk.yellow(' Chance reset: ') + chalk.white(`${previousChance.toFixed(2)}% → 0%`));
                    lastBotReplyTimestamp = Date.now(); 
                } else {
                    console.log(chalk.magenta('[UNPROMPTED MESSAGE]') + chalk.red(' Failed to get response from LLM API'));
                }
            } else {
                console.error(chalk.magenta('[UNPROMPTED ERROR]') + chalk.red(' Channel not found or not text-based: ') + chalk.white(config.defaultUnpromptedChannelId));
            }
        } catch (error) {
            console.error(chalk.magenta('[UNPROMPTED ERROR]') + chalk.red(' Error sending message:'), error);
        }
    } else {
        console.log(chalk.magenta('[UNPROMPTED RESULT]') + chalk.red(' FAILED. ') + chalk.white(`Roll ${roll.toFixed(2)} >= ${unpromptedChance.toFixed(2)}`));
    }
}

function initializeUnpromptedMessages() {
    if (!config.enableUnpromptedMessages || !config.defaultUnpromptedChannelId) {
        console.log("Unprompted messages are disabled or channel ID is not set.");
        return;
    }
    console.log(chalk.magenta("Initializing unprompted message timers..."));
    if (unpromptedMessageInterval) clearInterval(unpromptedMessageInterval);
    unpromptedMessageInterval = setInterval(buildUnpromptedChance, config.unpromptedChanceBuildIntervalSeconds * 1000);
    
    if (unpromptedRollIntervalTimer) clearInterval(unpromptedRollIntervalTimer);
    unpromptedRollIntervalTimer = setInterval(rollForUnpromptedMessage, config.unpromptedRollIntervalSeconds * 1000);
    console.log(chalk.magenta(`Unprompted chance will build every ${config.unpromptedChanceBuildIntervalSeconds}s.`));
    console.log(chalk.magenta(`Bot will roll for unprompted message every ${config.unpromptedRollIntervalSeconds}s.`));
}

const signals = { "SIGINT": 2, "SIGTERM": 15 };
Object.keys(signals).forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);
    if (moderationDb) {
      moderationDb.close((err) => {
        if (err) {
          console.error("Error closing the moderation database:", err.message);
        }
        console.log("Moderation database connection closed.");
      });
    }
    memoryManager.saveToFile(); 
    console.log("Memory saved.")
    console.log("Bot has been shut down.");
    process.exit(128 + signals[signal]);
  });
});

client.login(config.token || process.env.DISCORD_TOKEN)
  .then(() => console.log(chalk.green("Login successful")))
  .catch(err => {
    console.error("Login failed with error:", err);
    console.error("Token value exists:", !!config.token);
    console.error("Env token exists:", !!process.env.DISCORD_TOKEN);
    process.exit(1);
  });
