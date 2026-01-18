import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const PORT = process.env.PORT || 10000;

/**
 * Minimal state machine for "next_best_step"
 * States:
 *  S1 = Start (stuck/overwhelmed)
 *  S2 = Reinforce (after DONE / action)
 *  S3 = Momentum (continuation)
 *  S4 = Clarity (explicit prioritization request)
 *
 * Tool returns a structured payload:
 *  { state, cta_allowed, message, ask, next_state }
 *
 * CTA is ONLY allowed in S2 and ONLY if cta_ok is true.
 */

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

function responseForState(state, { ctaOk }) {
  if (state === "S1") {
    return {
      state: "S1",
      cta_allowed: false,
      next_state: "S2",
      ask: "Reply: DONE — (what you did)",
      message:
        "You’re not stuck. You’re overloaded.\n\nWe’re not fixing everything.\nWe’re just starting.\n\nDo this:\nOpen the thing you’ve been avoiding.\nWrite one sentence.\nStop.\n\nDon’t make it good.\n\nWhen you’re done, reply:\nDONE — (what you did)",
    };
  }

  if (state === "S2") {
    const base =
      "Good. That matters.\n\nYou didn’t need motivation.\nYou needed movement.\n\nPause for a breath.\nNotice the pressure drop.";
    const cta =
      "\n\nIf you want, this is exactly what EliteMindset is for —\none calm next step when things feel heavy.";
    return {
      state: "S2",
      cta_allowed: Boolean(ctaOk),
      next_state: "S3",
      ask: "What feels easier now?",
      message: ctaOk ? base + cta + "\n\nWhat feels easier now?" : base + "\n\nWhat feels easier now?",
    };
  }

  if (state === "S3") {
    return {
      state: "S3",
      cta_allowed: false,
      next_state: "S3",
      ask: "Tell me what you did.",
      message:
        "Good. Stay small.\n\nLook at what you just did.\nWhat’s the very next tiny thing?\n\nDo only that.\nTwo minutes max.\nStop again.\n\nTell me what you did.",
    };
  }

  return {
    state: "S4",
    cta_allowed: false,
    next_state: "S3",
    ask: "Tell me: • the thing • the action",
    message:
      "Okay. One thing now.\n\nIf you could move only one thing forward today,\nwhich would make the rest feel lighter?\n\nThat’s the priority.\n\nWhat’s the smallest visible action?\nFive minutes or less.\n\nDo it.\nThen tell me:\n• the thing\n• the action",
  };
}

function buildUserText({ user_message, goal, context }) {
  const parts = [cleanText(user_message), cleanText(goal), cleanText(context)].filter(Boolean);
  return parts.join(" | ").trim();
}

// ---- MCP Server ----
const mcp = new McpServer({
  name: "elitemmindset-mcp",
  version: "1.0.0",
});

mcp.tool(
  "next_best_step",
  "Use when a user feels stuck, overwhelmed, procrastinating, or unsure what to do next. Returns one calm, minimal next step using a simple state machine (S1–S4).",
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

// ---- HTTP Server (SSE transport expected by connector) ----
const app = express();
app.use(express.json({ limit: "1mb" }));

// Health check (safe for browser)
app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/healthz", (_req, res) => res.status(200).send("OK"));

// Keep active SSE transports by sessionId
const transports = new Map();

// SSE endpoint (this is what the connector expects)
app.get("/sse", async (req, res) => {
  try {
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    res.on("close", () => {
      transports.delete(transport.sessionId);
    });

    await mcp.connect(transport);
  } catch (err) {
    if (!res.headersSent) res.status(500).send("SSE init error");
  }
});

// Message endpoint used by SSE transport
app.post("/messages", async (req, res) => {
  const sessionId = cleanText(req.query.sessionId);
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).send("Unknown sessionId");
    return;
  }

  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send("Message handling error");
  }
});

app.listen(PORT, () => {});
