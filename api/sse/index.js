export default function handler(req, res) {
  // Return SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");

  // Send the MCP endpoint to use, then CLOSE immediately
  const base = `https://${req.headers.host}`;
  const endpoint = `${base}/api/mcp`;

  res.write(`event: endpoint\n`);
  res.write(`data: ${endpoint}\n\n`);

  // Close so Vercel doesn't time out after 300 seconds
  res.end();
}
