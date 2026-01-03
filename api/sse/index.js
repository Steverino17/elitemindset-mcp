export default function handler(req, res) {
  // Required SSE headers (Vercel-safe)
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Flush headers immediately
  if (res.flushHeaders) res.flushHeaders();

  // Initial handshake event (must be fast)
  res.write(`event: open\n`);
  res.write(`data: ${JSON.stringify({ status: "connected" })}\n\n`);

  // Heartbeat every 15s so ChatGPT does not time out
  const keepAlive = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, 15000);

  // Cleanup
  req.on("close", () => {
    clearInterval(keepAlive);
    res.end();
  });
}
