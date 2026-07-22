import "barcode-detector/side-effects";

let stream = null;
let running = false;

export async function startScanner(video1, onDetected) {
  const detector = new BarcodeDetector({ formats: ["ean_13"] });
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }, //this will be outwards facing camera on phone
  });
  video1.srcObject = stream;
  video1.hidden = false;
  await video1.play();

  running = true;
  const seen = new Set();

  async function tick() {
    if (!running) {
      return;
    }
    try {
      const codes = await detector.detect(video1);
      for (const c of codes) {
        if (!seen.has(c.rawValue)) {
          seen.add(c.rawValue); //keeps from adding book more than once
          onDetected(c.rawValue); //adds isbn
        }
      }
    } catch {
      //catching the errors but not publishing --> this is because the camera may pick up a slightly different number but it corrects
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function stopScanner(video1) {
  running = false;
  stream?.getTracks().forEach((t) => t.stop());
  video1.hidden = true;
  video1.srcObject = null;
}
