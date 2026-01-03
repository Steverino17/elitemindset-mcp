export default function handler(req, res) {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // If you're behind any proxy/CDN that buffers, this helps:
  res.flushHeaders?.();

  // Send the "open" event (optional but fine)
  res.write("event: open\n");
  res.write('data: {"status":"connected"}\n\n');

  // Send the MCP endpoint ChatGPT should POST to
  const origin = `https://${req.headers.host}`;
  res.write("event: endpoint\n");
  res.write(`data: ${origin}/api/mcp\n\n`);

  // IMPORTANT: close immediately so Vercel doesn't kill it at 300s
  res.end();
}
