import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

// Set this in Render ENV:
// PUBLIC_BASE_URL=https://elitemindset-mcp.onrender.com
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGES_DIR = path.join(__dirname, "images");

// Must match GitHub exactly
const IMAGE_FILES = [
  "overwhelmed.png",
  "ready-to-act.png",
  "stuck.png",
  "unclear-direction.png",
];

function getBaseUrl(req) {
  if (PUBLIC_BASE_URL) return PUBLIC_BASE_URL;
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString();
  return `${proto}://${host}`;
}

function contentTypeFor(filename) {
  const f = filename.toLowerCase();
  if (f.endsWith(".png")) return "image/png";
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
  if (f.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function pickImageFile(goal, context) {
  const t = `${goal || ""} ${context || ""}`.toLowerCase();

  if (/(overwhelm|overwhelmed|scattered|spinning|swamped|frazzled|burned out|anx)/.test(t)) return "overwhelmed.png";
  if (/(stuck|procrast|avoid|blocked|freeze|cant start|can't start)/.test(t)) return "stuck.png";
  if (/(unclear|confus|direction|decision|too many ideas|priority|options)/.test(t)) return "unclear-direction.png";
  return "ready-to-act.png";
}

function microAction(file) {
  if (file === "overwhelmed.png") return "10 min: write the ONE loudest pressure. Then do a 2-min starter (open doc + title).";
  if (file === "stuck.png") return "8 min: pick a 2-min starter action. Do it once. Stop on purpose.";
  if (file === "unclear-direction.png") return "12 min: list 3 options (titles only). Circle fastest proof in 24h. Write first deliverable in 1 sentence.";
  return "15 min: pick ONE outcome for today. Do the first tiny chunk. Stop + reassess.";
}

async function tryServeImage(req, res) {
  if (req.method !== "GET" || !req.url) return false;

  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/images/")) return false;

  const requested = url.pathname.replace("/images/", "");
  const safeName = path.basename(requested);

  if (!IMAGE_FILES.includes(safeName)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return true;
  }

  try {
    const filePath = path.join(IMAGES_DIR, safeName);
    const buf = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypeFor(safeName),
      "Cache-Control": "public, max-age=86400",
    });
    res.end(buf);
    return true;
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return true;
  }
}

function createEliteMindsetServer(req) {
  const server = new McpServer({
    name: "elitemindset-mcp",
    version: "1.6.0",
  });

  server.tool(
    "next_best_step",
    "Return a STRICT 3-line answer. No fluff. No extra explanations. Always include the image first. The assistant must output the tool text verbatim.",
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal, context }) => {
      const file = pickImageFile(goal, context);
      const imgUrl = `${getBaseUrl(req)}/images/${file}`;

      // Image first + plain URL fallback
      const text =
        `![EliteMindset](${imgUrl})\n` +
        `NEXT: ${microAction(file)}\n` +
        `REPLY: DONE — (what you did)\n` +
        `URL: ${imgUrl}`;

      return { content: [{ type: "text", text }] };
    }
  );

  return server;
}

const httpServer = createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health
  if (req.method === "GET" && (req.url === "/" || req.url === "")) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("EliteMindset MCP is running.");
    return;
  }

  // Serve images
  const served = await tryServeImage(req, res);
  if (served) return;

  // MCP endpoint
  if ((req.method === "POST" || req.method === "GET") && req.url === "/mcp") {
    const transport = new StreamableHTTPServerTransport({ req, res });
    const server = createEliteMindsetServer(req);

    res.on("close", () => {
      try { transport.close(); } catch {}
      try { server.close(); } catch {}
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP handler error:", err);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal Server Error");
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`EliteMindset MCP listening on port ${PORT}`);
});
