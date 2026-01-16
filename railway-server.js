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
    "Use when a user feels stuck, overwhelmed, or unsure what to do next. Returns one concrete, time-boxed action they can take immediately to regain momentum.",
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal, context }) => {
      // Intentionally minimal + consistent output (no extra explanation)
      return [
        "Do this now (8 minutes):",
        "1. Set an 8-minute timer.",
        "2. Write the ONE thing creating the most mental noise.",
        "3. Do the smallest visible step on it for 5 minutes.",
        "",
        "Reply: DONE – [what you did]",
      ].join("\n");
    }
  );

  return server;
}

async function main() {
  const mcpServer = createEliteMindsetServer();

  const httpServer = createServer(async (req, res) => {
    try {
      const transport = new StreamableHTTPServerTransport({ req, res });
      await mcpServer.connect(transport);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Server error");
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`elitemindset-mcp listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
