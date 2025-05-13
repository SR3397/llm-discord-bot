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

// moderation.js - Optimized with LUT-based profanity detection
import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { escapeRegExp } from './utils.js';
import chalk from 'chalk';

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up paths for database and moderation data
const dbPath = path.join(__dirname, "user_offenses.sqlite");
const dataDir = path.join(__dirname, "data");
const moderationDir = path.join(dataDir, "moderation");
const profanityLutPath = path.join(moderationDir, "profanity_lut.json");

// Ensure data directories exist
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}
if (!fs.existsSync(moderationDir)) {
    fs.mkdirSync(moderationDir);
}

// Initialize database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error opening SQLite database:", err.message);
    } else {
        console.log(chalk.green("Connected to the SQLite database for user offenses."));
        db.run(`CREATE TABLE IF NOT EXISTS user_offenses (
            userId TEXT PRIMARY KEY,
            offenseCount INTEGER DEFAULT 0,
            timeoutUntil INTEGER DEFAULT 0
        )`, (err) => {
            if (err) {
                console.error("Error creating user_offenses table:", err.message);
            }
        });
    }
});

// Common profanity list for our enhanced filter
const COMMON_PROFANITY = [
  'fuck', 'shit', 'ass', 'bitch', 'cunt', 'bastard', 'dick',
  'asshole', 'bullshit', 'cock', 'pussy', 'whore', 'rape',
];

// Create single regex for efficiency
const profanityRegex = new RegExp(`(${COMMON_PROFANITY.map(escapeRegExp).join("|")})`, 'gi');

// Setup enhanced profanity filter
let filter = {
  isProfane: (text) => {
    return profanityRegex.test(text.toLowerCase());
  },
  clean: (text) => {
    return text.replace(profanityRegex, match => {
      const firstChar = match.charAt(0);
      return firstChar + '*'.repeat(match.length - 1);
    });
  }
};

// Load regular profanity filter with dynamic import
import('bad-words').then(module => {
    const BadWordsFilter = module.default || module.Filter || module;
    if (typeof BadWordsFilter === 'function') {
        const originalFilter = new BadWordsFilter();
        filter = {
            isProfane: (text) => {
                if (profanityRegex.test(text.toLowerCase())) return true;
                return originalFilter.isProfane(text);
            },
            clean: (text) => {
                let result = text.replace(profanityRegex, match => {
                    const firstChar = match.charAt(0);
                    return firstChar + '*'.repeat(match.length - 1);
                });
                if (result === text && originalFilter.list) {
                    const words = originalFilter.list.filter(word => {
                        try {
                            const escapedWord = escapeRegExp(word);
                            const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
                            return regex.test(text);
                        } catch (error) {
                            console.error(`Error creating regex for library word "${word}": ${error.message}`);
                            return false;
                        }
                    });
                    for (const word of words) {
                        try {
                            const escapedWord = escapeRegExp(word);
                            const regex = new RegExp(escapedWord, 'gi');
                            result = result.replace(regex, match => {
                                const firstChar = match.charAt(0);
                                return firstChar + '*'.repeat(match.length - 1);
                            });
                        } catch (error) {
                            console.error(`Error replacing library word "${word}": ${error.message}`);
                        }
                    }
                }
                return result;
            }
        };
        console.log(chalk.green("Enhanced profanity filter loaded successfully"));
    } else {
        console.log(chalk.yellow("Using custom profanity filter (bad-words format issue)"));
    }
}).catch(err => {
    console.error(`Error loading profanity filter: ${err.message}`);
    console.log("Using custom profanity filter");
});

// Timeout thresholds - graduated system
const TIMEOUT_THRESHOLDS = {
    3: 5 * 60 * 1000,
    4: 0,
    5: 15 * 60 * 1000,
    6: 60 * 60 * 1000,
    7: 6 * 60 * 60 * 1000,
    8: 24 * 60 * 60 * 1000,
    9: 7 * 24 * 60 * 60 * 1000,
    10: 30 * 24 * 60 * 60 * 1000,
    11: 365 * 24 * 60 * 60 * 1000,
    12: Infinity
};

// Normalize text by replacing common character substitutions
function normalizeText(text) {
    let normalized = text.toLowerCase();
    const CHAR_SUBSTITUTIONS = {
        '0': 'o', 'ø': 'o', 'ö': 'o', 'ô': 'o', 'ò': 'o', 'ó': 'o', 'õ': 'o',
        '1': 'i', '!': 'i', '|': 'i', 'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        '2': 'z',
        '3': 'e', 'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        '4': 'a', 'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', '@': 'a',
        '5': 's', '$': 's',
        '6': 'g',
        '7': 't',
        '8': 'b',
        '9': 'g',
        'ç': 'c',
        'ñ': 'n',
        'ü': 'u', 'û': 'u', 'ù': 'u', 'ú': 'u',
        'ÿ': 'y',
        '*': '',
        '.': '',
        ' ': '',
        '-': '',
        '_': '',
        '+': '',
        ',': ''
    };
    for (const [char, replacement] of Object.entries(CHAR_SUBSTITUTIONS)) {
        const escapedChar = escapeRegExp(char);
        normalized = normalized.replace(new RegExp(escapedChar, 'g'), replacement);
    }
    normalized = normalized.replace(/(.)\1{2,}/g, '$1');
    return normalized;
}

// Load and initialize LUT-based profanity detection
let profanityLUT = null;
let COMPILED_REGEX_PATTERNS = [];
let PROFANITY_LIST = [];

function loadProfanityDetection() {
    try {
        if (fs.existsSync(profanityLutPath)) {
            const lutData = fs.readFileSync(profanityLutPath, 'utf8');
            profanityLUT = JSON.parse(lutData);
            console.log(chalk.green(`Loaded profanity LUT with ${Object.keys(profanityLUT.exactMatches).length} exact matches and ${profanityLUT.regexPatterns.length} patterns`));
            COMPILED_REGEX_PATTERNS = profanityLUT.regexPatterns.map(pattern => {
                try {
                    return new RegExp(pattern, 'i');
                } catch (e) {
                    console.warn(`Error compiling regex pattern: ${e.message}`);
                    return null;
                }
            }).filter(Boolean);
            return true;
        } else {
            console.warn("Profanity LUT not found. Falling back to direct file loading.");
            return false;
        }
    } catch (error) {
        console.error("Error loading profanity LUT:", error);
        return false;
    }
}

function loadProfanityList() {
    const profanityFilePath = path.join(moderationDir, "hate_speech_lexicon.txt");
    if (!fs.existsSync(profanityFilePath)) {
        console.warn(`Profanity file not found at ${profanityFilePath}. Creating placeholder file.`);
        fs.writeFileSync(profanityFilePath, 
            "# Unambiguous Hate Speech Lexicon - Ban-Level\n" +
            "# Lines starting with # are comments\n" +
            "# For automatic bans in content moderation; keep secure\n" +
            "# Includes only severe, unambiguous slurs targeting protected groups (race, ethnicity, religion, gender, etc.)\n" +
            "# IMPORTANT: Keep this file secure\n" +
            "example_slur1\n" +
            "example_slur2\n"
        );
    }
    try {
        const fileContent = fs.readFileSync(profanityFilePath, 'utf8');
        const profanityList = fileContent.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
        console.log(`Loaded ${profanityList.length} terms from profanity list file`);
        return profanityList;
    } catch (error) {
        console.error('Error loading profanity list:', error);
        return [];
    }
}

if (!loadProfanityDetection()) {
    PROFANITY_LIST = loadProfanityList();
}

function addTermToLexicon(term) {
    try {
        const lexiconPath = path.join(moderationDir, "hate_speech_lexicon.txt");
        if (!fs.existsSync(lexiconPath)) {
            fs.writeFileSync(lexiconPath, 
                "# Unambiguous Hate Speech Lexicon - Ban-Level\n" +
                "# Lines starting with # are comments\n" +
                "# For automatic bans in content moderation; keep secure\n" +
                "# Includes only severe, unambiguous slurs targeting protected groups (race, ethnicity, religion, gender, etc.)\n" +
                "# IMPORTANT: Keep this file secure\n"
            );
        }
        const content = fs.readFileSync(lexiconPath, 'utf8');
        const terms = content.split('\n').map(t => t.trim());
        if (terms.includes(term)) {
            return { success: false, message: "Term already exists in lexicon" };
        }
        fs.appendFileSync(lexiconPath, `\n${term}`);
        return { 
            success: true, 
            message: `Added "${term}" to hate speech lexicon. Remember to regenerate your LUT!` 
        };
    } catch (error) {
        return { success: false, message: `Error adding term: ${error.message}` };
    }
}

function containsEgregiousProfanity(text) {
    if (profanityLUT) {
        const lowerText = text.toLowerCase();
        const words = lowerText.split(/\s+/);
        for (const word of words) {
            if (profanityLUT.exactMatches[word]) {
                return true;
            }
        }
        const normalizedText = normalizeText(text);
        for (const [normalizedBadWord, original] of Object.entries(profanityLUT.normalizedMatches)) {
            if (normalizedText.includes(normalizedBadWord)) {
                return true;
            }
        }
        for (const pattern of COMPILED_REGEX_PATTERNS) {
            if (pattern.test(text)) {
                return true;
            }
        }
        return false;
    } else if (PROFANITY_LIST.length > 0) {
        const lowerText = text.toLowerCase();
        const normalizedText = normalizeText(text);
        for (const term of PROFANITY_LIST) {
            if (lowerText.includes(term.toLowerCase())) {
                return true;
            }
            try {
                const escapedTerm = escapeRegExp(term.toLowerCase());
                const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
                if (regex.test(lowerText)) {
                    return true;
                }
            } catch (e) {
                console.warn(`Invalid regex pattern for "${term}": ${e.message}`);
            }
            const normalizedTerm = normalizeText(term);
            if (normalizedText.includes(normalizedTerm)) {
                return true;
            }
        }
        return false;
    }
    return false;
}

function reloadProfanityDetection() {
    profanityLUT = null;
    COMPILED_REGEX_PATTERNS = [];
    PROFANITY_LIST = [];
    if (!loadProfanityDetection()) {
        PROFANITY_LIST = loadProfanityList();
    }
    if (profanityLUT) {
        return {
            method: "LUT",
            exactMatches: Object.keys(profanityLUT.exactMatches).length,
            regexPatterns: COMPILED_REGEX_PATTERNS.length
        };
    } else {
        return {
            method: "direct",
            terms: PROFANITY_LIST.length
        };
    }
}

function sanitizeText(text) {
    if (!filter) {
        return new Promise((resolve) => {
            setTimeout(() => {
                if (filter) {
                    resolve(filter.isProfane(text) ? filter.clean(text) : text);
                } else {
                    let result = text;
                    for (const word of COMMON_PROFANITY) {
                        try {
                            const escapedWord = escapeRegExp(word);
                            const regex = new RegExp(escapedWord, 'gi');
                            result = result.replace(regex, match => {
                                const firstChar = match.charAt(0);
                                return firstChar + '*'.repeat(match.length - 1);
                            });
                        } catch (error) {
                            console.error(`Error creating regex for "${word}": ${error.message}`);
                        }
                    }
                    resolve(result);
                }
            }, 100);
        });
    }
    return filter.isProfane(text) ? filter.clean(text) : text;
}

function testProfanityDetection(testText) {
    console.log(`Testing text: "${testText}"`);
    console.log(`Normalized: "${normalizeText(testText)}"`);
    const containsProfanity = containsEgregiousProfanity(testText);
    console.log(`Contains egregious profanity: ${containsProfanity}`);
    if (filter) {
        console.log(`Contains regular profanity: ${filter.isProfane(testText)}`);
        if (filter.isProfane(testText)) {
            console.log(`Sanitized: "${filter.clean(testText)}"`);
        }
    }
    return containsProfanity;
}

async function getUserOffenseData(userId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT * FROM user_offenses WHERE userId = ?", [userId], (err, row) => {
            if (err) {
                console.error("Error fetching user offense data:", err.message);
                reject(err);
            } else {
                resolve(row || { userId, offenseCount: 0, timeoutUntil: 0 });
            }
        });
    });
}

async function updateUserOffenseData(userId, offenseCount, timeoutUntil) {
    return new Promise((resolve, reject) => {
        db.run("INSERT OR REPLACE INTO user_offenses (userId, offenseCount, timeoutUntil) VALUES (?, ?, ?)", 
               [userId, offenseCount, timeoutUntil], (err) => {
            if (err) {
                console.error("Error updating user offense data:", err.message);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function incrementOffense(userId) {
    const userData = await getUserOffenseData(userId);
    userData.offenseCount++;
    let newTimeoutDuration = 0;
    if (TIMEOUT_THRESHOLDS[userData.offenseCount] !== undefined) {
        newTimeoutDuration = TIMEOUT_THRESHOLDS[userData.offenseCount];
    }
    let newTimeoutUntil = userData.timeoutUntil;
    if (newTimeoutDuration === Infinity) {
        newTimeoutUntil = Infinity;
    } else if (newTimeoutDuration > 0) {
        newTimeoutUntil = Math.max(newTimeoutUntil, Date.now() + newTimeoutDuration);
    }
    await updateUserOffenseData(userId, userData.offenseCount, newTimeoutUntil);
    console.log(chalk.red(`User ${userId} offense count incremented to ${userData.offenseCount}. Timeout until: ${newTimeoutUntil === Infinity ? 'Indefinite' : new Date(newTimeoutUntil).toISOString()}`));
    return { offenseCount: userData.offenseCount, timeoutUntil: newTimeoutUntil };
}

async function isUserTimedOut(userId) {
    const userData = await getUserOffenseData(userId);
    if (userData.timeoutUntil === Infinity) return { timedOut: true, timeLeft: Infinity };
    if (userData.timeoutUntil > Date.now()) {
        return { timedOut: true, timeLeft: userData.timeoutUntil - Date.now() };
    }
    return { timedOut: false, timeLeft: 0 };
}

async function generateAntiAbuseMessage(botPersonalityName, callLLMFunction, llmApiQueue, axiosInstance, appConfig, memManager) {
    const prompt = `A user has said something toxic and abusive. Respond in your character as ${botPersonalityName} with a firm but respectful message asking them to maintain positive conduct, and warning about potential timeouts. Keep it brief.`;
    try {
        const response = await callLLMFunction(
            prompt,
            `You are ${botPersonalityName}, a Discord bot. Your current task is to generate an anti-abuse warning.`,
            null,
            null,
            llmApiQueue,
            axiosInstance,
            appConfig,
            memManager
        );
        return response;
    } catch (error) {
        console.error("Error generating anti-abuse message via LLM:", error);
        return "Please be respectful. Further misconduct may result in a timeout.";
    }
}

export {
    getUserOffenseData,
    updateUserOffenseData,
    incrementOffense,
    isUserTimedOut,
    containsEgregiousProfanity,
    sanitizeText,
    reloadProfanityDetection,
    addTermToLexicon,
    testProfanityDetection,
    normalizeText,
    generateAntiAbuseMessage,
    db
};