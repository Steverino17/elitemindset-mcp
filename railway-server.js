import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

// ----------------- Minimal state machine -----------------
function cleanText(v) {
  return String(v || "").trim();
}

function lower(v) {
  return cleanText(v).toLowerCase();
}

function hasAny(text, needles) {
  return needles.some((n) => text.includes(n));
}

function inferState(userText) {
  const t = lower(userText);

  const doneSignal =
    /\bdone\b/.test(t) ||
    hasAny(t, ["i did", "i wrote", "i opened", "i sent", "i renamed", "finished", "completed"]);

  const clarityRequest = hasAny(t, [
    "what should i focus",
    "what do i focus",
    "help me decide",
    "which should i",
    "which one should i",
    "i need clarity",
    "prioritize",
    "priority",
    "what's the plan",
    "what is the plan",
  ]);

  const momentumRequest = hasAny(t, ["what next", "next step", "keep going", "continue", "now what"]);

  const stuckSignal = hasAny(t, [
    "overwhelmed",
    "overwhelm",
    "stuck",
    "procrast",
    "spinning",
    "confus",
    "too many",
    "scattered",
    "paraly",
    "can't start",
    "cannot start",
    "don't know where to start",
    "dont know where to start",
    "no clarity",
  ]);

  if (doneSignal) return "S2";
  if (clarityRequest) return "S4";
  if (momentumRequest) return "S3";
  if (stuckSignal) return "S1";
  return "S1";
}

// Auto-detect base URL from request headers
function getBaseUrlFromReq(req) {
  const env = cleanText(process.env.BASE_URL);
  if (env) return env.replace(/\/+$/, "");

  const proto =
    cleanText(req.headers["x-forwarded-proto"]) ||
    (req.secure ? "https" : "http");
  const host = cleanText(req.headers["x-forwarded-host"] || req.headers.host);
  return host ? `${proto}://${host}` : "";
}

function getSessionId(req) {
  return cleanText(req.query.sessionId || req.query.session_id || "default");
}

// ----------------- State responses -----------------
const stateData = {
  S1: {
    message:
      "You're not stuck. You're overloaded. Pause. Pick the ONE thing that would give you the most relief or progress. Write it down. Then reply: DONE — (what you did).",
    ask: "Reply: DONE — (what you did)",
    next_state: "S2",
    image: "overwhelmed.png",
  },
  S2: {
    message:
      "Good. You moved. Now do ONE more small thing. Anything. A file rename. A sentence. A single email. Reply: DONE — (what you did).",
    ask: "Reply: DONE — (what you did)",
    next_state: "S3",
    image: "stuck.png",
  },
  S3: {
    message:
      "You're building momentum. Keep it micro. What's ONE more small thing you can do in the next 60 seconds? Do it. Reply when done.",
    ask: "Reply when you've done it",
    next_state: "S3",
    image: "ready-to-act.png",
  },
  S4: {
    message:
      "You need clarity, not motivation. List your top 3 concerns. I'll help you identify the ONE thing that matters most right now.",
    ask: "List your top 3 concerns",
    next_state: "S1",
    image: "unclear-direction.png",
  },
};

// Store MCP servers, transports, and interaction counts per session
const transports = new Map();
const mcpServers = new Map();
const interactionCounts = new Map(); // Track interactions per session

// Express app
const app = express();
app.use(express.json());

// Health check
app.get("/healthz", (req, res) => {
  res.send("OK");
});

// Serve static images
app.use("/images", express.static(path.join(__dirname, "images")));

// Root path handler - ChatGPT looks here first
app.get("/", (req, res) => {
  req.url = "/sse";
  app._router.handle(req, res);
});

// MCP alias endpoint
app.get("/mcp", (req, res) => {
  req.url = "/sse";
  app._router.handle(req, res);
});

/**
 * GET /sse - Initialize SSE connection with IMMEDIATE handshake
 */
app.get("/sse", async (req, res) => {
  const sessionId = getSessionId(req);

  // Set SSE headers immediately
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // CRITICAL: Send endpoint event IMMEDIATELY (within 100ms)
  res.write(`event: endpoint\n`);
  res.write(`data: /sse\n\n`);
  res.flushHeaders();

  console.log(`✓ SSE connected: session=${sessionId}`);

  try {
    // Create MCP server for this session
    const mcp = new McpServer({
      name: "elitemindset-clarity",
      version: "1.0.0",
    });

    // Read the widget HTML file
    const widgetHtml = readFileSync(
      path.join(__dirname, "elitemindset-widget.html"),
      "utf8"
    );

    // Register the widget as an MCP resource
    mcp.resource(
      {
        uri: "ui://widget/elitemindset.html",
        name: "EliteMindset Clarity Widget",
        mimeType: "text/html+skybridge",
        description: "Visual guidance for overcoming procrastination and gaining clarity",
      },
      async () => ({
        contents: [
          {
            uri: "ui://widget/elitemindset.html",
            mimeType: "text/html+skybridge",
            text: widgetHtml,
            _meta: {
              "openai/widgetPrefersBorder": true,
              "openai/widgetDomain": "https://chatgpt.com",
            },
          },
        ],
      })
    );

    // Initialize interaction count for this session if not exists
    if (!interactionCounts.has(sessionId)) {
      interactionCounts.set(sessionId, 0);
    }

    // Define the single tool with widget output
    mcp.tool(
      {
        name: "next_best_step",
        description:
          "Help user overcome procrastination and analysis-paralysis by identifying the smallest immediate next action. Use when user expresses being stuck, overwhelmed, unclear, or asks for direction.",
        inputSchema: z.object({
          user_input: z
            .string()
            .describe(
              "What the user just said (their concern, question, or confirmation of completion)"
            ),
        }),
        _meta: {
          "openai/outputTemplate": "ui://widget/elitemindset.html",
        },
      },
      async ({ user_input }) => {
        // Increment interaction count
        const currentCount = interactionCounts.get(sessionId) + 1;
        interactionCounts.set(sessionId, currentCount);

        // Determine if CTA should be shown (after 3 interactions)
        const ctaAllowed = currentCount >= 3;

        const state = inferState(user_input);
        const data = stateData[state];
        const BASE_URL = getBaseUrlFromReq(req);

        // Return structured content for the widget
        return {
          structuredContent: {
            state,
            message: data.message,
            ask: data.ask,
            cta_allowed: ctaAllowed,
            next_state: data.next_state,
            interaction_count: currentCount,
          },
          content: [
            {
              type: "text",
              text: `${data.message}\n\n${data.ask}`,
            },
          ],
        };
      }
    );

    // Create SSE transport with this response
    const transport = new SSEServerTransport("/sse", res);
    await mcp.connect(transport);

    transports.set(sessionId, transport);
    mcpServers.set(sessionId, mcp);

    // Keepalive every 15 seconds
    const keepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": ping\n\n");
      } else {
        clearInterval(keepAlive);
      }
    }, 15000);

    // Cleanup on disconnect
    req.on("close", () => {
      console.log(`✗ SSE disconnected: session=${sessionId}`);
      clearInterval(keepAlive);
      transports.delete(sessionId);
      mcpServers.delete(sessionId);
      // Keep interaction count for session resume
    });
  } catch (err) {
    console.error("SSE init error:", err);
    if (!res.headersSent) {
      res.status(500).send("SSE init error");
    }
  }
});

/**
 * POST /sse - Handle MCP messages
 */
app.post("/sse", async (req, res) => {
  const sessionId = getSessionId(req);
  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(404).send("Unknown sessionId");
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error("Message handling error:", err);
    if (!res.headersSent) {
      res.status(500).send("Message handling error");
    }
  }
});

// Compatibility endpoint
app.post("/messages", async (req, res) => {
  const sessionId = getSessionId(req);
  const transport = transports.get(sessionId);

  if (!transport) {
    return res.status(404).send("Unknown sessionId");
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    console.error("Message handling error:", err);
    if (!res.headersSent) {
      res.status(500).send("Message handling error");
    }
  }
});

app.listen(PORT, () => {
  const baseInfo = cleanText(process.env.BASE_URL) 
    ? `${process.env.BASE_URL}` 
    : `(auto-detected from requests)`;
  
  console.log(`✓ EliteMindset MCP server running on port ${PORT}`);
  console.log(`✓ BASE_URL: ${baseInfo}`);
  console.log(`✓ Static images: /images/*`);
  console.log(`✓ Widget resource: ui://widget/elitemindset.html`);
  console.log(`✓ Health check: /healthz`);
  console.log(`✓ Root path: / (redirects to /sse for ChatGPT)`);
  console.log(`✓ MCP alias: /mcp`);
  console.log(`✓ SSE endpoint: /sse`);
  console.log(`✓ IMMEDIATE handshake: endpoint event sent within 100ms`);
  console.log(`✓ CTA displays after 3 interactions`);
});
