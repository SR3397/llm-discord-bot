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

// llm_enhancements.js
// This file provides the functions for adding exponential backoff and an async task queue to your LLM API calls.

// Note: axios, config, and memoryManager are expected to be available in the scope where these functions are used in your main index.js file.
// PQueue should be imported and llmApiQueue initialized in your main index.js file.

const _sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const LLM_OVERLOAD_ERROR = process.env.LLM_OVERLOAD_ERROR || "Error: Request timed out after maximum retries. To customize this message, set LLM_OVERLOAD_ERROR in your .env file.";
const LLM_UNRECOVERABLE_ERROR = process.env.LLM_UNRECOVERABLE_ERROR || "Error: Having trouble connecting to AI services. To customize this message, set LLM_STRUGGLE_ERROR in your .env file.";
const LLM_STRUGGLE_ERROR = process.env.LLM_STRUGGLE_ERROR || "Error: Encountered an unrecoverable problem. To customize this message, set LLM_UNRECOVERABLE_ERROR in your .env file.";

const _LLM_RETRY_DELAYS = [
  5 * 1000,    // 5 seconds
  10 * 1000,   // 10 seconds
  20 * 1000,   // 20 seconds
  40 * 1000,   // 40 seconds
  80 * 1000,   // 80 seconds (1 minute 20 seconds)
  2.5 * 60 * 1000, // 2.5 minutes
  5 * 60 * 1000,   // 5 minutes
  10 * 60 * 1000,  // 10 minutes
  20 * 60 * 1000,  // 20 minutes
  40 * 60 * 1000,  // 40 minutes
  60 * 60 * 1000   // 1 hour
];
const _LLM_MAX_TOTAL_RETRY_TIME = 3 * 60 * 60 * 1000; // 3 hours
const _LLM_HOURLY_RETRY_DELAY = 60 * 60 * 1000; // 1 hour

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
  
async function executeLlmRequestWithRetries(originalPrompt, systemPrompt, serverId, channelId, serverName, channelName, userList, axiosInstance, appConfig, memManager, model = "claude-3-7-sonnet-20250219", contextOptions = {}) {
  let attempt = 0;
  const startTime = Date.now();
  
  dayjs.extend(utc);
  dayjs.extend(timezone);
  const currentDateTime = dayjs().tz("America/Chicago").format(appConfig.dateFormatForPrompts || "YYYY-MM-DD HH:mm:ss");
  
  let systemPromptWithContext = `Current date and time: ${currentDateTime}\n`;
  if (serverName) systemPromptWithContext += `You are currently in the Discord server: "${serverName}" (ID: ${serverId || 'N/A'}).\n`;
  if (channelName) systemPromptWithContext += `You are currently in the channel: "${channelName}" (ID: ${channelId || 'N/A'}).\n`;
  if (userList && userList.length > 0) {
    systemPromptWithContext += `Current users in this server (DisplayName - Username - UserID - IsBot):\n`;
    userList.forEach(user => {
      systemPromptWithContext += `- ${user.displayName} - ${user.username} - (ID: ${user.id}) - (Bot: ${user.bot ? 'Yes' : 'No'})\n`;
    });
  }
  systemPromptWithContext += `\n${systemPrompt}`;

  let enhancedPrompt = originalPrompt;
  if (serverId && memManager) {
    const maxMessagesForContext = contextOptions.useShortContext ? (contextOptions.messageCount || 3) : (appConfig.memory?.maxMessages || 10);
    const conversationContext = memManager.getServerContext(serverId, maxMessagesForContext);
    const specificUserContextFromMemory = contextOptions.useShortContext ? "" : memManager.getUserContext(serverId, channelId);
    
    let contextString = "";
    if (conversationContext) contextString += `Recent conversation history:\n${conversationContext}\n`;
    if (specificUserContextFromMemory) contextString += `Some specific user context from memory:\n${specificUserContextFromMemory}\n`;
    
    if (contextString) {
      enhancedPrompt = `${contextString}\nUser's current message: ${originalPrompt}`;
    } else {
      enhancedPrompt = `User's current message: ${originalPrompt}`;
    }
  }

    while (true) {
        const currentTime = Date.now();
        if (currentTime - startTime >= _LLM_MAX_TOTAL_RETRY_TIME) {
            console.error(`LLM API call for prompt "${originalPrompt.substring(0,50)}..." failed after 3 hours of retries.`);
            return LLM_OVERLOAD_ERROR;
        }

        try {
            const response = await axiosInstance.post(appConfig.llmApiUrl, {
                model: model, 
                max_tokens: 500,
                system: systemPromptWithContext, 
                messages: [{ role: "user", content: enhancedPrompt }]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': appConfig.llmApiKey,
                    'anthropic-version': '2023-06-01'
                },
                timeout: 60000 
            });
            return response.data.content[0].text;
        } catch (error) {
            const isRetryable = (error.response && [429, 500, 502, 503, 504, 529].includes(error.response.status)) ||
                                (!error.response && (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.code === 'ENETUNREACH' || error.code === 'ECONNRESET'));

            if (!isRetryable) {
                console.error(`Non-retryable LLM API error for prompt "${originalPrompt.substring(0,50)}...": ${error.message}`);
                if (error.response) {
                    console.error("API Error Details - Status:", error.response.status, "Data:", JSON.stringify(error.response.data, null, 2));
                } else if (error.request) {
                    console.error("API Error - No response received:", error.message);
                } else {
                    console.error("API Error - Setup issue:", error.message);
                }
                return LLM_UNRECOVERABLE_ERROR;
            }
            
            console.warn(`LLM API call attempt ${attempt + 1} failed with retryable error: ${error.message}. Status: ${error.response ? error.response.status : 'N/A'}.`);

            let delay;
            if (attempt < _LLM_RETRY_DELAYS.length) {
                delay = _LLM_RETRY_DELAYS[attempt];
            } else {
                delay = _LLM_HOURLY_RETRY_DELAY;
            }

            const timeElapsedSinceStart = Date.now() - startTime;
            const timeRemainingForRetries = _LLM_MAX_TOTAL_RETRY_TIME - timeElapsedSinceStart;

            if (delay > timeRemainingForRetries) {
                if (timeRemainingForRetries > 500) { 
                    delay = timeRemainingForRetries;
                } else {
                    console.error(`LLM API call for prompt "${originalPrompt.substring(0,50)}..." failed. No meaningful time left for retries within the 3-hour limit.`);
                    return LLM_STRUGGLE_ERROR;
                }
            }
            
            if (delay <= 0) {
                 console.error(`LLM API call for prompt "${originalPrompt.substring(0,50)}..." calculated zero or negative delay. Giving up.`);
                 return LLM_STRUGGLE_ERROR;
            }

            console.log(`Retrying LLM API call for prompt "${originalPrompt.substring(0,50)}..." in ${delay / 1000}s. Attempt ${attempt + 1}. Total time elapsed: ${((Date.now() - startTime)/1000).toFixed(0)}s.`);
            await _sleep(delay);
            attempt++;
        }
    }
}

async function callLLM_new(prompt, systemPrompt, serverId = null, channelId = null, serverName = null, channelName = null, userList = [], llmApiQueue, axiosInstance, appConfig, memManager, model = "claude-3-7-sonnet-20250219", contextOptions = {}) {
  return llmApiQueue.add(() => executeLlmRequestWithRetries(prompt, systemPrompt, serverId, channelId, serverName, channelName, userList, axiosInstance, appConfig, memManager, model, contextOptions));
}

export {
    _sleep,
    _LLM_RETRY_DELAYS,
    _LLM_MAX_TOTAL_RETRY_TIME,
    _LLM_HOURLY_RETRY_DELAY,
    executeLlmRequestWithRetries,
    callLLM_new
};

