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

      const lines = g
        ? [
            "Do this now (10 minutes):",
            "1) Set a 10-minute timer.",
            `2) Write ONE sentence: “If this worked, I’d have ______.” (for: "${g}")`,
            "3) List 3 tiny actions you can do in the next 15 minutes.",
            "4) Pick the easiest. Start it immediately.",
          ]
        : [
            "Do this now (10 minutes):",
            "1) Set a 10-minute timer.",
            "2) Write the ONE thing you’re avoiding.",
            "3) Do the smallest possible version for 5 minutes.",
            "4) Stop when the timer ends. Reply “DONE” + what you did.",
          ];

      // Optional: keep context, but do NOT add bulk
      if (c) lines.push(`(Context: ${c.slice(0, 120)})`);

      // Hard cap: keep output tight even if context is huge
      let text = lines.join("\n");
      const words = text.split(/\s+/);
      if (words.length > 120) text = words.slice(0, 120).join(" ") + "…";

      return {
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
