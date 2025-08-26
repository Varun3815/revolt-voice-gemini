let ws, ac, workletNode, mediaStream;
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const inTxt = document.getElementById("in-txt");
const outTxt = document.getElementById("out-txt");
const player = document.getElementById("player");

function start() {
  ws = new WebSocket("ws://localhost:3001/socket");
  ws.binaryType = "arraybuffer";

  ws.onopen = () => {
    statusEl.textContent = "connected";
    ws.send(JSON.stringify({ type: "start" }));
  };

  ws.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      const msg = JSON.parse(ev.data);
      if (msg.type === "input_transcript") {
        inTxt.textContent = msg.text;
      } else if (msg.type === "output_transcript") {
        outTxt.textContent = msg.text;
      } else if (msg.type === "error") {
        console.error("Server error:", msg.error);
      }
      return;
    }

    // Binary WAV chunk from server
    const blob = new Blob([ev.data], { type: "audio/wav" });
    player.src = URL.createObjectURL(blob);
    player.play().catch((e) => console.warn("Autoplay blocked:", e));
  };

  ws.onclose = () => (statusEl.textContent = "disconnected");
  ws.onerror = () => (statusEl.textContent = "error");

  initMic();
}

async function initMic() {
  ac = new AudioContext();
  await ac.audioWorklet.addModule("/pcm-worklet.js");

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true },
  });

  const src = ac.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(ac, "pcm-worklet", {
    numberOfInputs: 1,
    numberOfOutputs: 1,
  });

  src.connect(workletNode).connect(ac.destination);

  workletNode.port.onmessage = (e) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(e.data);
  };
}

function stop() {
  workletNode?.disconnect();
  mediaStream?.getTracks()?.forEach((t) => t.stop());
  ws?.close();
  statusEl.textContent = "idle";
}

startBtn.addEventListener("click", () => {
  if (statusEl.textContent === "idle" || statusEl.textContent === "disconnected") {
    start();
    startBtn.textContent = "Stop";
  } else {
    stop();
    startBtn.textContent = "Start";
  }
});
