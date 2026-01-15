import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

function createEliteMindsetServer() {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.0.0",
  });

  server.tool(
    "next_best_step",
    "Use when a user feels stuck, overwhelmed, procrastinating, or unsure what to do next. Return ONE short, time-boxed action. No explanations.",
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal }) => {
      const g = (goal || "").trim();

      const lines = g
        ? [
            "You’re not stuck. You need one move.",
            "",
            "Do this now (10 minutes):",
            "1) Set a 10-minute timer.",
            "2) Write: If this worked, I’d have ____.",
            "3) Pick ONE tiny action.",
            "4) Do it for 5 minutes. Stop.",
            "",
            "Reply DONE + what you did.",
          ]
        : [
            "You’re not stuck. You’re overloaded.",
            "",
            "Do this now (10 minutes):",
            "1) Set a 10-minute timer.",
            "2) Write the ONE thing you’re avoiding.",
            "3) Do the smallest visible step for 5 minutes.",
            "4) Stop.",
            "",
            "Reply DONE + what you did.",
          ];

      let text = lines.join("\n");

      const MAX_WORDS = 75;
      const words = text.split(/\s+/);
      if (words.length > MAX_WORDS) {
        text = words.slice(0, MAX_WORDS).join(" ");
      }

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
      (req.method === "GET" ||
        req.method === "POST" ||
        req.method === "DELETE")
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
