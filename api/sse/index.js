export default async function handler(req, res) {
  // Set proper SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Send the endpoint URL
  const base = `https://${req.headers.host}`;
  const endpoint = `${base}/api/mcp`;

  res.write(`event: endpoint\n`);
  res.write(`data: ${endpoint}\n\n`);

  // Keep connection alive for 25 seconds before closing
  const timeout = setTimeout(() => {
    res.end();
  }, 25000);

  // Clean up on client disconnect
  req.on('close', () => {
    clearTimeout(timeout);
    res.end();
  });
}
