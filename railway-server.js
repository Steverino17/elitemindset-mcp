import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 3000;
const MCP_PATH = "/mcp";

// Create the MCP server
function createEliteMindsetServer() {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.0.0",
  });

  // Register the next_best_step tool
  server.tool(
    "next_best_step",
    "Use when a user feels stuck, overwhelmed, or unsure what to do next. Returns one concrete, time-boxed action they can take immediately to regain momentum.",
    {
      goal: z.string().describe("What the user is trying to achieve"),
      blocker: z.string().describe("What feels stuck or unclear right now"),
      time_available: z.number().optional().describe("How many minutes available (e.g. 10, 30, 60)"),
    },
    async ({ goal, blocker, time_available }) => {
      const time = time_available || 15;
      let action;

      if (time <= 10) {
        action = `Spend 10 minutes writing down the smallest action that would move you past "${blocker}". Do not optimize—just write.`;
      } else if (time <= 30) {
        action = `Spend ${Math.round(time)} minutes creating a rough outline or draft related to "${goal}". Stop when time is up.`;
      } else {
        action = `Use ${Math.round(time)} minutes to actively work on one concrete piece of "${goal}"—prototype, test, or write something that exists outside your head.`;
      }

      return {
        content: [
          {
            type: "text",
            text: action,
          },
        ],
      };
    }
  );

  return server;
}

// Create HTTP server
const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS, DELETE",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  // Health check endpoint
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("EliteMindset MCP Server - Running");
    return;
  }

  // MCP endpoint
  const MCP_METHODS = new Set(["POST", "GET", "DELETE"]);
  if (url.pathname === MCP_PATH && req.method && MCP_METHODS.has(req.method)) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const mcpServer = createEliteMindsetServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      mcpServer.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      console.error("MCP Error:", error);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  // 404 for other paths
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`EliteMindset MCP server running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}${MCP_PATH}`);
});
