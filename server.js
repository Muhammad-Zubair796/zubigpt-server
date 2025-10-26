// ===== server.js =====
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import { TextDecoder } from "util";
import dotenv from "dotenv";

dotenv.config(); // Load variables from .env

const app = express();
const PORT = process.env.PORT || 5000;

// Use environment variable for Groq API key
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY is not set in environment variables!");
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.static("."));

app.post("/api/groq", async (req, res) => {
  const { prompt } = req.body;
  console.log("🟢 Incoming prompt:", prompt);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        stream: true,
        messages: [
          { role: "system", content: "You are a helpful AI assistant." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok || !response.body) {
      console.error("❌ Groq API Error:", await response.text());
      res.write(`data: ${JSON.stringify({ error: "Groq API failed" })}\n\n`);
      res.end();
      return;
    }

    const decoder = new TextDecoder("utf-8");
    for await (const chunk of response.body) {
      const text = decoder.decode(chunk);
      const lines = text.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const json = JSON.parse(data);
            const token = json?.choices?.[0]?.delta?.content;
            if (token) {
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
              res.flush?.();
              process.stdout.write(token);
            }
          } catch (err) {
            console.error("❌ SSE parse error:", err);
          }
        }
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
    console.log("\n✅ Stream finished\n");

  } catch (error) {
    console.error("❌ Streaming error:", error);
    res.write(`data: ${JSON.stringify({ error: "Internal Server Error" })}\n\n`);
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Groq chat server running on port ${PORT}`);
});
