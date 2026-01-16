import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

const STATES = {
  OVERWHELMED: "OVERWHELMED",
  STUCK: "STUCK",
  UNCLEAR: "UNCLEAR",
  READY: "READY",
};

// Stable keys you will map to your 4 images later (no URLs yet)
const VISUAL_KEYS = {
  OVERWHELMED: "overwhelmed",
  STUCK: "stuck",
  UNCLEAR: "unclear",
  READY: "ready",
};

function clampWords(text, maxWords = 85) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(text || "").trim();
  return words.slice(0, maxWords).join(" ").trim();
}

function inferState({ goal, context }) {
  const g = (goal || "").toLowerCase();
  const c = (context || "").toLowerCase();
  const t = `${g} ${c}`.trim();

  // Simple, deterministic routing (safe v1)
  const hasAny = (arr) => arr.some((k) => t.includes(k));

  if (hasAny(["overwhelm", "overwhelmed", "too much", "spinning", "anxious", "stress", "stressed", "flooded"])) {
    return STATES.OVERWHELMED;
  }
  if (hasAny(["stuck", "frozen", "procrast", "avoid", "blocked", "can't start", "can’t start", "paralyzed"])) {
    return STATES.STUCK;
  }
  if (hasAny(["unclear", "confused", "no clarity", "too many ideas", "options", "priority", "prioritize", "direction"])) {
    return STATES.UNCLEAR;
  }
  if (hasAny(["ready", "do it", "start now", "let's go", "lets go", "move forward", "take action", "execute"])) {
    return STATES.READY;
  }

  // Default: if they gave a goal, assume READY-ish; otherwise UNCLEAR
  return goal ? STATES.READY : STATES.UNCLEAR;
}

function buildNextStep(state) {
  // One step only. Time-boxed. No explanations.
  switch (state) {
    case STATES.OVERWHELMED:
      return clampWords(
        [
          "Do this now (8 minutes):",
          "1) Set an 8-minute timer.",
          "2) Write the ONE thing creating the most mental noise.",
          "3) Do the smallest visible step for 5 minutes.",
          "Reply DONE + what you did.",
        ].join("\n"),
        85
      );

    case STATES.STUCK:
      return clampWords(
        [
          "Do this now (10 minutes):",
          "1) Set a 10-minute timer.",
          "2) Write: ‘I’m avoiding ____ because ____.’",
          "3) Do the first 2-minute micro-step.",
          "Reply DONE + what you did.",
        ].join("\n"),
        85
      );

    case STATES.UNCLEAR:
      return clampWords(
        [
          "Do this now (7 minutes):",
          "1) Set a 7-minute timer.",
          "2) List 3 options you’re torn between.",
          "3) Circle the one with the fastest payoff this week.",
          "4) Do the first 5-minute step.",
          "Reply DONE + what you did.",
        ].join("\n"),
        85
      );

    case STATES.READY:
    default:
      return clampWords(
        [
          "Do this now (10 minutes):",
          "1) Set a 10-minute timer.",
          "2) Pick ONE outcome you want today.",
          "3) Do the first 10-minute action toward it.",
          "Reply DONE + what you did.",
        ].join("\n"),
        85
      );
  }
}

function createEliteMindsetServer() {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.1.0",
  });

  server.tool(
    "next_best_step",
    "Use when a user feels stuck, overwhelmed, procrastinating, or unsure what to do next. Return ONE short, time-boxed action. No explanations. Also return a state + visual_key for UI visuals.",
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal, context }) => {
      const state = inferState({ goal, context });
      const visual_key =
        state === STATES.OVERWHELMED
          ? VISUAL_KEYS.OVERWHELMED
          : state === STATES.STUCK
          ? VISUAL_KEYS.STUCK
          : state === STATES.UNCLEAR
          ? VISUAL_KEYS.UNCLEAR
          : VISUAL_KEYS.READY;

      const text = buildNextStep(state);

      return {
        // These are the NEW fields you will use to trigger the 4 images
        state,
        visual_key,

        // Existing content format preserved for ChatGPT display
        content: [
          {
            type: "text",
            text,
          },
        ],
      };
    }
  );

  return server;
}

function isMcpPath(pathname) {
  return (
    pathname === "/mcp" ||
    pathname === "/mcp/" ||
    pathname === "/api/mcp" ||
    pathname === "/api/mcp/" 
  );
}

const mcpServer = createEliteMindsetServer();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/" || url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("EliteMindset MCP server is running");
      return;
    }

    if (
      isMcpPath(url.pathname) &&
      (req.method === "GET" || req.method === "POST" || req.method === "DELETE")
    ) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      res.on("close", () => {
        transport.close();
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  } catch {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}).listen(PORT, () => {
  console.log(`EliteMindset MCP server running on port ${PORT}`);
  console.log(`MCP endpoint: /mcp (also /api/mcp)`);
});
