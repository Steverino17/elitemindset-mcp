export default function handler(req, res) {
  // Required headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial message so the connection opens
  res.write(`event: open\n`);
  res.write(`data: {"status":"connected"}\n\n`);

  // Keep-alive ping every 15 seconds (important for Vercel)
  const keepAlive = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);
  }, 15000);

  // Clean up if client disconnects
  req.on("close", () => {
    clearInterval(keepAlive);
    res.end();
  });
}
