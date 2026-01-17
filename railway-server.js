import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const PORT = process.env.PORT || 10000;

// If you set this in Render ENV, it makes image links bulletproof.
// Example value: https://elitemindset-mcp.onrender.com
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

// Resolve local path to /images folder (must exist in repo root)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMAGES_DIR = path.join(__dirname, "images");

// These MUST match your GitHub /images filenames exactly
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

function normalize(s) {
  return (s || "").toString().trim().toLowerCase();
}

function pickImageFile(goal, context) {
  const t = `${goal || ""} ${context || ""}`.toLowerCase();

  if (t.includes("overwhelm") || t.includes("overwhelmed") || t.includes("scattered") || t.includes("anx")) {
    return "overwhelmed.png";
  }
  if (t.includes("stuck") || t.includes("procrast") || t.includes("avoid") || t.includes("blocked")) {
    return "stuck.png";
  }
  if (t.includes("unclear") || t.includes("confus") || t.includes("direction") || t.includes("decision") || t.includes("too many ideas")) {
    return "unclear-direction.png";
  }
  return "ready-to-act.png";
}

function shortPlan(file) {
  // Keep it visceral and short
  if (file === "overwhelmed.png") {
    return "Set 10 minutes. Write the ONE thing creating the most mental noise. Then do a 2-minute starter on it.";
  }
  if (file === "stuck.png") {
    return "Set 8 minutes. Choose a 2-minute starter action. Do it once. Stop. Momentum unlocked.";
  }
  if (file === "unclear-direction.png") {
    return "List 3 options (titles only). Circle the one you can prove in 24 hours. Define the first deliverable in 1 sentence.";
  }
  return "Pick ONE outcome for today. Do the first 15-minute chunk. Then stop and reassess.";
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
    version: "1.5.0",
  });

  server.tool(
    "next_best_step",
    "Return ONE time-boxed action (5–15 minutes). Keep it short, direct, and practical. Include one image using markdown.",
    {
      goal: z.string().optional(),
      context: z.string().optional(),
    },
    async ({ goal, context }) => {
      const g = (goal || "").trim();
      const c = (context || "").trim();

      const file = pickImageFile(g, c);
      const imgUrl = `${getBaseUrl(req)}/images/${file}`;

      const text =
        `**Next step (under 15 min):** ${shortPlan(file)}\n\n` +
        `**Reply with:** DONE — (what you did)\n\n` +
        `![EliteMindset](${imgUrl})`;

      // IMPORTANT: Put the image in text as markdown so ChatGPT actually renders it.
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

  // Serve images from /images folder
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

  // Fallback
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`EliteMindset MCP listening on port ${PORT}`);
  if (!PUBLIC_BASE_URL) console.log("Tip: set PUBLIC_BASE_URL in Render for stable image URLs.");
});
