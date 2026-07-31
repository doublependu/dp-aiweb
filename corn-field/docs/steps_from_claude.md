Good — here's the path from that single HTML file to a real project.

## 1. Install Claude Code

The recommended native installer needs no Node.js:

```bash
# macOS, Linux, WSL
curl -fsSL https://claude.ai/install.sh | bash

# Windows PowerShell
irm https://claude.ai/install.ps1 | iex
```

Homebrew (`brew install --cask claude-code`) and WinGet (`winget install Anthropic.ClaudeCode`) also work, but neither auto-updates — the native install does. Verify with `claude --version`.

You'll need a Claude subscription (Pro, Max, Team, or Enterprise) or a Console account — run `claude` and it prompts you to log in through the browser on first use.

## 2. Scaffold the project

You *do* need Node.js for this part, since Vite is the dev server:

```bash
npm create vite@latest corn-field -- --template vanilla
cd corn-field
npm install
npm install three
```

Drop the HTML file I gave you into the project root as `reference.html`, then:

```bash
claude
```

## 3. Your first prompts

The migration is the ideal first task — it's well-defined and Claude Code can verify its own work by running the dev server.

```
Read reference.html. It's a single-file three.js scene that works.
Port it to this Vite project using the npm `three` package instead
of the CDN global. Split it into src/ modules: maze.js (generation),
corn.js (instancing + wind shader), audio.js, player.js, scene.js.
Keep behaviour identical — I'll verify by eye before we change anything.
```

Then, once that runs:

```
Add a slow day-to-dusk light cycle over about 6 minutes: the sun
descends and warms, fog thickens slightly, fireflies fade in as it
darkens. Make the duration a constant I can tune.
```

The reason to do it in that order is that the port is verifiable — if the scene looks the same, it worked. Starting with a new feature on unfamiliar architecture gives you two things to debug at once.

## 4. Write a CLAUDE.md

This is the highest-leverage thing you can do, and most people skip it. It's a file Claude Code reads automatically at the start of every session, so you stop re-explaining your project. I've written one for you:Put that in the project root. The section on what *not* to build matters more than it might look — the instinct to add a timer or a score to a maze is strong, and writing the constraint down once stops you relitigating it every session.

## A few things worth knowing early

**`Shift+Tab` cycles permission modes.** Default asks before every edit. `plan` mode lets Claude propose an approach without touching files — genuinely useful for the port, where you want to see the module split before it happens.

**Commit before each session.** Claude Code handles git conversationally ("commit my changes with a descriptive message"), and having a clean checkpoint means you can throw away a change you don't like instead of unpicking it.

**Let it explore before it edits.** "Read reference.html and explain how the wind shader works" before asking for changes to the wind gets much better results than diving straight in.

**Ask it about itself.** "How do I write a custom skill?" works — it can read its own docs.

The full quickstart is at [code.claude.com/docs/en/quickstart](https://code.claude.com/docs/en/quickstart).If you'd rather not live in the terminal, Claude Code also runs in the desktop app, VS Code, and JetBrains — same tool, and the desktop version is a gentler start if the CLI isn't already home turf.