# ⚡ Kairo

Your AI-powered coding assistant — ask questions, plan features, and execute changes right from the terminal or Telegram.

## ✨ Features

- **🔍 Ask Mode** — Ask questions about your codebase and get AI-powered answers
- **📋 Plan Mode** — Generate step-by-step implementation plans, pick the steps you want, and execute them
- **🛠️ Agent Mode** — Let the AI modify your codebase with a full approval flow before changes are applied
- **🤖 Telegram Bot** — Run all of the above from Telegram on the go
- **🔒 Safe by default** — All file changes are staged and require approval before being applied

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh) runtime installed
- An [OpenRouter](https://openrouter.ai) API key

### Install

```bash
git clone https://github.com/YOUR_USERNAME/openclaw.git
cd openclaw
bun install
```

### Configure

Create a `.env` file in the project root:

```env
OPENROUTER_API_KEY=your_openrouter_key
TELEGRAM_BOT_TOKEN=your_telegram_bot_token      # optional, for Telegram mode
TELEGRAM_OWNER_ID=your_telegram_user_id          # optional, for Telegram mode
```

### Run

```bash
# Link the CLI globally
bun link

# Launch Kairo
Kairo wakeup
```

## 🎯 Usage

### CLI Mode

After running `Kairo wakeup`, select **CLI Mode** to access:

| Command | What it does |
|---------|-------------|
| **Ask** | Ask a question about your codebase — AI reads your files and responds |
| **Plan** | Describe a goal → get a plan → select steps → execute |
| **Agent** | Give a task → AI works on it → review & approve file changes |

### Telegram Mode

Select **Telegram Mode** to control Kairo from your phone:

- `/ask <question>` — Ask about your codebase
- `/plan <goal>` — Generate and execute a plan
- `/agent <task>` — Run the agent with approval flow

## 🛡️ How the Approval Flow Works

```
You describe a task
    → AI executes with tools (read, create, modify, delete files)
    → All changes are staged (nothing is written yet)
    → You review a diff of every change
    → Approve ✅ or Reject ❌
    → Only approved changes are applied
```

## 🏗️ Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **AI**: [Vercel AI SDK](https://sdk.vercel.ai) + [OpenRouter](https://openrouter.ai)
- **CLI**: Commander + Clack prompts
- **Telegram**: Telegraf
- **Language**: TypeScript

---

*Built by Rochak* 🚀
