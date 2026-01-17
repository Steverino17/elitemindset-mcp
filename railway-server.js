import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

// Optional (recommended): set this in Render env to your live base URL
// Example: https://elitemindset-mcp.onrender.com
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

// Resolve local path to /images folder (relative to THIS file)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGES_DIR = path.join(__dirname, "images");

// Your actual image files (must match GitHub exactly)
const TOPICS = {
  overwhelmed: { key: "overwhelmed", title: "Overwhelmed", file: "overwhelmed.png" },
  ready: { key: "ready", title: "Ready to Act", file: "ready-to-act.png" },
  stuck: { key: "stuck", title: "Stuck", file: "stuck.png" },
  unclear: { key: "unclear", title: "Unclear Direction", file: "unclear-direction.png" },
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
  if (/(overwhelm|overwhelmed|too much|spinning|scattered|frazzled|burned out|mental noise|swamped)/.test(text)) {
    return TOPICS.overwhelmed;
  }
  if (/(stuck|procrastinat|avoid|not moving|frozen|can't start|cant start|blocked)/.test(text)) {
    return TOPICS.stuck;
  }
  if (/(unclear|too many ideas|no clear|which one|priority|priorit|direction|options|choose|decision)/.test(text)) {
    return TOPICS.unclear;
  }
  return TOPICS.ready;
}

function getBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  return `${proto}://${host}`;
}

function imageUrl(req, topic) {
  return `${getBaseUrl(req)}/images/${topic.file}`;
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

function createEliteMindsetServer() {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.4.0",
  });

  server.tool(
    "next_best_step",
    "Return ONE time-boxed action (5–15 minutes). Keep it short, visceral, and practical. Include the matching image via markdown.",
    { goal: z.string().optional(), context: z.string().optional() },
    async ({ goal, context }, _ctx) => {
      // NOTE: we’ll inject the image URL at request-time in the HTTP handler
      // by storing goal/context in text and picking topic there.
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              goal: (goal || "").trim(),
              context: (context || "").trim(),
            }),
          },
        ],
      };
    }
  );

  return server;
}

async function main() {
  const httpServer = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Home/health
    if (req.method === "GET" && (req.url === "/" || req.url === "")) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("EliteMindset MCP is running. Try /images/overwhelmed.png");
      return;
    }

    // Serve images
    const served = await tryServeImage(req, res);
    if (served) return;

    // MCP endpoint (support GET+POST)
    if ((req.method === "POST" || req.method === "GET") && req.url === "/mcp") {
      const transport = new StreamableHTTPServerTransport({ req, res });
      const server = createEliteMindsetServer();

      res.on("close", () => {
        try { transport.close(); } catch {}
        try { server.close(); } catch {}
      });

      // Intercept tool output: convert JSON blob -> short plan + markdown image
      server.onCallTool(async (call, next) => {
        const result = await next();

        if (call?.name !== "next_best_step") return result;

        let payload = { goal: "", context: "" };
        try {
          const raw = result?.content?.[0]?.text || "{}";
          payload = JSON.parse(raw);
        } catch {}

        const text = normalizeText(payload.goal, payload.context);
        const topic = pickTopic(text);
        const img = imageUrl(req, topic);

        const plan =
          topic.key === "overwhelmed"
            ? "Set 10 minutes. Write the ONE thing causing the most noise. Then do a 2-minute starter on it."
            : topic.key === "stuck"
            ? "Set 8 minutes. Pick a 2-minute starter action. Do it once. Stop."
            : topic.key === "unclear"
            ? "Write 3 options (titles only). Circle the one with the fastest proof in 24 hours. Define the first deliverable in 1 sentence."
            : "Pick ONE outcome for today. Do the first 15-minute chunk. Lock the next chunk.";

        return {
          content: [
            {
              type: "text",
              text:
                `**${topic.title}**\n\n` +
                `**Next step (under 15 min):** ${plan}\n\n` +
                `**Reply:** DONE — (what you did)\n\n` +
                `![${topic.title}](${img})`,
            },
          ],
        };
      });

      await server.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    // Fallback
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Not found");
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`EliteMindset MCP listening on port ${PORT}`);
    if (!PUBLIC_BASE_URL) console.log("Tip: set PUBLIC_BASE_URL for absolute image URLs.");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
