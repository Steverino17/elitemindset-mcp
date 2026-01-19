import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

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
  const host = cleanText(req.headers["x-forwarded-host"]) || cleanText(req.headers.host);

  if (!host) return "http://localhost:" + PORT;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

// Map states to image resource URIs
function getImageResourceForState(state) {
  const imageMap = {
    S1: "image://overwhelmed",
    S2: "image://stuck",
    S3: "image://ready-to-act",
    S4: "image://unclear-direction",
  };
  return imageMap[state] || imageMap.S1;
}

function responseForState(state, { ctaOk }) {
  const imageResource = getImageResourceForState(state);

  if (state === "S1") {
    return {
      state: "S1",
      cta_allowed: false,
      next_state: "S2",
      ask: "Reply: DONE — (what you did)",
      image_resource: imageResource,
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
      image_resource: imageResource,
      message: ctaOk ? base + cta + "\n\nWhat feels easier now?" : base + "\n\nWhat feels easier now?",
    };
  }

  if (state === "S3") {
    return {
      state: "S3",
      cta_allowed: false,
      next_state: "S3",
      ask: "Tell me what you did.",
      image_resource: imageResource,
      message:
        "Good. Stay small.\n\nLook at what you just did.\nWhat's the very next tiny thing?\n\nDo only that.\nTwo minutes max.\nStop again.\n\nTell me what you did.",
    };
  }

  return {
    state: "S4",
    cta_allowed: false,
    next_state: "S3",
    ask: "Tell me: • the thing • the action",
    image_resource: imageResource,
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

let cachedBaseUrl = null;

function updateCachedBaseUrl(newUrl) {
  if (!cachedBaseUrl) {
    cachedBaseUrl = newUrl;
    return;
  }
  
  if (cachedBaseUrl.startsWith("http://") && newUrl.startsWith("https://")) {
    cachedBaseUrl = newUrl;
  }
}

// ✨ NEW: Register MCP Resources for images
// These allow ChatGPT to fetch and display images inline

mcp.resource(
  "image://overwhelmed",
  "Motivational image for overwhelmed state - desk covered in sticky notes and tasks",
  "image/png",
  async () => {
    const imagePath = path.join(__dirname, "images", "overwhelmed.png");
    const imageBuffer = await fs.readFile(imagePath);
    return {
      contents: imageBuffer.toString("base64"),
      mimeType: "image/png",
    };
  }
);

mcp.resource(
  "image://stuck",
  "Motivational image for stuck/completed state - person in ice cave looking at light",
  "image/png",
  async () => {
    const imagePath = path.join(__dirname, "images", "stuck.png");
    const imageBuffer = await fs.readFile(imagePath);
    return {
      contents: imageBuffer.toString("base64"),
      mimeType: "image/png",
    };
  }
);

mcp.resource(
  "image://ready-to-act",
  "Motivational image for ready to act state - open road at sunrise",
  "image/png",
  async () => {
    const imagePath = path.join(__dirname, "images", "ready-to-act.png");
    const imageBuffer = await fs.readFile(imagePath);
    return {
      contents: imageBuffer.toString("base64"),
      mimeType: "image/png",
    };
  }
);

mcp.resource(
  "image://unclear-direction",
  "Motivational image for unclear direction state - forest path with directional signs",
  "image/png",
  async () => {
    const imagePath = path.join(__dirname, "images", "unclear-direction.png");
    const imageBuffer = await fs.readFile(imagePath);
    return {
      contents: imageBuffer.toString("base64"),
      mimeType: "image/png",
    };
  }
);

// Register the tool
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
    const userText = buildUserText({ user_message, goal, context });
    const state = inferState(userText);
    return responseForState(state, { ctaOk: Boolean(cta_ok) });
  }
);

// ----------------- HTTP server -----------------
const app = express();
app.use(express.json({ limit: "1mb" }));

// Serve static images (for fallback/direct browser access)
app.use("/images", express.static(path.join(__dirname, "images")));

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/healthz", (_req, res) => res.status(200).send("OK"));
app.get("/mcp", (_req, res) => res.status(200).send("OK"));

const transports = new Map();

function getSessionId(req) {
  const a = cleanText(req.query.sessionId);
  const b = cleanText(req.query.session_id);
  return a || b;
}

/**
 * GET /sse - ChatGPT-compatible SSE endpoint
 * CRITICAL: ChatGPT requires immediate response with proper SSE format
 */
app.get("/sse", async (req, res) => {
  let keepAlive = null;

  try {
    // CRITICAL: Set headers IMMEDIATELY before any async operations
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    // CRITICAL: Flush headers immediately
    res.flushHeaders();

    // Send immediate SSE event - ChatGPT needs this within 5 seconds
    res.write("event: endpoint\n");
    res.write(`data: /sse\n\n`);

    // SSE keepalive every 15 seconds
    keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch (err) {
        // Connection closed
      }
    }, 15000);

    // Initialize MCP transport
    const transport = new SSEServerTransport("/sse", res);
    transports.set(transport.sessionId, transport);

    // Update base URL
    const inferredUrl = getBaseUrlFromReq(req);
    updateCachedBaseUrl(inferredUrl);

    res.on("close", () => {
      if (keepAlive) clearInterval(keepAlive);
      transports.delete(transport.sessionId);
    });

    await mcp.connect(transport);
  } catch (err) {
    console.error("SSE connection error:", err);
    if (keepAlive) clearInterval(keepAlive);
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
  console.log(`✓ MCP Resources: 4 image resources registered`);
  console.log(`✓ Health check: /healthz`);
  console.log(`✓ MCP alias: /mcp`);
  console.log(`✓ SSE endpoint: /sse`);
});
