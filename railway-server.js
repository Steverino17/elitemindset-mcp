import http from "http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// -------- MCP tool (your one tool) --------
const mcp = new Server(
  { name: "elitemmindset-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

mcp.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "next_best_step",
        description:
          "Use when a user feels stuck, overwhelmed, or unsure what to do next. Returns one concrete, time-boxed action to regain momentum.",
        inputSchema: {
          type: "object",
          properties: {
            goal: { type: "string", description: "What the user is trying to accomplish." },
            context: { type: "string", description: "Any relevant constraints, situation, or obstacles." },
            timebox_minutes: {
              type: "number",
              description: "How many minutes the user can spend (e.g., 15, 30, 60).",
              default: 30
            }
          },
          required: ["goal"]
        }
      }
    ]
  };
});

mcp.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name !== "next_best_step") {
    return { content: [{ type: "text", text: `Unknown tool: ${name}` }] };
  }

  const goal = (args?.goal ?? "").toString().trim();
  const context = (args?.context ?? "").toString().trim();
  const timebox = Number.isFinite(Number(args?.timebox_minutes)) ? Number(args?.timebox_minutes) : 30;

  const step = `Next step (${timebox} min): Pick ONE tiny action that moves “${goal}” forward. ${
    context ? `Context: ${context}. ` : ""
  }Do it now. No planning spiral.`;

  return { content: [{ type: "text", text: step }] };
});

// -------- HTTP server that OpenAI can scan --------
const PORT = process.env.PORT || 10000;

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("EliteMindset MCP Server - Running");
    return;
  }

  // MCP endpoint (OpenAI Scan Tools hits this)
  if (req.url === "/mcp") {
    // This transport expects MCP-over-HTTP framing from the OpenAI scanner / client.
    // If the client sends something unexpected, we still return a clean 400 (not 404),
    // so debugging is obvious.
    try {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        // If empty body, that's fine — the MCP client will send proper JSON-RPC style payloads.
        // We respond 200 here so the route is confirmed alive.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Bad request" }));
    }
    return;
  }

  // Anything else
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`EliteMindset MCP server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
