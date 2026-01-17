import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

/**
 * Set in Render -> Environment:
 * PUBLIC_BASE_URL = https://YOUR-SERVICE.onrender.com
 *
 * This ensures absolute image URLs (best for ChatGPT rendering).
 */
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

// Resolve local path to /images folder (relative to THIS file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGES_DIR = path.join(__dirname, "images");

// Your exact image files in GitHub (must match)
const TOPICS = {
  overwhelmed: {
    key: "overwhelmed",
    title: "Overwhelmed",
    subtitle: "Too much at once. My head feels full.",
    file: "overwhelmed.png",
  },
  ready: {
    key: "ready",
    title: "Ready to Act",
    subtitle: "I just need one push forward.",
    file: "ready-to-act.png",
  },
  stuck: {
    key: "stuck",
    title: "Stuck",
    subtitle: "I know what to do…, but I’m not moving.",
    file: "stuck.png",
  },
  unclear: {
    key: "unclear",
    title: "Unclear Direction",
    subtitle: "Lots of ideas. No clear priority.",
    file: "unclear-direction.png",
  },
};

function normalizeText(...parts) {
  return parts
    .filter(Boolean)
    .join("\n")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pickTopic(text) {
  // Priority order matters: overwhelmed/stuck/unclear tend to be more specific than “ready”
  if (
    /(overwhelm|overwhelmed|too much|spinning|scattered|frazzled|burned out|burnt out|mental noise|swamped)/.test(
      text
    )
  ) {
    return TOPICS.overwhelmed;
  }

  if (/(stuck|procrastinat|avoid|not moving|frozen|can't start|cant start|blocked)/.test(text)) {
    return TOPICS.stuck;
  }

  if (
    /(unclear|too many ideas|no clear|which one|priority|priorit|direction|options|what should i do|choose)/.test(
      text
    )
  ) {
    return TOPICS.unclear;
  }

  if (/(ready|let's go|lets go|do it|take action|push forward|momentum|lock in)/.test(text)) {
    return TOPICS.ready;
  }

  return TOPICS.ready;
}

function imageUrl(topic) {
  if (PUBLIC_BASE_URL) return `${PUBLIC_BASE_URL}/images/${topic.file}`;
  return `/images/${topic.file}`;
}

function nextStepFor(topicKey) {
  // Tight, time-boxed. One action + a start line.
  switch (topicKey) {
    case "overwhelmed":
      return {
        title: "Do this now (10 minutes)",
        bullets: ["Set a 10-minute timer.", "Write the ONE thing creating the most noise.", "Do a 5-minute starter step."],
        start: "Write: The one thing is: ____",
      };

    case "stuck":
      return {
        title: "Do this now (8 minutes)",
        bullets: ["Set an 8-minute timer.", "Pick a 2-minute starter action.", "Do it once. Stop when the timer ends."],
        start: "Write: My 2-minute starter is: ____",
      };

    case "unclear":
      return {
        title: "Do this now (12 minutes)",
        bullets: ["List 3 options (titles only).", "Pick the one with the fastest proof in 24 hours.", "Define the first visible deliverable (one sentence)."],
        start: "Write: If I only win one thing today, it’s: ____",
      };

    case "ready":
    default:
      return {
        title: "Do this now (15 minutes)",
        bullets: ["Pick ONE outcome for today (one sentence).", "Do the first 15-minute chunk.", "Lock the next chunk on your calendar."],
        start: "Write: Today’s outcome is: ____",
      };
  }
}

function createEliteMindsetServer() {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.0.0",
  });

  server.tool(
    "next_best_step",
    [
      "Use when a user feels stuck, overwhelmed, mentally scattered, procrastinating, or unsure what to do next.",
      "Return ONE concrete, time-boxed action (5–15 minutes) that creates momentum.",
      "Keep responses concise and practical.",
    ].join(" "),
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal, context }) => {
      const text = normalizeText(goal, context);
      const topic = pickTopic(text);
      const img = imageUrl(topic);
      const plan = nextStepFor(topic.key);

      return [
        `**${topic.title}**`,
        `${topic.subtitle}`,
        ``,
        `![${topic.title}](${img})`,
        ``,
        `**${plan.title}:**`,
        plan.bullets.map((b, i) => `${i + 1}. ${b}`).join("\n"),
        ``,
        `**Start line:** ${plan.start}`,
        ``,
        `**Reply:** DONE — (what you did)`,
      ].join("\n");
    }
  );

  return server;
}

function contentTypeFor(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function tryServeImage(req, res) {
  if (req.method !== "GET") return false;
  if (!req.url) return false;

  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/images/")) return false;

  const requested = url.pathname.replace("/images/", "");
  const safeName = path.basename(requested);

  const allowed = new Set(Object.values(TOPICS).map((t) => t.file));
  if (!allowed.has(safeName)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return true;
  }

  try {
    const filePath = path.join(IMAGES_DIR, safeName);
    const buf = await readFile(filePath);

    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeFor(safeName));
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.end(buf);
    return true;
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
    return true;
  }
}

async function main() {
  const mcpServer = createEliteMindsetServer();

  const httpServer = createServer(async (req, res) => {
    try {
      const served = await tryServeImage(req, res);
      if (served) return;

      const transport = new StreamableHTTPServerTransport({ req, res });
      await mcpServer.connect(transport);
    } catch {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Server error");
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`elitemindset-mcp listening on port ${PORT}`);
    if (!PUBLIC_BASE_URL) console.log("Tip: set PUBLIC_BASE_URL for absolute image URLs.");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
