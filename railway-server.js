import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

/* -----------------------------
   Helpers
-------------------------------- */
function getBaseUrl(req) {
  // Render/Railway typically set x-forwarded-proto
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  return `${proto}://${host}`;
}

function pickImage(baseUrl) {
  // Use your actual filenames here (case-sensitive!)
  const images = [
    { file: "overwhelmed.png", alt: "Overwhelmed but ready to regain clarity" },
    { file: "focus.png", alt: "Regaining focus and momentum" },
    { file: "momentum.png", alt: "Small action creating momentum" },
    { file: "clarity.png", alt: "Clear next step emerging" },
  ];

  const chosen = images[Math.floor(Math.random() * images.length)];
  return {
    url: `${baseUrl}/images/${chosen.file}`,
    alt: chosen.alt,
  };
}

/* -----------------------------
   Create MCP server per request
-------------------------------- */
function createEliteMindsetServer(baseUrl) {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.2.0",
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

      // Pick one image without any network calls (fast)
      const image = pickImage(baseUrl);

      // Short, visceral, warm response
      const text =
        "Do this now:\n\n" +
        "Set a 10-minute timer.\n" +
        "Open a blank note.\n" +
        "Write the first ugly, imperfect version of the next task step.\n\n" +
        "No polishing. No organizing. Just forward.\n\n" +
        (g ? `Goal: ${g}\n` : "") +
        (c ? `Context: ${c}\n` : "");

      return {
        content: [
          { type: "text", text },
          {
            // This is metadata only; it does NOT fetch the image
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Basic logging (helps you see what's being called)
  const url = req.url || "";
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);

  // Health check
  if (req.method === "GET" && url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("EliteMindset MCP is running.");
    return;
  }

  // MCP endpoint
  // IMPORTANT: handle BOTH GET and POST to avoid stalls/timeouts from method mismatch
  if ((req.method === "POST" || req.method === "GET") && url === "/mcp") {
    const baseUrl = getBaseUrl(req);

    const transport = new StreamableHTTPServerTransport({ req, res });
    const server = createEliteMindsetServer(baseUrl);

    res.on("close", () => {
      try {
        transport.close();
      } catch {}
      try {
        server.close();
      } catch {}
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP handler error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      res.end("Internal Server Error");
    }
    return;
  }

  // Fallback
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

httpServer.listen(PORT, () => {
  console.log(`EliteMindset MCP listening on port ${PORT}`);
});
