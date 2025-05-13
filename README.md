# 🤖 Discord LLM Bot

A feature-rich Discord bot framework for creating multiple AI personalities powered by Large Language Models, bringing intelligent, customizable, and engaging conversations to your Discord server.

![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--v3-green)
![Node.js](https://img.shields.io/badge/Node.js-16.11.0+-green.svg)
![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg)

## ✨ Features

- 🧠 **AI-Powered Conversations** - Leverages Claude or other LLMs for natural, contextual responses
- 🎭 **Multiple Customizable Personalities** - Run several different bot personas simultaneously 
- 💬 **Context-Aware Responses** - Maintains conversation memory to provide relevant replies
- 🔄 **Unprompted Messages** - Initiates conversations based on configurable timers and conditions
- 🖼️ **GIF Integration** - Automatically includes relevant GIFs in responses
- 🛡️ **Content Moderation** - Sophisticated profanity and hate speech detection system
  - Optimized Look-Up Table (LUT) for efficient detection
  - Graduated timeout system for policy violations
  - Text sanitization for permitted but censored content
- ⚡ **Performance Optimized** - Request queuing, rate limiting, and exponential backoff for API calls
- 🔐 **SQLite Database** - Tracks user infractions and timeout status
- 🧰 **Admin Tools** - CLI utilities for testing and managing content moderation

## 📋 Prerequisites

- Node.js (v16.11.0 or higher)
- Discord Bot Token(s) - one for each personality you want to run
- Claude API key
- Tenor API key (for GIF integration)

## 🔧 Installation

1. **Clone the repository**

```bash
git clone https://github.com/SR3397/llm-discord-bot.git
cd llm-discord-bot
```

2. **Install dependencies**

```bash
npm install
```

3. **Choose a personality template**

```bash
# Copy one of the example templates to create your .env file
cp templates/ali_g.env.example .env

# Or for a different personality:
cp templates/conspiracy_theorist.env.example .env
```

4. **Edit your .env file with your API keys and configuration**

```bash
# Open with your preferred editor
nano .env  # or vim .env, etc.
```

5. **Initialize the moderation system**

```bash
node profanity-lut-generator.js
```

## 🚀 Usage

### Starting a Single Bot

```bash
node index.js
```

### Running Multiple Bots

For multiple personalities, create separate directories with symlinked dependencies:

```bash
# Create directories for each personality
mkdir -p discord_bots/{ali_g,conspiracy_theorist,shakespeare,pirate}

# Copy code files to each directory
cp *.js discord_bots/ali_g/
cp *.js discord_bots/conspiracy_theorist/
# Repeat for other personalities

# Create appropriate .env files in each directory
cp templates/ali_g.env.example discord_bots/ali_g/.env
cp templates/conspiracy_theorist.env.example discord_bots/conspiracy_theorist/.env
# Repeat for other personalities

# Create symlinks for node_modules to save space (Windows)
cd discord_bots
python create_symlinks.py

# Start all bots
python start_bots.py
```

The included `create_symlinks.py` and `start_bots.py` utilities help manage multiple bot instances efficiently.

### Basic Bot Interaction

The bots respond to:
- Direct mentions: `@BotName how are you?`
- Random messages based on chance (configurable via RESPONSE_CHANCE)

### Customizing Personalities

Each bot's personality is defined through environment variables in its `.env` file:

```
# Essential personality settings
BOT_NAME=Ali Tha G-Bot
SYSTEM_PROMPT=You are now Ali G, the fictional character created by Sacha Baron Cohen...

# Customize error messages to match the personality
ERROR_MESSAGE=Yo, check it! Me brain just crashed like Dave after too many Red Stripes...
```

Ready-to-use personality templates are available in the `templates/` directory.

### Fetching Message History

To populate a bot's memory with existing channel messages:

```bash
node fetch_messages.js --channel="your_channel_id"
```

Optional arguments:
- `--server="your_server_id"` - Fetch from a specific server
- First argument can be a number of messages to fetch (e.g., `node fetch_messages.js 200`)

### Content Moderation

To test content moderation:

```bash
node profanity-test-cli.js
```

This CLI tool allows you to:
- Test text against both profanity filters
- Add new terms to the lexicon with `!add term`
- Test normalized text detection with `!test text`

After adding terms, regenerate the LUT:

```bash
node profanity-lut-generator.js
```

## ⚙️ Configuration Options

### Environment Variables

Each bot's behavior is controlled through its `.env` file:

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_NAME` | The name of your bot personality | Required |
| `DISCORD_TOKEN` | Discord bot token | Required |
| `LLM_API_KEY` | LLM API key | Required |
| `LLM_API_URL` | LLM API endpoint | Required |
| `TENOR_API_KEY` | Tenor API key for GIFs | Required |
| `SYSTEM_PROMPT` | The core personality definition | Required |
| `RESPONSE_CHANCE` | Percentage chance to reply randomly | 18 |
| `GIF_CHANCE` | Percentage chance to include a GIF | 40 |
| `COOLDOWN` | Milliseconds between random replies | 12000 |
| `REPLY_RATE_LIMIT_SECONDS` | Global rate limit between messages | 18 |
| `TYPING_WPM` | Typing speed simulation (WPM) | 60 |
| `TIMEZONE` | Timezone for logs and timestamps | America/Chicago |
| `SANITIZATION_REPLY_MESSAGE` | Message to show when content is sanitized | "Hey, watch your language! Your message has been sanitized." |
| `ENABLE_SANITIZATION_REPLY` | Whether to reply with a message when content is sanitized | false |
| `TIMEOUT_DM_MESSAGE_TEMPLATE` | Template for timeout DM messages | "You are still timed out for {timeLeftFormatted}. Please wait before sending more messages." |
| `SEND_TIMEOUT_DM` | Whether to send DMs when a user is timed out | true |
| `ERROR_MESSAGE` | Custom error message for general errors | Generic message |
| `LLM_OVERLOAD_ERROR` | Error after maximum retries | Generic message |
| `LLM_STRUGGLE_ERROR` | Error during retry attempts | Generic message |
| `LLM_UNRECOVERABLE_ERROR` | Error for non-retryable failures | Generic message |
| `ENABLE_UNPROMPTED_MESSAGES` | Enable/disable unprompted messages | true |
| `DEFAULT_UNPROMPTED_CHANNEL_ID` | Channel for unprompted messages | Required for feature |\
| `UNPROMPTED_CHANCE_BUILD_INTERVAL_SECONDS` | Seconds between chance increases | 600 |
| `UNPROMPTED_CHANCE_BUILD_AMOUNT` | Base percentage increase per interval | 0.10 |
| `UNPROMPTED_ROLL_INTERVAL_SECONDS` | Seconds between random checks | 600 |
| `UNPROMPTED_MESSAGE_SYSTEM_PROMPT` | System prompt for unprompted messages | null (uses default personality) |
| `UNPROMPTED_MESSAGE_BASE_PROMPT` | Base prompt for unprompted messages | Default prompt |

Additional variables for fine-tuning are documented in the template files.

### Customizing Time-of-Day Behavior

The bot's unprompted message behavior can be adjusted based on time of day by modifying the modifiers in the `.env` file:

```
# Unprompted message time-of-day modifiers
UNPROMPTED_MODIFIER_MORNING=6
UNPROMPTED_MODIFIER_AFTERNOON=8.4
UNPROMPTED_MODIFIER_EVENING=10.5
UNPROMPTED_MODIFIER_NIGHT=1
```

## 📁 Project Structure

```
discord-llm-bot/
├── index.js                    # Main bot application
├── moderation.js               # Content moderation system
├── llm_enhancements.js         # LLM API utilities
├── utils.js                    # Common utility functions
├── profanity-lut-generator.js  # Generates lookup tables for profanity detection
├── profanity-test-cli.js       # CLI tool for testing content moderation
├── fetch_messages.js           # Utility to fetch message history
├── discord_bots/               # Folder for multi-bot usage
│   ├── create_symlinks.py      # Utility to create shared node_modules symlinks
│   └── start_bots.py           # Utility to start multiple bots simultaneously
├── templates/                  # Bot personality templates
│   ├── ali_g.env.example       # Ali G personality template
│   ├── conspiracy_theorist.env.example # Conspiracy theorist personality
│   ├── shakespeare.env.example # Shakespearean scholar personality
│   └── pirate.env.example      # Pirate captain personality
├── data/                       # Data directory
│   └── moderation/             # Moderation data
│       ├── hate_speech_lexicon.txt  # User-defined terms
│       └── profanity_lut.json  # Generated lookup table
├── memory/                     # Conversation memory storage
├── user_offenses.sqlite        # User offense database
└── .env                        # Environment configuration (from template)
```

## 🛠️ Advanced Customization

### Creating New Personalities

To create a new bot personality:

1. Copy one of the existing templates as a starting point:
   ```bash
   cp templates/ali_g.env.example templates/my_personality.env.example
   ```

2. Edit the template file, focusing on these key areas:
   - `BOT_NAME` - Set a distinctive name for your bot
   - `SYSTEM_PROMPT` - Define the core personality, speech patterns, and behavior
   - Custom error messages that match the personality's voice
   - Unprompted message prompt that fits the character

3. Adjust response rates and other behavior settings as needed

### Moderation System

The moderation system has two tiers:
1. **Standard profanity** - Automatically censored but allowed (configurable in `COMMON_PROFANITY` array)
2. **Egregious content** - Results in timeouts (defined in `hate_speech_lexicon.txt`)

Timeout durations are configurable in `TIMEOUT_THRESHOLDS` in `moderation.js`.

### Memory Management

The memory system stores conversations to provide context to the LLM. Configure:
- `maxMessages` - Maximum messages to store per server
- `maxMessagesToSummarize` - Maximum messages to summarize on startup
- `summaryMaxTokens` - Maximum tokens for summaries

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.