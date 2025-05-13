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

// profanity-test-cli.js
// A simple CLI tool to test both profanity filtering systems with colored output

import readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk'; // For colored console output

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up paths for moderation data
const dataDir = path.join(__dirname, "data");
const moderationDir = path.join(dataDir, "moderation");
const profanityLutPath = path.join(moderationDir, "profanity_lut.json");

// Initialize readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Common profanity list for our improved filter
const COMMON_PROFANITY = [
  'fuck', 'shit', 'ass', 'bitch', 'cunt', 'bastard', 'dick',
  'asshole', 'bullshit', 'cock', 'pussy', 'whore', 'rape'
];

// Function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Setup enhanced profanity filter
let filter = {
  isProfane: (text) => {
    const lowerText = text.toLowerCase();
    
    // First check exact word matches with word boundaries
    for (const word of COMMON_PROFANITY) {
      const escapedWord = escapeRegExp(word); // Escape special regex characters
      const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
      if (regex.test(lowerText)) return true;
    }
    
    // Then check for profanity within words (no boundaries)
    for (const word of COMMON_PROFANITY) {
      if (lowerText.includes(word)) return true;
    }
    
    return false;
  },
  
  clean: (text) => {
    let sanitized = text;
    
    // Replace exact words first (with word boundaries)
    for (const word of COMMON_PROFANITY) {
      const escapedWord = escapeRegExp(word); // Escape special regex characters
      const regex = new RegExp(`\\b${escapedWord}\\b`, 'gi');
      sanitized = sanitized.replace(regex, match => {
        const firstChar = match.charAt(0);
        return firstChar + '*'.repeat(match.length - 1);
      });
    }
    
    // Then replace profanity within words
    for (const word of COMMON_PROFANITY) {
      try {
        // Case-insensitive global replacement
        const escapedWord = escapeRegExp(word); // Escape special regex characters
        const regex = new RegExp(escapedWord, 'gi');
        sanitized = sanitized.replace(regex, match => {
          const firstChar = match.charAt(0);
          return firstChar + '*'.repeat(match.length - 1);
        });
      } catch (error) {
        console.error(chalk.red(`Error creating regex for "${word}": ${error.message}`));
      }
    }
    
    return sanitized;
  }
};

// Try to load bad-words library, but use our enhanced filter if it fails
import('bad-words').then(module => {
  // Fix: Try different ways the module might export the Filter
  const BadWordsFilter = module.default || module.Filter || module;
  if (typeof BadWordsFilter === 'function') {
    // Create a modified filter that keeps first letter
    const originalFilter = new BadWordsFilter();
    
    // Override the clean method to keep first letter
    filter = {
      isProfane: (text) => {
        // First check our direct patterns
        const directCheck = COMMON_PROFANITY.some(word => {
          return text.toLowerCase().includes(word);
        });
        
        if (directCheck) return true;
        
        // Fall back to bad-words library
        return originalFilter.isProfane(text);
      },
      
      clean: (text) => {
        // First clean using our direct patterns
        let result = text;
        
        for (const word of COMMON_PROFANITY) {
          try {
            // Case-insensitive global replacement
            const escapedWord = escapeRegExp(word); // Escape special regex characters
            const regex = new RegExp(escapedWord, 'gi');
            result = result.replace(regex, match => {
              const firstChar = match.charAt(0);
              return firstChar + '*'.repeat(match.length - 1);
            });
          } catch (error) {
            console.error(chalk.red(`Error creating regex for "${word}": ${error.message}`));
          }
        }
        
        // If our patterns didn't change anything, try the library
        if (result === text && originalFilter.list) {
          // Get the list of profane words found by the library
          try {
            const words = originalFilter.list.filter(word => {
              try {
                const escapedWord = escapeRegExp(word); // Escape special regex characters
                const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
                return regex.test(text);
              } catch (error) {
                console.error(chalk.red(`Error creating regex for library word "${word}": ${error.message}`));
                return false;
              }
            });
            
            // Replace each word keeping the first letter
            for (const word of words) {
              try {
                const escapedWord = escapeRegExp(word); // Escape special regex characters
                const regex = new RegExp(escapedWord, 'gi');
                result = result.replace(regex, match => {
                  const firstChar = match.charAt(0);
                  return firstChar + '*'.repeat(match.length - 1);
                });
              } catch (error) {
                console.error(chalk.red(`Error replacing library word "${word}": ${error.message}`));
              }
            }
          } catch (error) {
            console.error(chalk.red(`Error processing bad-words list: ${error.message}`));
          }
        }
        
        return result;
      }
    };
    
    console.log(chalk.green("✓ Enhanced profanity filter loaded successfully"));
  } else {
    console.log(chalk.yellow("⚠ Using custom profanity filter (bad-words format issue)"));
  }
  startCLI(); // Start CLI after filter is configured
}).catch(err => {
  console.error(chalk.red(`× Error loading profanity filter: ${err.message}`));
  console.log(chalk.yellow("⚠ Using custom profanity filter"));
  startCLI();
});
  
// Normalize text by replacing common character substitutions
function normalizeText(text) {
  let normalized = text.toLowerCase();
  
  // Character substitution map for normalization
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
    const escapedChar = escapeRegExp(char); // Use escapeRegExp function
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
    // First try to load the LUT
    if (fs.existsSync(profanityLutPath)) {
      const lutData = fs.readFileSync(profanityLutPath, 'utf8');
      profanityLUT = JSON.parse(lutData);
      console.log(chalk.green(`✓ Loaded profanity LUT with ${Object.keys(profanityLUT.exactMatches).length} exact matches and ${profanityLUT.regexPatterns.length} patterns`));
      
      // Compile the regex patterns
      COMPILED_REGEX_PATTERNS = profanityLUT.regexPatterns.map(pattern => {
        try {
          return new RegExp(pattern, 'i');
        } catch (e) {
          console.warn(chalk.yellow(`⚠ Error compiling regex pattern: ${e.message}`));
          return null;
        }
      }).filter(Boolean); // Remove any null patterns
      
      return true;
    } else {
      console.warn(chalk.yellow("⚠ Profanity LUT not found. Falling back to direct file loading."));
      return false;
    }
  } catch (error) {
    console.error(chalk.red(`× Error loading profanity LUT: ${error.message}`));
    return false;
  }
}

// Fallback: Load profanity list directly from file if LUT not available
function loadProfanityList() {
  const profanityFilePath = path.join(moderationDir, "hate_speech_lexicon.txt");
  
  // Check if file exists - create with placeholder if it doesn't
  if (!fs.existsSync(profanityFilePath)) {
    console.warn(chalk.yellow(`⚠ Profanity file not found at ${profanityFilePath}. Creating placeholder file.`));
    
    // Ensure directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    if (!fs.existsSync(moderationDir)) {
      fs.mkdirSync(moderationDir);
    }
    
    fs.writeFileSync(profanityFilePath, 
      "# Hate speech lexicon - Add one term per line\n" +
      "# Lines starting with # are comments\n" +
      "# IMPORTANT: Keep this file secure\n" +
      "example_slur1\n" +
      "example_slur2\n"
    );
  }
  
  try {
    // Read and parse file
    const fileContent = fs.readFileSync(profanityFilePath, 'utf8');
    const profanityList = fileContent.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#')); // Skip empty lines and comments
    
    console.log(chalk.green(`✓ Loaded ${profanityList.length} terms from profanity list file`));
    return profanityList;
  } catch (error) {
    console.error(chalk.red(`× Error loading profanity list: ${error.message}`));
    return []; // Return empty array as fallback
  }
}

// Initialize profanity detection - prefer LUT, fall back to direct list
if (!loadProfanityDetection()) {
  PROFANITY_LIST = loadProfanityList();
}

// Optimized profanity check using LUT if available (for egregious content)
function containsEgregiousProfanity(text) {
  // If we have LUT available, use the optimized approach
  if (profanityLUT) {
    const lowerText = text.toLowerCase();
    
    // 1. Check for exact matches
    const words = lowerText.split(/\s+/);
    for (const word of words) {
      if (profanityLUT.exactMatches[word]) {
        return {
          detected: true,
          method: "exact match",
          term: profanityLUT.exactMatches[word]
        };
      }
    }
    
    // 2. Check for normalized matches
    const normalizedText = normalizeText(text);
    for (const [normalizedBadWord, original] of Object.entries(profanityLUT.normalizedMatches)) {
      if (normalizedText.includes(normalizedBadWord)) {
        return {
          detected: true,
          method: "normalized match",
          term: original
        };
      }
    }
    
    // 3. Check against regex patterns
    for (let i = 0; i < COMPILED_REGEX_PATTERNS.length; i++) {
      if (COMPILED_REGEX_PATTERNS[i].test(text)) {
        return {
          detected: true,
          method: "regex pattern",
          pattern: profanityLUT.regexPatterns[i]
        };
      }
    }
    
    return { detected: false };
  } 
  // Fallback to direct list checking if LUT is not available
  else if (PROFANITY_LIST.length > 0) {
    const lowerText = text.toLowerCase();
    const normalizedText = normalizeText(text);
    
    // Direct match check
    for (const term of PROFANITY_LIST) {
      if (lowerText.includes(term.toLowerCase())) {
        return {
          detected: true,
          method: "direct match",
          term: term
        };
      }
      
      // Word boundary check
      try {
        const escapedTerm = escapeRegExp(term.toLowerCase()); // Escape special regex characters
        const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
        if (regex.test(lowerText)) {
          return {
            detected: true,
            method: "boundary match",
            term: term
          };
        }
      } catch (e) {
        // Skip if regex is invalid
        console.warn(chalk.yellow(`Skipping invalid regex pattern for "${term}": ${e.message}`));
      }
      
      // Normalized check
      const normalizedTerm = normalizeText(term);
      if (normalizedText.includes(normalizedTerm)) {
        return {
          detected: true,
          method: "normalized match",
          term: term
        };
      }
    }
    
    return { detected: false };
  }
  
  // If no detection method is available, default to safe option
  return { detected: false, error: "No detection method available" };
}

// Function to sanitize text using regular profanity filter
function sanitizeText(text) {
  if (!filter) {
    return {
      sanitized: text,
      error: "Filter not loaded yet"
    };
  }
  
  try {
    const isProfane = filter.isProfane(text);
    return {
      isProfane,
      sanitized: isProfane ? filter.clean(text) : text
    };
  } catch (error) {
    console.error(chalk.red(`Error sanitizing text: ${error.message}`));
    return {
      isProfane: false,
      sanitized: text,
      error: error.message
    };
  }
}

// Feature to add new terms to the lexicon
function addTermToLexicon(term) {
  try {
    const lexiconPath = path.join(moderationDir, "hate_speech_lexicon.txt");
    
    // Ensure the directories exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    if (!fs.existsSync(moderationDir)) {
      fs.mkdirSync(moderationDir);
    }
    
    // Check if file exists, create if not
    if (!fs.existsSync(lexiconPath)) {
      fs.writeFileSync(lexiconPath, 
        "# Hate speech lexicon - Add one term per line\n" +
        "# Lines starting with # are comments\n" +
        "# IMPORTANT: Keep this file secure\n"
      );
    }
    
    // Check if term already exists
    const content = fs.readFileSync(lexiconPath, 'utf8');
    const terms = content.split('\n').map(t => t.trim());
    
    if (terms.includes(term)) {
      return { success: false, message: "Term already exists in lexicon" };
    }
    
    // Add the term
    fs.appendFileSync(lexiconPath, `\n${term}`);
    return { 
      success: true, 
      message: `Added "${term}" to hate speech lexicon. Remember to regenerate your LUT!` 
    };
  } catch (error) {
    return { success: false, message: `Error adding term: ${error.message}` };
  }
}

// Start the CLI
function startCLI() {
  console.log(chalk.cyan("\n===== Profanity Filter Test CLI ====="));
  console.log(chalk.cyan("Type any text to test both filtering systems"));
  console.log(chalk.cyan("Commands:"));
  console.log(chalk.cyan("  !add <term> - Add a term to the hate speech lexicon"));
  console.log(chalk.cyan("  !test <text> - Test normalized text detection"));
  console.log(chalk.cyan("  !exit - Quit the program"));
  console.log(chalk.cyan("=====================================\n"));
  
  promptUser();
}

// Prompt for input
function promptUser() {
  rl.question(chalk.cyan("> "), (input) => {
    if (input.toLowerCase() === '!exit') {
      console.log(chalk.yellow("Goodbye!"));
      rl.close();
      return;
    }
    
    // Command to add a term to the lexicon
    if (input.startsWith('!add ')) {
      const term = input.substring(5).trim();
      if (term) {
        const result = addTermToLexicon(term);
        if (result.success) {
          console.log(chalk.green(result.message));
        } else {
          console.log(chalk.yellow(result.message));
        }
      } else {
        console.log(chalk.red("Please specify a term to add"));
      }
      promptUser();
      return;
    }
    
    // Command to test specific normalized text
    if (input.startsWith('!test ')) {
      const text = input.substring(6).trim();
      console.log(`Original: "${text}"`);
      console.log(`Normalized: "${normalizeText(text)}"`);
      promptUser();
      return;
    }
    
    // Test the input
    testText(input);
    
    // Prompt again
    promptUser();
  });
}

// Test function
function testText(text) {
  console.log(chalk.gray("Input: ") + text);
  console.log(chalk.gray("Normalized: ") + normalizeText(text));
  
  // Check for egregious profanity
  const egregiousResult = containsEgregiousProfanity(text);
  
  if (egregiousResult.detected) {
    console.log(chalk.red("⚠ EGREGIOUS CONTENT DETECTED ⚠"));
    console.log(chalk.red(`Detection method: ${egregiousResult.method}`));
    if (egregiousResult.term) {
      console.log(chalk.red(`Matched term: ${egregiousResult.term}`));
    }
    if (egregiousResult.pattern) {
      console.log(chalk.red(`Matched pattern: ${egregiousResult.pattern}`));
    }
    console.log(chalk.red("This would trigger a warning and timeout"));
  } else {
    console.log(chalk.green("✓ No egregious content detected"));
  }
  
  // Check for regular profanity
  try {
    const sanitizeResult = sanitizeText(text);
    
    if (sanitizeResult.isProfane) {
      console.log(chalk.yellow("! Regular profanity detected - would be sanitized"));
      console.log(chalk.yellow(`Sanitized: "${sanitizeResult.sanitized}"`));
    } else {
      console.log(chalk.green("✓ No regular profanity detected"));
    }
  } catch (error) {
    console.error(chalk.red(`Error testing for regular profanity: ${error.message}`));
  }
  
  console.log(""); // Empty line for readability
}

// Handle Ctrl+C
rl.on('SIGINT', () => {
  console.log(chalk.yellow("\nGoodbye!"));
  rl.close();
});