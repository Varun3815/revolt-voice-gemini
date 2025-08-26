import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import bodyParser from "body-parser";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";

const PORT = 3001;
const app = express();
const server = http.createServer(app);

const genAI = new GoogleGenerativeAI("AIzaSyAuzURxW23frmmsHSjZib6DpdMhffiAyfw");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// WebSocket server
const wss = new WebSocketServer({ server, path: "/socket" });

wss.on("connection", (ws) => {
  console.log("✅ Client connected");

  const keepAlive = setInterval(() => {
    if (ws.readyState === ws.OPEN) ws.ping();
  }, 20000);

  ws.on("message", async (data) => {
    try {
      if (typeof data === "string") {
        const msg = JSON.parse(data);
        if (msg.type === "start") {
          console.log("🎤 Start requested");
          ws.send(JSON.stringify({ type: "status", status: "listening" }));
        }
      } else {
        // Binary audio from client (PCM 16k)
        // Convert & send to Gemini for transcription + response
        const audioBytes = Buffer.from(data);

        // --- Gemini API call ---
        const result = await model.generateContent({
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/wav",
                    data: audioBytes.toString("base64"),
                  },
                },
              ],
            },
          ],
        });

        const textResponse = result.response.text();
        console.log("Gemini text:", textResponse);

        // Send transcript back to browser
        ws.send(JSON.stringify({ type: "output_transcript", text: textResponse }));

        // For now, echo audio back (later: use TTS)
        ws.send(audioBytes);
      }
    } catch (err) {
      console.error("❌ Error:", err);
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({ type: "error", error: err.message || "Unknown error" })
        );
      }
    }
  });

  ws.on("close", () => {
    console.log("❎ Client disconnected");
    clearInterval(keepAlive);
  });

  ws.on("error", (err) => console.error("WebSocket error:", err));
});

app.use(bodyParser.json());
app.get("/", (req, res) => res.send("WebSocket + Gemini server running"));

server.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}`)
);
