let ws, ac, workletNode, mediaStream;
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const inTxt = document.getElementById("in-txt");
const outTxt = document.getElementById("out-txt");
const player = document.getElementById("player");
let audioQueue = [];
let isPlaying = false;

function start() {
  ws = new WebSocket("ws://localhost:3001/socket");
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    statusEl.textContent = "Connecting to AI...";
    const startMessage = JSON.stringify({ type: "start" });
    console.log(">>> CLIENT: WebSocket open. Sending 'start' message:", startMessage);
    ws.send(startMessage);
    // Mic is NOT started here. We wait for the server's 'server_ready' signal.
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      const msg = JSON.parse(ev.data);
      console.log("<<< CLIENT: Received JSON from server:", msg);
      
      // --- HANDSHAKE: Server is ready, NOW we start the mic ---
      if (msg.type === "server_ready") {
        statusEl.textContent = "Mic enabled. Listening...";
        console.log("🎤 Server is ready. Initializing microphone.");
        initMic(); 
      } else if (msg.type === "input_transcript") {
        inTxt.textContent = msg.text;
      } else if (msg.type === "output_transcript") {
        outTxt.textContent = msg.text;
      } else if (msg.type === "error") {
        console.error("Server error:", msg.error);
        statusEl.textContent = `error: ${msg.error}`;
      }
      return;
    }

    if (ev.data instanceof ArrayBuffer) {
      audioQueue.push(ev.data);
      if (!isPlaying) {
        playNextChunk();
      }
    }
  };

  ws.onclose = (event) => {
    console.log(`CLIENT: WebSocket closed. Code: ${event.code}`);
    statusEl.textContent = "Disconnected";
    stopMic();
  };
  ws.onerror = (err) => {
    console.error("CLIENT: WebSocket error:", err);
    statusEl.textContent = "Error";
  };
}

function playNextChunk() {
  if (audioQueue.length === 0) { isPlaying = false; return; }
  isPlaying = true;
  const chunk = audioQueue.shift();
  const blob = new Blob([chunk], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  player.src = url;
  player.play().catch(e => console.warn("Autoplay blocked", e));
  player.onended = () => { URL.revokeObjectURL(url); playNextChunk(); };
}

async function initMic() {
  try {
    if (!ac || ac.state === 'closed') {
      ac = new AudioContext();
      await ac.audioWorklet.addModule("/pcm-worklet.js");
    }
    if (ac.state === "suspended") await ac.resume();
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
    const src = ac.createMediaStreamSource(mediaStream);
    workletNode = new AudioWorkletNode(ac, "pcm-worklet");
    src.connect(workletNode).connect(ac.destination);
    workletNode.port.onmessage = (e) => ws?.readyState === WebSocket.OPEN && ws.send(e.data);
  } catch (err) {
    console.error("Error initializing microphone:", err);
    statusEl.textContent = "Mic permission denied?";
  }
}

function stopMic() {
  mediaStream?.getTracks()?.forEach((t) => t.stop());
  if (ac && ac.state !== 'closed') ac.close();
}

function stop() {
  if (ws) ws.close();
  stopMic();
  statusEl.textContent = "Idle";
  startBtn.textContent = "Start";
  audioQueue = [];
  isPlaying = false;
}

startBtn.addEventListener("click", () => {
  const currentStatus = statusEl.textContent;
  if (currentStatus === "Idle" || currentStatus === "Disconnected" || currentStatus.startsWith("Error")) {
    start();
    startBtn.textContent = "Stop";
  } else {
    stop();
  }
});