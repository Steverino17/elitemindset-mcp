import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

// Create the MCP server + your tool(s)
function createEliteMindsetServer() {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.0.0",
  });

  server.tool(
    "next_best_step",
    "Use when a user feels stuck, overwhelmed, or unsure what to do next. Returns one concrete, time-boxed action they can take immediately to regain momentum.",
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal, context }) => {
      const g = (goal || "").trim();
      const c = (context || "").trim();

      const step = g
        ? `Set a 10-minute timer. Write ONE sentence that defines the outcome for: "${g}". Then list 3 tiny actions you could do in the next 15 minutes. Pick the easiest and do it immediately.`
        : `Set a 10-minute timer. Write the one thing you're avoiding. Then do the smallest possible version of it for 5 minutes. Stop when the timer ends.`;

      return {
        content: [
          {
            type: "text",
            text:
              step +
              (c ? `\n\nContext noted: ${c}` : ""),
          },
        ],
      };
    }
  );

  return server;
}

// Normalize paths so /mcp, /mcp/, /api/mcp, /api/mcp/ all work
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

    // Simple health checks (so YOU can verify it quickly)
    if (url.pathname === "/" || url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("EliteMindset MCP server is running");
      return;
    }

    // MCP endpoint (must accept BOTH GET and POST)
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

    // Anything else -> 404
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}).listen(PORT, () => {
  console.log(`EliteMindset MCP server running on port ${PORT}`);
  console.log(`MCP endpoint: /mcp (also /api/mcp)`);
});
