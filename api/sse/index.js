export default function handler(req, res) {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // IMPORTANT: create a session id and tell ChatGPT where to POST MCP calls
  const sessionId = crypto.randomUUID();

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] || "https");
  const mcpUrl = `${proto}://${host}/api/mcp?sessionId=${encodeURIComponent(sessionId)}`;

  // MCP-compatible: provide endpoint event
  res.write(`event: endpoint\n`);
  res.write(`data: ${mcpUrl}\n\n`);

  // Keep the connection alive (prevents idle timeouts)
  const keepAlive = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    res.end();
  });
}
