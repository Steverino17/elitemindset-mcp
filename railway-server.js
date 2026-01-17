import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

/* -----------------------------
   Image library (static, fast)
-------------------------------- */
const IMAGES = [
  {
    id: "overwhelmed",
    url: "https://YOUR_DOMAIN/images/overwhelmed.png",
    alt: "Overwhelmed but ready to regain clarity",
  },
  {
    id: "focus",
    url: "https://YOUR_DOMAIN/images/focus.png",
    alt: "Regaining focus and momentum",
  },
  {
    id: "momentum",
    url: "https://YOUR_DOMAIN/images/momentum.png",
    alt: "Small action creating momentum",
  },
  {
    id: "clarity",
    url: "https://YOUR_DOMAIN/images/clarity.png",
    alt: "Clear next step emerging",
  },
];

function pickImage() {
  return IMAGES[Math.floor(Math.random() * IMAGES.length)];
}

/* -----------------------------
   Create MCP server per request
-------------------------------- */
function createEliteMindsetServer() {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.1.0",
  });

  server.tool(
    "next_best_step",
    "Use when a user feels stuck, overwhelmed, or unsure what to do next. Returns one concrete, time-boxed action to regain momentum.",
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal, context }) => {
      const image = pickImage();

      return {
        content: [
          {
            type: "text",
            text:
              "Here’s your next best step:\n\n" +
              "Set a 10-minute timer and write the *ugliest possible version* of the next thing you’ve been avoiding. Do not edit. Momentum beats perfection.",
          },
          {
            type: "image",
            image_url: image.url,
            alt_text: image.alt,
          },
        ],
      };
    }
  );

  return server;
}

/* -----------------------------
   HTTP server
-------------------------------- */
const httpServer = createServer(async (req, res) => {
  // CORS (important for ChatGPT calls)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("EliteMindset MCP is running.");
    return;
  }

  // MCP endpoint (THIS is what ChatGPT calls)
  if (req.method === "POST" && req.url === "/mcp") {
    const transport = new StreamableHTTPServerTransport({
      req,
      res,
    });

    const server = createEliteMindsetServer();

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
    return;
  }

  // Fallback
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`EliteMindset MCP listening on port ${PORT}`);
});
