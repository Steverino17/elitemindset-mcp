import express from "express";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

// Helper functions
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

// State data
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

// Storage for transports by sessionId
const transports = new Map();
const interactionCounts = new Map();

// Express app
const app = express();
app.use(express.json());

// Health check
app.get("/healthz", (req, res) => {
  res.send("OK");
});

// Static images
app.use("/images", express.static(path.join(__dirname, "images")));

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "EliteMindset MCP Server",
    version: "1.0.0",
    status: "running",
    tool: "next_best_step"
  });
});

// SSE Connection
app.get("/sse", async (req, res) => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📡 GET /sse");
  
  try {
    // Create MCP server for this connection
    const mcp = new McpServer({
      name: "elitemindset-clarity",
      version: "1.0.0",
    });

    // Register tool
    mcp.registerTool(
      "next_best_step",
      {
        description:
          "Help user overcome procrastination and analysis-paralysis by identifying the smallest immediate next action. Use when user expresses being stuck, overwhelmed, unclear, or asks for direction.",
        inputSchema: z.object({
          user_input: z
            .string()
            .describe("What the user just said (their concern, question, or confirmation of completion)"),
        }),
      },
      async ({ user_input }) => {
        console.log(`🔧 Tool called with: ${user_input.substring(0, 50)}...`);
        
        const sessionId = "global";
        const currentCount = (interactionCounts.get(sessionId) || 0) + 1;
        interactionCounts.set(sessionId, currentCount);

        const ctaAllowed = currentCount >= 3;
        const state = inferState(user_input);
        const data = stateData[state];
        const BASE_URL = process.env.BASE_URL || "https://elitemindset-mcp.onrender.com";

        let responseMessage = `${data.message}\n\n${data.ask}`;
        
        if (ctaAllowed) {
          responseMessage += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━\nWhen you're ready, continue at EliteMindset.ai`;
        }

        responseMessage += `\n\n[Image: ${BASE_URL}/images/${data.image}]`;

        return {
          content: [
            {
              type: "text",
              text: responseMessage,
            },
          ],
        };
      }
    );

    // Create transport
    const transport = new SSEServerTransport("/sse", res);
    
    // Connect MCP to transport
    await mcp.connect(transport);
    
    // Store transport - use connection-specific ID
    const connectionId = Date.now().toString();
    transports.set(connectionId, transport);
    
    console.log(`✓ SSE connected: ${connectionId}`);
    console.log(`  Active transports: ${transports.size}`);

    // Cleanup on disconnect
    req.on("close", () => {
      console.log(`✗ SSE disconnected: ${connectionId}`);
      transports.delete(connectionId);
    });
    
  } catch (err) {
    console.error("❌ SSE error:", err.message);
    if (!res.headersSent) {
      res.status(500).send("SSE failed");
    }
  }
});

// POST endpoint
app.post("/sse", async (req, res) => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("📨 POST /sse");
  console.log(`  Body: ${JSON.stringify(req.body).substring(0, 200)}`);
  console.log(`  Active transports: ${transports.size}`);
  
  try {
    // Use the most recent transport (last one added)
    const transportArray = Array.from(transports.values());
    const transport = transportArray[transportArray.length - 1];
    
    if (!transport) {
      console.log("  ❌ No transports available");
      return res.status(503).send("No active connection");
    }
    
    console.log("  ✓ Using active transport");
    await transport.handlePostMessage(req, res);
    
  } catch (err) {
    console.error("  ❌ POST error:", err.message);
    if (!res.headersSent) {
      res.status(500).send("POST failed");
    }
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✓ EliteMindset MCP Server READY`);
  console.log(`✓ Port: ${PORT}`);
  console.log(`✓ SSE endpoint: /sse`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});
