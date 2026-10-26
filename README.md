# podcode

Command-line coding agent. It streams a conversation with an OpenAI-compatible model, runs tools in the working directory, and can connect MCP servers.

## Setup

Copy `podcode/podcode.example.json` to `podcode.json` in the directory you run it from, or use `~/.podcode/config.json`. Put your own API key in that file. `podcode.json` is gitignored.

`OPENAI_API_KEY` and `OPENAI_BASE_URL` work as a fallback.

Source is in `podcode/src`. The CLI entry is `podcode/src/index.ts`.
