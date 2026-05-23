const $ = (id) => document.getElementById(id);

const settingsKey = "lunaReceiptBoothSettings.v5";

const defaults = {
  galleryUrl: "https://luna.wedding/receipts/",
  uploadEndpoint: "",
  screenEyebrow: "Toby & Michelle",
  screenTitle: "Receipt Booth",
  screenHint: "Three poses. Three seconds apart. Your finished receipt strip will be added to the gallery.",
  mainButtonText: "Tap to Take 3 Photos",
  uploadButtonText: "PRINT ANOTHER",
  takeAnotherText: "Take Another",
  directionsTitle: "Where to see your photos",
  directionsBody: "Scan the QR code printed on your receipt, or visit luna.wedding/receipts after the event.",
  receiptTitle: "TOBY + MICHELLE",
  receiptDate: "06.06.26",
  receiptPhrase: "SMILE * SNAP * KEEP",
  qrHeading: "SEE YOUR PHOTOS",
  qrCaption: "Scan the code for your receipt strip",
  bottomLine1: "Toby & Michelle · June 6, 2026",
  bottomLine2: "luna.wedding/receipts",
  ditherMode: "atkinson",
  photoCount: 3,
  countdownSeconds: 3,
  autoResetSeconds: 15,
  autoUpload: true,
  autoPrint: true
};

let settings = loadSettings();
let stream = null;
let lastPhotoCanvases = [];
let lastReceiptCanvas = null;
let lastGalleryLink = settings.galleryUrl;
let adminTapCount = 0;
let adminTapTimer = null;
let autoResetTimer = null;
let autoResetInterval = null;
let autoResetRemaining = 0;
let adminMode = false;

const camera = $("camera");
const receiptPreviewCanvas = $("receiptPreviewCanvas");
const adminPreviewCanvas = $("adminPreviewCanvas");
const sidePreviewCanvas = $("sidePreviewCanvas");
const countdown = $("countdown");
const poseIndicator = $("poseIndicator");
const cameraStage = $("cameraStage");
const receiptStage = $("receiptStage");
const statusLine = $("statusLine");
const autoResetLine = $("autoResetLine");

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) || "{}") };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function applyGuestCopy() {
  $("screenEyebrow").textContent = settings.screenEyebrow;
  $("screenTitle").textContent = settings.screenTitle;
  $("screenHint").textContent = settings.screenHint;
  $("takePhotoButton").textContent = settings.mainButtonText;
  $("printAnotherButton").textContent = settings.uploadButtonText;
  $("takeAnotherButton").textContent = settings.takeAnotherText;

  $("directionsTitle").textContent = settings.directionsTitle;
  $("directionsBody").textContent = settings.directionsBody;
  $("receiptDirectionsTitle").textContent = settings.directionsTitle;
  $("receiptDirectionsBody").textContent = settings.directionsBody;
}

function showStatus(message) {
  statusLine.textContent = message || "";
}

async function initCamera() {
  applyGuestCopy();

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1600 },
        height: { ideal: 1200 }
      },
      audio: false
    });
    camera.srcObject = stream;
  } catch (err) {
    showStatus("Camera permission is needed. Open this page in Safari and allow camera access.");
    console.error(err);
  }
}

async function runCountdownForPose(poseNumber) {
  if (poseIndicator) poseIndicator.textContent = `Pose ${poseNumber} of ${settings.photoCount}`;
  countdown.classList.add("active");

  for (let n = settings.countdownSeconds; n >= 1; n--) {
    countdown.textContent = String(n);
    await wait(760);
  }

  countdown.textContent = "★";
  await wait(260);
  countdown.classList.remove("active");
  countdown.textContent = "";
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function capturePhoto() {
  const videoWidth = camera.videoWidth || 1280;
  const videoHeight = camera.videoHeight || 960;
  const size = Math.min(videoWidth, videoHeight);
  const sx = (videoWidth - size) / 2;
  const sy = (videoHeight - size) / 2;

  const out = document.createElement("canvas");
  out.width = 900;
  out.height = 900;
  const ctx = out.getContext("2d");

  ctx.save();
  ctx.translate(out.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(camera, sx, sy, size, size, 0, 0, out.width, out.height);
  ctx.restore();

  return out;
}

function makePlaceholderCanvas(label) {
  const out = document.createElement("canvas");
  out.width = 900;
  out.height = 900;
  const ctx = out.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);

  ctx.strokeStyle = "#111";
  ctx.lineWidth = 8;
  ctx.setLineDash([28, 18]);
  ctx.strokeRect(70, 70, out.width - 140, out.height - 140);
  ctx.setLineDash([]);

  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 150px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("☺", out.width / 2, out.height / 2 - 12);

  ctx.font = "bold 38px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(label || "PHOTO", out.width / 2, out.height / 2 + 145);

  return out;
}

function makeDitheredPhoto(sourceCanvas, width, height) {
  const working = document.createElement("canvas");
  working.width = width;
  working.height = height;
  const ctx = working.getContext("2d", { willReadFrequently: true });

  drawImageCover(ctx, sourceCanvas, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const gray = new Float32Array(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[p] = contrast(luminance, 1.34);
  }

  if (settings.ditherMode === "threshold") {
    for (let p = 0; p < gray.length; p++) gray[p] = gray[p] < 142 ? 0 : 255;
  } else if (settings.ditherMode === "floyd") {
    floydSteinberg(gray, width, height);
  } else {
    atkinson(gray, width, height);
  }

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = gray[p] < 128 ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return working;
}

function contrast(value, amount) {
  const normalized = (value - 128) * amount + 128;
  return Math.max(0, Math.min(255, normalized));
}

function atkinson(gray, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      const next = old < 128 ? 0 : 255;
      const err = (old - next) / 8;
      gray[i] = next;
      addErr(gray, width, height, x + 1, y, err);
      addErr(gray, width, height, x + 2, y, err);
      addErr(gray, width, height, x - 1, y + 1, err);
      addErr(gray, width, height, x, y + 1, err);
      addErr(gray, width, height, x + 1, y + 1, err);
      addErr(gray, width, height, x, y + 2, err);
    }
  }
}

function floydSteinberg(gray, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      const next = old < 128 ? 0 : 255;
      const err = old - next;
      gray[i] = next;
      addErr(gray, width, height, x + 1, y, err * 7 / 16);
      addErr(gray, width, height, x - 1, y + 1, err * 3 / 16);
      addErr(gray, width, height, x, y + 1, err * 5 / 16);
      addErr(gray, width, height, x + 1, y + 1, err * 1 / 16);
    }
  }
}

function addErr(gray, width, height, x, y, err) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const i = y * width + x;
  gray[i] = Math.max(0, Math.min(255, gray[i] + err));
}

function drawQrFallback(ctx, text, x, y, size) {
  const modules = 29;
  const cell = Math.floor(size / modules);
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.fillRect(x, y, cell * modules, cell * modules);
  ctx.fillStyle = "#000";

  const seed = hashString(text);
  function moduleOn(mx, my) {
    const inFinder = (fx, fy) => mx >= fx && my >= fy && mx < fx + 7 && my < fy + 7;
    if (inFinder(0, 0) || inFinder(modules - 7, 0) || inFinder(0, modules - 7)) {
      const lx = mx % (modules - 7) % 7;
      const ly = my % (modules - 7) % 7;
      return lx === 0 || ly === 0 || lx === 6 || ly === 6 || (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
    }
    const value = Math.sin((mx + 1) * 12.9898 + (my + 1) * 78.233 + seed) * 43758.5453;
    return (value - Math.floor(value)) > 0.58;
  }

  for (let my = 0; my < modules; my++) {
    for (let mx = 0; mx < modules; mx++) {
      if (moduleOn(mx, my)) ctx.fillRect(x + mx * cell, y + my * cell, cell, cell);
    }
  }
  ctx.restore();
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h);
}

async function drawRealQrIfAvailable(ctx, link, x, y, size) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(x, y, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, size, size);
      resolve(true);
    };
    img.onerror = () => resolve(false);
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(link)}`;
    setTimeout(() => resolve(false), 1800);
  });
}


function drawImageCover(ctx, source, x, y, w, h) {
  const sourceW = source.videoWidth || source.naturalWidth || source.width;
  const sourceH = source.videoHeight || source.naturalHeight || source.height;

  if (!sourceW || !sourceH) return;

  const sourceRatio = sourceW / sourceH;
  const targetRatio = w / h;

  let sx = 0;
  let sy = 0;
  let sw = sourceW;
  let sh = sourceH;

  if (sourceRatio > targetRatio) {
    sw = sourceH * targetRatio;
    sx = (sourceW - sw) / 2;
  } else {
    sh = sourceW / targetRatio;
    sy = (sourceH - sh) / 2;
  }

  ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h);
}


function trimCanvas(sourceCanvas, newHeight) {
  const trimmed = document.createElement("canvas");
  trimmed.width = sourceCanvas.width;
  trimmed.height = Math.max(1, Math.ceil(newHeight));
  const ctx = trimmed.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, trimmed.width, trimmed.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  return trimmed;
}

async function buildReceipt(photoCanvases, options = {}) {
  const photos = Array.isArray(photoCanvases) ? photoCanvases : [photoCanvases];
  const link = options.galleryLink || lastGalleryLink || settings.galleryUrl;
  const width = 576;
  const photoW = 458;
  const photoH = settings.photoCount === 1 ? 458 : 305;
  const photoX = Math.round((width - photoW) / 2);
  const qrSize = 180;
  const height = calculateReceiptHeight(photos.length, photoH, qrSize);

  const receipt = document.createElement("canvas");
  receipt.width = width;
  receipt.height = height;
  const ctx = receipt.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.font = "bold 34px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(settings.receiptTitle, width / 2, 54);

  ctx.font = "bold 24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(settings.receiptDate, width / 2, 88);

  ctx.fillRect(38, 116, width - 76, 3);

  let y = 142;
  photos.slice(0, settings.photoCount).forEach((photo, index) => {
    const source = options.cleanPreview
      ? photo
      : makeDitheredPhoto(photo, settings.photoCount === 1 ? 384 : 384, settings.photoCount === 1 ? 384 : 256);

    ctx.save();
    ctx.imageSmoothingEnabled = options.cleanPreview;
    drawImageCover(ctx, source, photoX, y, photoW, photoH);
    ctx.restore();

    ctx.font = "bold 18px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`POSE ${index + 1}`, width / 2, y + photoH + 26);
    y += photoH + 48;
  });

  ctx.textAlign = "center";
  ctx.fillRect(38, y + 6, width - 76, 3);
  y += 58;

  ctx.font = "bold 34px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(settings.receiptPhrase, width / 2, y);

  if (options.placeholderPreview) {
    return trimCanvas(receipt, y + 44);
  }

  y += 52;

  ctx.font = "bold 28px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(settings.qrHeading, width / 2, y);
  y += 25;

  drawQrFallback(ctx, link, (width - qrSize) / 2, y, qrSize);
  await drawRealQrIfAvailable(ctx, link, (width - qrSize) / 2, y, qrSize);

  y += qrSize + 32;

  ctx.fillStyle = "#000";
  ctx.font = "bold 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(settings.qrCaption, width / 2, y);

  y += 34;
  ctx.fillRect(72, y, width - 144, 2);
  y += 34;

  ctx.font = "bold 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(settings.bottomLine1, width / 2, y);

  y += 25;
  ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(settings.bottomLine2 || shortenUrl(link), width / 2, y);

  return receipt;
}

function calculateReceiptHeight(photoCount, photoH, qrSize) {
  const header = 142;
  const photos = photoCount * (photoH + 48);
  const dividerPhraseQr = 58 + 52 + 25 + qrSize + 32 + 34;
  const bottom = 2 + 34 + 25 + 34;
  return header + photos + dividerPhraseQr + bottom;
}

function shortenUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function copyCanvasToCanvas(sourceCanvas, targetCanvas) {
  if (!targetCanvas || !sourceCanvas) return;
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;
  const ctx = targetCanvas.getContext("2d");
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  ctx.drawImage(sourceCanvas, 0, 0);
}

function updateSidePreview(sourceCanvas) {
  copyCanvasToCanvas(sourceCanvas, sidePreviewCanvas);
}

async function buildAdminPreview() {
  const placeholders = [];
  for (let i = 1; i <= settings.photoCount; i++) {
    placeholders.push(makePlaceholderCanvas(`PHOTO ${i}`));
  }
  const receipt = await buildReceipt(placeholders, { cleanPreview: true, galleryLink: settings.galleryUrl, placeholderPreview: true });
  copyCanvasToCanvas(receipt, adminPreviewCanvas);
  updateSidePreview(receipt);
}


async function buildInitialSidePreview() {
  const placeholders = [];
  for (let i = 1; i <= settings.photoCount; i++) {
    placeholders.push(makePlaceholderCanvas(`PHOTO ${i}`));
  }
  const receipt = await buildReceipt(placeholders, { cleanPreview: true, galleryLink: settings.galleryUrl, placeholderPreview: true });
  updateSidePreview(receipt);
}

async function handleTakePhoto() {
  clearAutoReset();
  $("takePhotoButton").disabled = true;
  showStatus("");
  lastPhotoCanvases = [];
  if (poseIndicator) poseIndicator.textContent = "Get ready";

  for (let i = 1; i <= settings.photoCount; i++) {
    await runCountdownForPose(i);
    lastPhotoCanvases.push(capturePhoto());
    if (poseIndicator) poseIndicator.textContent = i < settings.photoCount ? "Next pose" : "Done";
    if (i < settings.photoCount) await wait(700);
  }

  if (poseIndicator) poseIndicator.textContent = "";

  lastGalleryLink = settings.galleryUrl;
  lastReceiptCanvas = await buildReceipt(lastPhotoCanvases, { cleanPreview: false, galleryLink: lastGalleryLink });
  copyCanvasToCanvas(lastReceiptCanvas, receiptPreviewCanvas);
  updateSidePreview(lastReceiptCanvas);

  cameraStage.classList.add("hidden");
  receiptStage.classList.remove("hidden");
  $("takePhotoButton").disabled = false;
  $("takeAnotherButton").disabled = false;

  if (settings.autoUpload) {
    await handleUploadAndPrint();
  } else {
    startAutoReset();
  }
}

async function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function normalizeWorkerUrl(url) {
  return (url || "").trim().replace(/\/$/, "");
}

async function handleUploadAndPrint() {
  if (!lastPhotoCanvases.length) return;

  clearAutoReset();
  $("printAnotherButton").disabled = true;
  showStatus("Preparing receipt…");

  lastReceiptCanvas = await buildReceipt(lastPhotoCanvases, { cleanPreview: false, galleryLink: lastGalleryLink });

  let galleryLink = settings.galleryUrl;
  const endpoint = normalizeWorkerUrl(settings.uploadEndpoint);

  if (endpoint) {
    try {
      showStatus("Uploading receipt strip to the gallery…");

      const form = new FormData();

      for (let i = 0; i < lastPhotoCanvases.length; i++) {
        const photoBlob = await canvasToBlob(lastPhotoCanvases[i], "image/jpeg", 0.9);
        form.append(`photo${i + 1}`, photoBlob, `luna-photo-${Date.now()}-${i + 1}.jpg`);
      }

      const receiptBlob = await canvasToBlob(lastReceiptCanvas, "image/png");
      form.append("receipt", receiptBlob, `luna-receipt-${Date.now()}.png`);
      form.append("galleryUrl", settings.galleryUrl);

      const response = await fetch(`${endpoint}/upload`, {
        method: "POST",
        body: form
      });

      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      const payload = await response.json();

      if (payload && payload.url) {
        galleryLink = payload.url;
        lastGalleryLink = galleryLink;
        lastReceiptCanvas = await buildReceipt(lastPhotoCanvases, { cleanPreview: false, galleryLink });
      }

      showStatus("Uploaded. Scan your receipt to see your photos.");
    } catch (err) {
      console.error(err);
      showStatus("Upload failed. Receipt QR will use the main gallery page.");
    }
  } else {
    showStatus("No upload endpoint set. Receipt QR will use the main gallery page.");
  }

  lastReceiptCanvas = await buildReceipt(lastPhotoCanvases, { cleanPreview: false, galleryLink });
  copyCanvasToCanvas(lastReceiptCanvas, receiptPreviewCanvas);
  updateSidePreview(lastReceiptCanvas);

  if (settings.autoPrint) {
    await printReceipt();
  }

  $("printAnotherButton").disabled = false;
  startAutoReset();
}

async function printReceipt() {
  if (!lastReceiptCanvas) {
    lastReceiptCanvas = await buildReceipt(lastPhotoCanvases, { cleanPreview: false, galleryLink: lastGalleryLink });
  }

  const dataUrl = lastReceiptCanvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (!win) {
    showStatus("Popup blocked. Disable popups to print from browser.");
    return;
  }

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Receipt</title>
        <style>
          body { margin: 0; display: grid; place-items: start center; background: white; }
          img { width: 72mm; image-rendering: pixelated; }
          @media print {
            @page { size: 72mm auto; margin: 0; }
            body { margin: 0; }
            img { width: 72mm; }
          }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" onload="setTimeout(() => window.print(), 250)" />
      </body>
    </html>
  `);
  win.document.close();
  showStatus("Print dialog opened.");
}

function startAutoReset() {
  clearAutoReset();

  if (!settings.autoResetSeconds || settings.autoResetSeconds <= 0) {
    autoResetLine.textContent = "";
    return;
  }

  autoResetRemaining = settings.autoResetSeconds;
  autoResetLine.textContent = `Ready for the next guest in ${autoResetRemaining} seconds.`;

  autoResetInterval = setInterval(() => {
    autoResetRemaining -= 1;
    if (autoResetRemaining > 0) {
      autoResetLine.textContent = `Ready for the next guest in ${autoResetRemaining} seconds.`;
    }
  }, 1000);

  autoResetTimer = setTimeout(() => {
    resetBooth();
  }, settings.autoResetSeconds * 1000);
}

function clearAutoReset() {
  clearTimeout(autoResetTimer);
  clearInterval(autoResetInterval);
  autoResetTimer = null;
  autoResetInterval = null;
  autoResetLine.textContent = "";
}

function resetBooth() {
  clearAutoReset();
  lastPhotoCanvases = [];
  lastReceiptCanvas = null;
  lastGalleryLink = settings.galleryUrl;
  if (poseIndicator) poseIndicator.textContent = "";
  showStatus("");
  receiptStage.classList.add("hidden");
  cameraStage.classList.remove("hidden");
  buildInitialSidePreview();
}

function hydrateAdmin() {
  $("galleryUrlInput").value = settings.galleryUrl;
  $("uploadEndpointInput").value = settings.uploadEndpoint;
  $("screenEyebrowInput").value = settings.screenEyebrow;
  $("screenTitleInput").value = settings.screenTitle;
  $("screenHintInput").value = settings.screenHint;
  $("mainButtonTextInput").value = settings.mainButtonText;
  $("uploadButtonTextInput").value = settings.uploadButtonText;
  $("takeAnotherTextInput").value = settings.takeAnotherText;
  $("directionsTitleInput").value = settings.directionsTitle;
  $("directionsBodyInput").value = settings.directionsBody;
  $("receiptTitleInput").value = settings.receiptTitle;
  $("receiptDateInput").value = settings.receiptDate;
  $("receiptPhraseInput").value = settings.receiptPhrase;
  $("qrHeadingInput").value = settings.qrHeading;
  $("qrCaptionInput").value = settings.qrCaption;
  $("bottomLine1Input").value = settings.bottomLine1;
  $("bottomLine2Input").value = settings.bottomLine2;
  $("ditherModeInput").value = settings.ditherMode;
  $("photoCountInput").value = String(settings.photoCount);
  $("countdownSecondsInput").value = String(settings.countdownSeconds);
  $("autoResetSecondsInput").value = String(settings.autoResetSeconds);
  $("autoUploadInput").checked = settings.autoUpload;
  $("autoPrintInput").checked = settings.autoPrint;
}

function readAdminSettingsFromFields() {
  settings = {
    ...settings,
    galleryUrl: $("galleryUrlInput").value.trim() || defaults.galleryUrl,
    uploadEndpoint: $("uploadEndpointInput").value.trim(),
    screenEyebrow: $("screenEyebrowInput").value.trim() || defaults.screenEyebrow,
    screenTitle: $("screenTitleInput").value.trim() || defaults.screenTitle,
    screenHint: $("screenHintInput").value.trim() || defaults.screenHint,
    mainButtonText: $("mainButtonTextInput").value.trim() || defaults.mainButtonText,
    uploadButtonText: $("uploadButtonTextInput").value.trim() || defaults.uploadButtonText,
    takeAnotherText: $("takeAnotherTextInput").value.trim() || defaults.takeAnotherText,
    directionsTitle: $("directionsTitleInput").value.trim() || defaults.directionsTitle,
    directionsBody: $("directionsBodyInput").value.trim() || defaults.directionsBody,
    receiptTitle: $("receiptTitleInput").value.trim() || defaults.receiptTitle,
    receiptDate: $("receiptDateInput").value.trim() || defaults.receiptDate,
    receiptPhrase: $("receiptPhraseInput").value.trim() || defaults.receiptPhrase,
    qrHeading: $("qrHeadingInput").value.trim() || defaults.qrHeading,
    qrCaption: $("qrCaptionInput").value.trim() || defaults.qrCaption,
    bottomLine1: $("bottomLine1Input").value.trim() || defaults.bottomLine1,
    bottomLine2: $("bottomLine2Input").value.trim() || defaults.bottomLine2,
    ditherMode: $("ditherModeInput").value,
    photoCount: Number($("photoCountInput").value),
    countdownSeconds: Number($("countdownSecondsInput").value),
    autoResetSeconds: Number($("autoResetSecondsInput").value),
    autoUpload: $("autoUploadInput").checked,
    autoPrint: $("autoPrintInput").checked
  };

  applyGuestCopy();
}

async function persistAdmin() {
  readAdminSettingsFromFields();
  saveSettings();
  await buildAdminPreview();
  showStatus("Settings saved.");
}

async function showAdmin() {
  adminMode = true;
  $("adminPanel").classList.remove("hidden");
  hydrateAdmin();
  await buildAdminPreview();
}

function maybeAdminFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("admin") === "1") showAdmin();
}

function handleSecretTap() {
  adminTapCount++;
  clearTimeout(adminTapTimer);
  adminTapTimer = setTimeout(() => adminTapCount = 0, 900);
  if (adminTapCount >= 5) {
    adminTapCount = 0;
    showAdmin();
  }
}

function bindAdminLivePreview() {
  const inputs = $("adminPanel").querySelectorAll("input, select");
  inputs.forEach(input => {
    input.addEventListener("input", async () => {
      if (!adminMode) return;
      readAdminSettingsFromFields();
      await buildAdminPreview();
    });
    input.addEventListener("change", async () => {
      if (!adminMode) return;
      readAdminSettingsFromFields();
      await buildAdminPreview();
    });
  });
}

function bindEvents() {
  $("takePhotoButton").addEventListener("click", handleTakePhoto);
  $("printAnotherButton").addEventListener("click", printReceipt);
  $("takeAnotherButton").addEventListener("click", resetBooth);
  $("saveSettingsButton").addEventListener("click", persistAdmin);
  $("secretAdminTap").addEventListener("click", handleSecretTap);
  $("rebuildPreviewButton").addEventListener("click", async () => {
    readAdminSettingsFromFields();
    await buildAdminPreview();
  });
  bindAdminLivePreview();
}

bindEvents();
maybeAdminFromUrl();
buildInitialSidePreview();
initCamera();
