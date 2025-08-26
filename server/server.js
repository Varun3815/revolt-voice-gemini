import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const PORT = 3001;
const app = express();
const server = http.createServer(app);



const genAI = new GoogleGenerativeAI("AIzaSyAuzURxW23frmmsHSjZib6DpdMhffiAyfw");
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-live-001" });

const wss = new WebSocketServer({ server, path: "/socket" });

wss.on("connection", (ws) => {
  console.log("✅ WebSocket client connected");
  let chat;

  ws.on("message", async (data) => {
    try {
      if (typeof data === "string") {
        const msg = JSON.parse(data);

        if (msg.type === "start") {
          console.log("🎤 'start' message received. Attempting to initialize Gemini stream...");

          try {
            // --- This is the part that is likely failing ---
            chat = model.startChat({
              systemInstruction: "You are a helpful assistant for Revolt Motors. Only answer questions about Revolt Motors motorcycles and technology.",
              enablePerTurnTextToSpeech: true,
            });

            const stream = await chat.sendMessageStream("");
            // --- If you see this log, the connection to Google was successful ---
            console.log("✅ Gemini stream is ready. Sending 'server_ready' to client.");
            ws.send(JSON.stringify({ type: "server_ready" }));

            // Process the stream from Gemini
            for await (const chunk of stream) {
              if (ws.readyState !== ws.OPEN) break;
              if (chunk.text) {
                const text = chunk.text();
                console.log("📢 Received text from Gemini:", text);
                ws.send(JSON.stringify({ type: "output_transcript", text }));
              } else if (chunk.audio) {
                const audioChunk = chunk.audio();
                ws.send(audioChunk);
              }
            }

          } catch (geminiError) {
            // --- This will catch the specific error from the Gemini API ---
            console.error("🔥🔥🔥 FAILED TO CONNECT TO GEMINI API! 🔥🔥🔥");
            console.error(geminiError);
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: "error", error: "Could not connect to the AI service. Check server logs." }));
            }
          }
        }
      } else if (data instanceof Buffer || data instanceof ArrayBuffer) {
        if (chat) {
          await chat.sendAudio(Buffer.from(data));
        }
      }
    } catch (err) {
      console.error("❌ Outer error in message handler:", err);
    }
  });

  ws.on("close", () => console.log("❎ WebSocket client disconnected"));
  ws.on("error", (err) => console.error("🔥 WebSocket connection error:", err));
});

server.listen(PORT, () =>
  console.log(`🚀 Server is live at http://localhost:${PORT}`)
);