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

// profanity-lut-generator.js
// Run this script separately to pre-compute and optimize profanity detection patterns

import * as fs from "fs";
import * as path from "path";

// Configuration
const dataDir = ('data');
const moderationDir = path.join(dataDir, 'moderation');
const inputFile = path.join(moderationDir, 'hate_speech_lexicon.txt');
const outputFile = path.join(moderationDir, 'profanity_lut.json');

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

// Normalize text by replacing common character substitutions
function normalizeText(text) {
    let normalized = text.toLowerCase();
    
    // Replace all mapped characters - safely handling regex special characters
    for (const [char, replacement] of Object.entries(CHAR_SUBSTITUTIONS)) {
        // Escape special regex characters
        const escapedChar = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        normalized = normalized.replace(new RegExp(escapedChar, 'g'), replacement);
    }
    
    // Handle repeated characters (e.g., "heeeeello" -> "hello")
    normalized = normalized.replace(/(.)\1{2,}/g, '$1');
    
    return normalized;
}

// Create data directories if they don't exist
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}
if (!fs.existsSync(moderationDir)) {
    fs.mkdirSync(moderationDir);
}

// Check if input file exists
if (!fs.existsSync(inputFile)) {
    console.error(`Input file ${inputFile} not found.`);
    console.log('Creating placeholder file...');
    
    fs.writeFileSync(inputFile, 
        "# Hate speech lexicon - Add one term per line\n" +
        "# Lines starting with # are comments\n" +
        "# IMPORTANT: Keep this file secure\n" +
        "example_slur1\n" +
        "example_slur2\n"
    );
    
    console.log(`Created placeholder file at ${inputFile}`);
    console.log('Please add your actual profanity terms to this file, then run this script again.');
    process.exit(1);
}

// Load the profanity list
function loadProfanityList() {
    try {
        const fileContent = fs.readFileSync(inputFile, 'utf8');
        const profanityList = fileContent.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#')); // Skip empty lines and comments
        
        console.log(`Loaded ${profanityList.length} terms from profanity list`);
        return profanityList;
    } catch (error) {
        console.error('Error loading profanity list:', error);
        process.exit(1);
    }
}

// Generate common variations of a word for direct lookup
function generateVariations(word) {
    const variations = new Set();
    const normalized = normalizeText(word);
    
    // Add the original word and its normalized version
    variations.add(word.toLowerCase());
    variations.add(normalized);
    
    // Generate variations with common character substitutions
    let substitutionVariations = [word.toLowerCase()];
    const charMaps = {
        'a': ['4', '@'],
        'e': ['3'],
        'i': ['1', '!', '|'],
        'o': ['0'],
        's': ['$', '5'],
        't': ['7'],
        'l': ['1'],
    };
    
    // Generate up to a reasonable number of variations to avoid combinatorial explosion
    // For each character in the word, if it has common substitutions, create variations
    for (let i = 0; i < word.length; i++) {
        const char = word[i].toLowerCase();
        const substitutions = charMaps[char];
        
        if (substitutions) {
            const newVariations = [];
            for (const currentVariation of substitutionVariations) {
                for (const sub of substitutions) {
                    newVariations.push(
                        currentVariation.substring(0, i) + sub + currentVariation.substring(i + 1)
                    );
                }
            }
            
            // Add these new variations to our collection
            // Limit the number to prevent explosion for long words
            if (substitutionVariations.length * newVariations.length < 100) {
                substitutionVariations = [...substitutionVariations, ...newVariations];
            } else {
                // Just add some representative variations
                substitutionVariations = [...substitutionVariations, ...newVariations.slice(0, 20)];
            }
        }
    }
    
    // Add all the substitution variations to our set
    for (const variation of substitutionVariations) {
        variations.add(variation);
    }
    
    // Generate variations with spaces or symbols between letters
    // (Just a few common patterns to keep the LUT size reasonable)
    const spacers = [' ', '.', '-', '_'];
    for (const spacer of spacers) {
        let spacedWord = '';
        for (let i = 0; i < word.length; i++) {
            spacedWord += word[i].toLowerCase();
            if (i < word.length - 1) spacedWord += spacer;
        }
        variations.add(spacedWord);
    }
    
    return [...variations];
}

// Calculate Levenshtein distance
function levenshteinDistance(str1, str2) {
    const track = Array(str2.length + 1).fill(null).map(() => 
        Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {
        track[0][i] = i;
    }
    
    for (let j = 0; j <= str2.length; j++) {
        track[j][0] = j;
    }
    
    for (let j = 1; j <= str2.length; j++) {
        for (let i = 1; i <= str1.length; i++) {
            const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    
    return track[str2.length][str1.length];
}

// Generate similar word variations based on Levenshtein distance
function generateSimilarWords(word, threshold = 0.16) {
    // This is more limited to keep the LUT size manageable
    // We're looking for common typos and simple substitutions
    
    const similar = new Set();
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    
    // Skip for very short words to avoid excessive false positives
    if (word.length <= 3) return [...similar];
    
    // 1. Character substitutions
    for (let i = 0; i < word.length; i++) {
        for (let c of chars) {
            if (c !== word[i]) {
                const variant = word.substring(0, i) + c + word.substring(i + 1);
                
                // Check if this variant has acceptable Levenshtein distance
                const distance = levenshteinDistance(word, variant);
                const similarity = 1 - (distance / Math.max(word.length, variant.length));
                
                if (similarity >= (1 - threshold)) {
                    similar.add(variant);
                }
            }
        }
    }
    
    // 2. Character insertions (only for shorter words to limit explosion)
    if (word.length <= 6) {
        for (let i = 0; i <= word.length; i++) {
            for (let c of chars) {
                const variant = word.substring(0, i) + c + word.substring(i);
                
                // Check if this variant has acceptable Levenshtein distance
                const distance = levenshteinDistance(word, variant);
                const similarity = 1 - (distance / Math.max(word.length, variant.length));
                
                if (similarity >= (1 - threshold)) {
                    similar.add(variant);
                }
            }
        }
    }
    
    // 3. Character deletions
    for (let i = 0; i < word.length; i++) {
        const variant = word.substring(0, i) + word.substring(i + 1);
        
        // Check if this variant has acceptable Levenshtein distance
        const distance = levenshteinDistance(word, variant);
        const similarity = 1 - (distance / Math.max(word.length, variant.length));
        
        if (similarity >= (1 - threshold)) {
            similar.add(variant);
        }
    }
    
    return [...similar];
}

// Generate regex patterns for finding deliberate evasions
function generateRegexPatterns(word) {
    const patterns = [];
    
    // Skip very short words (1-2 chars)
    if (word.length <= 2) return patterns;
    
	try {
      // Pattern for detecting spaces/symbols between letters
      let spacedPattern = '\\b';
      for (let i = 0; i < word.length; i++) {
		const escapedChar = word[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape each character
		spacedPattern += escapedChar + (i < word.length - 1 ? '[\\s.*_\\-]*' : '');
      }
      spacedPattern += '\\b';
    
      patterns.push(spacedPattern);
        
        // Pattern for common letter substitutions for longer words
        if (word.length >= 4) {
            let substitutionPattern = '\\b';
            
            for (let i = 0; i < word.length; i++) {
                const char = word[i];
                
                // Add character classes for common substitutions
                switch(char.toLowerCase()) {
                    case 'a':
                        substitutionPattern += '[a4@á]';
                        break;
                    case 'e':
                        substitutionPattern += '[e3é]';
                        break;
                    case 'i':
                        substitutionPattern += '[i1!|í]';
                        break;
                    case 'o':
                        substitutionPattern += '[o0øó]';
                        break;
                    case 's':
                        substitutionPattern += '[s$5]';
                        break;
                    case 't':
                        substitutionPattern += '[t7]';
                        break;
                    case 'l':
                        substitutionPattern += '[l1]';
                        break;
                    default:
                        substitutionPattern += char;
                }
            }
            
            substitutionPattern += '\\b';
            patterns.push(substitutionPattern);
        }
    } catch (e) {
		console.warn(`Error creating pattern for "${word}": ${e.message}`);
    }
    
    return patterns;
}

// Main function to generate the LUT
function generateProfanityLUT() {
    const profanityList = loadProfanityList();
    const lut = {
        version: "1.0",
        updated: new Date().toISOString(),
        threshold: 0.16,
        exactMatches: {},      // Holds exact strings to match
        normalizedMatches: {}, // Holds normalized strings to check after normalizing input
        regexPatterns: [],     // Holds regex patterns as strings
    };
    
    // For each profanity term
    let variationsCount = 0;
    let similarCount = 0;
    
    for (const term of profanityList) {
        // Skip empty terms
        if (!term) continue;
        
        // Store the normalized version
        const normalizedTerm = normalizeText(term);
        lut.normalizedMatches[normalizedTerm] = term;
        
        // Generate variations for exact matching
        const variations = generateVariations(term);
        for (const variation of variations) {
            lut.exactMatches[variation] = term;
        }
        variationsCount += variations.length;
        
        // Generate "similar" words based on Levenshtein distance
        const similarWords = generateSimilarWords(term);
        for (const similar of similarWords) {
            lut.exactMatches[similar] = term;
        }
        similarCount += similarWords.length;
        
        // Store regex patterns
        const patterns = generateRegexPatterns(term);
        lut.regexPatterns.push(...patterns);
    }
    
    // Print statistics
    console.log(`Generated profanity LUT with:`);
    console.log(`- ${Object.keys(lut.exactMatches).length} exact match variations (${variationsCount} character substitutions, ${similarCount} Levenshtein variants)`);
    console.log(`- ${Object.keys(lut.normalizedMatches).length} normalized terms`);
    console.log(`- ${lut.regexPatterns.length} regex patterns`);
    
    // Write to file
    fs.writeFileSync(outputFile, JSON.stringify(lut, null, 2));
    console.log(`Saved LUT to ${outputFile}`);
    
    return lut;
}

// Run the generator
generateProfanityLUT();

console.log('\nLUT generation complete!');
