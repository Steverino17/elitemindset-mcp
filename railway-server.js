import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import path from "path";
import { fileURLToPath } from "url";

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

// Auto-detect base URL from request headers (works behind proxies)
function getBaseUrlFromReq(req) {
  // Prefer env var if explicitly set
  const env = cleanText(process.env.BASE_URL);
  if (env) return env.replace(/\/+$/, "");

  // Infer from proxy headers
  const proto =
    cleanText(req.headers["x-forwarded-proto"]) ||
    (req.secure ? "https" : "http");
  const host = cleanText(req.headers["x-forwarded-host"]) || cleanText(req.headers.host);

  if (!host) return "http://localhost:" + PORT;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

// Map states to images
function getImageForState(state, baseUrl) {
  const imageMap = {
    S1: "overwhelmed.png",        // Stuck/Overwhelmed → chaotic desk
    S2: "stuck.png",               // Done/Progress → person in ice cave
    S3: "ready-to-act.png",        // Momentum → open road
    S4: "unclear-direction.png",   // Need Clarity → forest signs
  };
  const file = imageMap[state] || imageMap.S1;
  return `${baseUrl}/images/${file}`;
}

function responseForState(state, { ctaOk, baseUrl }) {
  const imageUrl = getImageForState(state, baseUrl);

  if (state === "S1") {
    return {
      state: "S1",
      cta_allowed: false,
      next_state: "S2",
      ask: "Reply: DONE — (what you did)",
      image_url: imageUrl,
      message:
        "You're not stuck. You're overloaded.\n\nWe're not fixing everything.\nWe're just starting.\n\nDo this:\nOpen the thing you've been avoiding.\nWrite one sentence.\nStop.\n\nDon't make it good.\n\nWhen you're done, reply:\nDONE — (what you did)",
    };
  }

  if (state === "S2") {
    const base =
      "Good. That matters.\n\nYou didn't need motivation.\nYou needed movement.\n\nPause for a breath.\nNotice the pressure drop.";
    const cta =
      "\n\nIf you want, this is exactly what EliteMindset is for —\none calm next step when things feel heavy.";
    return {
      state: "S2",
      cta_allowed: Boolean(ctaOk),
      next_state: "S3",
      ask: "What feels easier now?",
      image_url: imageUrl,
      message: ctaOk ? base + cta + "\n\nWhat feels easier now?" : base + "\n\nWhat feels easier now?",
    };
  }

  if (state === "S3") {
    return {
      state: "S3",
      cta_allowed: false,
      next_state: "S3",
      ask: "Tell me what you did.",
      image_url: imageUrl,
      message:
        "Good. Stay small.\n\nLook at what you just did.\nWhat's the very next tiny thing?\n\nDo only that.\nTwo minutes max.\nStop again.\n\nTell me what you did.",
    };
  }

  return {
    state: "S4",
    cta_allowed: false,
    next_state: "S3",
    ask: "Tell me: • the thing • the action",
    image_url: imageUrl,
    message:
      "Okay. One thing now.\n\nIf you could move only one thing forward today,\nwhich would make the rest feel lighter?\n\nThat's the priority.\n\nWhat's the smallest visible action?\nFive minutes or less.\n\nDo it.\nThen tell me:\n• the thing\n• the action",
  };
}

function buildUserText({ user_message, goal, context }) {
  const parts = [cleanText(user_message), cleanText(goal), cleanText(context)].filter(Boolean);
  return parts.join(" | ").trim();
}

// ----------------- MCP server -----------------
const mcp = new McpServer({
  name: "elitemindset-mcp",
  version: "1.0.0",
});

// Smart base URL caching with HTTPS upgrade
let cachedBaseUrl = null;

function updateCachedBaseUrl(newUrl) {
  // Set if empty
  if (!cachedBaseUrl) {
    cachedBaseUrl = newUrl;
    return;
  }
  
  // Upgrade HTTP to HTTPS if new URL is HTTPS (handles weird first requests)
  if (cachedBaseUrl.startsWith("http://") && newUrl.startsWith("https://")) {
    cachedBaseUrl = newUrl;
  }
}

mcp.tool(
  "next_best_step",
  "Use when a user feels stuck, overwhelmed, procrastinating, or unsure what to do next. Returns one calm, minimal next step using a simple state machine (S1—S4) with an accompanying motivational image.",
  {
    goal: z.string().optional(),
    context: z.string().optional(),
    user_message: z.string().optional(),
    cta_ok: z.boolean().optional(),
  },
  async ({ goal, context, user_message, cta_ok }) => {
    // Use cached base URL or fallback
    const baseUrl = 
      cachedBaseUrl || 
      cleanText(process.env.BASE_URL) || 
      `http://localhost:${PORT}`;
    
    const userText = buildUserText({ user_message, goal, context });
    const state = inferState(userText);
    return responseForState(state, { ctaOk: Boolean(cta_ok), baseUrl });
  }
);

// ----------------- HTTP server -----------------
const app = express();
app.use(express.json({ limit: "1mb" }));

// Serve static images from /images folder
app.use("/images", express.static(path.join(__dirname, "images")));

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/healthz", (_req, res) => res.status(200).send("OK"));
app.get("/mcp", (_req, res) => res.status(200).send("OK"));

const transports = new Map();

// Accept both sessionId and session_id parameters
function getSessionId(req) {
  const a = cleanText(req.query.sessionId);
  const b = cleanText(req.query.session_id);
  return a || b;
}

/**
 * GET /sse
 * Initialize SSE connection for MCP transport
 */
app.get("/sse", async (req, res) => {
  let keepAlive = null;

  try {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    // Send immediate bytes so verifiers see active SSE stream
    res.write("event: connected\ndata: ok\n\n");

    // SSE keepalive ping every 15 seconds to prevent proxy timeout
    keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        // Connection closed, interval will be cleared on 'close' event
      }
    }, 15000);

    // Initialize MCP transport
    const transport = new SSEServerTransport("/sse", res);
    transports.set(transport.sessionId, transport);

    // Update cached base URL with smart HTTPS upgrade logic
    const inferredUrl = getBaseUrlFromReq(req);
    updateCachedBaseUrl(inferredUrl);

    res.on("close", () => {
      if (keepAlive) clearInterval(keepAlive);
      transports.delete(transport.sessionId);
    });

    await mcp.connect(transport);
  } catch (err) {
    if (keepAlive) clearInterval(keepAlive);
    if (!res.headersSent) {
      res.status(500).send("SSE init error");
    }
  }
});

/**
 * POST /sse
 * Handle incoming MCP messages
 */
app.post("/sse", async (req, res) => {
  const sessionId = getSessionId(req);
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).send("Unknown sessionId");
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).send("Message handling error");
    }
  }
});

// Additional compatibility endpoint for older MCP clients
app.post("/messages", async (req, res) => {
  const sessionId = getSessionId(req);
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).send("Unknown sessionId");
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
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
  console.log(`✓ Health check: /healthz`);
  console.log(`✓ MCP alias: /mcp`);
  console.log(`✓ SSE endpoint: /sse`);
});
