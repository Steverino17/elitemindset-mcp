export default async function handler(req, res) {
  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send the MCP endpoint URL
  const base = `https://${req.headers.host}`;
  const endpoint = `${base}/api/mcp`;

  res.write(`event: endpoint\n`);
  res.write(`data: ${endpoint}\n\n`);

  // Keep alive for 55 seconds (just under Vercel's 60 second limit)
  const keepAlive = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 15000);

  // Clean up after 55 seconds
  const timeout = setTimeout(() => {
    clearInterval(keepAlive);
    res.end();
  }, 55000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(keepAlive);
    clearTimeout(timeout);
    res.end();
  });
}
