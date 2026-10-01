const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const hint = document.getElementById("gameHint");
const overlay = document.getElementById("gameOverlay");
const resultKicker = document.getElementById("gameResultKicker");
const resultTitle = document.getElementById("gameResultTitle");
const resultScore = document.getElementById("gameResultScore");
const restart = document.getElementById("restart");

const W = 1000;
const H = 300;
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let running = false;
let score = 0;
let speed = 5;
let last = 0;
let spawn = 0;
let obstacles = [];
let best = Number(localStorage.getItem("bobrBest") || 0);
let bobrImage = new Image();
let bobrReady = false;
bobrImage.src = "images/mascot.webp";
bobrImage.onload = () => { bobrReady = true; };

bestEl.textContent = String(best).padStart(4, "0");

function resize() {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.width * H / W * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
resize();
window.addEventListener("resize", resize);

const bob = { x: 88, y: 206, w: 74, h: 88, vy: 0, onGround: true, runPhase: 0 };

function reset() {
  score = 0;
  speed = 5;
  spawn = 0;
  obstacles = [];
  bob.y = 206;
  bob.vy = 0;
  bob.onGround = true;
  bob.runPhase = 0;
  running = true;
  hint.style.display = "none";
  overlay.hidden = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

function jump() {
  if (!running) {
    reset();
    return;
  }
  if (bob.onGround) {
    bob.vy = -12.5;
    bob.onGround = false;
  }
}

function drawSkyAndBalcony() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#fffaf2");
  g.addColorStop(1, "#f2dfbd");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Wall and window/door of the destination balcony.
  ctx.fillStyle = "#f1eee8";
  ctx.fillRect(790, 46, 210, 158);
  ctx.strokeStyle = "#d3cbc0";
  ctx.lineWidth = 4;
  ctx.strokeRect(790, 46, 210, 158);

  ctx.fillStyle = "#d9e6eb";
  ctx.fillRect(835, 67, 112, 103);
  ctx.strokeStyle = "#7d8185";
  ctx.lineWidth = 5;
  ctx.strokeRect(835, 67, 112, 103);
  ctx.beginPath();
  ctx.moveTo(891, 69); ctx.lineTo(891, 168);
  ctx.moveTo(837, 118); ctx.lineTo(945, 118);
  ctx.stroke();

  // Red balcony railing: the finish point.
  ctx.fillStyle = "#c91627";
  ctx.fillRect(806, 170, 178, 7);
  ctx.fillRect(806, 176, 6, 31);
  ctx.fillRect(866, 176, 6, 31);
  ctx.fillRect(926, 176, 6, 31);
  ctx.fillRect(978, 176, 6, 31);
  for (let x = 818; x <= 960; x += 24) ctx.fillRect(x, 177, 3, 30);
  ctx.font = "900 12px Arial";
  ctx.textAlign = "center";
  ctx.fillStyle = "#7c1b25";
  ctx.fillText("БАЛКОН", 892, 37);

  // Ground / wooden boards.
  ctx.fillStyle = "#7f5637";
  ctx.fillRect(0, 228, W, 10);
  ctx.fillStyle = "#b98452";
  ctx.fillRect(0, 238, W, 8);
  ctx.strokeStyle = "rgba(69,40,23,.28)";
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 46) {
    ctx.beginPath();
    ctx.moveTo(x, 247); ctx.lineTo(x + 28, 247);
    ctx.stroke();
  }
}

function drawBob() {
  const drawW = 78;
  const drawH = 116;
  const baseY = bob.y + bob.h - 4;
  const bobY = baseY - drawH + Math.sin(bob.runPhase) * 2;
  if (!bobrReady) return;
  ctx.save();
  ctx.globalAlpha = 0.98;
  ctx.drawImage(bobrImage, bob.x - 2, bobY, drawW, drawH);
  ctx.restore();
}

function drawObstacle(o) {
  ctx.save();
  ctx.translate(o.x, 228);
  ctx.fillStyle = "#70431f";
  ctx.fillRect(0, -o.h, o.w, o.h);
  ctx.fillStyle = "#b9814c";
  ctx.fillRect(4, -o.h + 6, o.w - 8, 7);
  ctx.strokeStyle = "#4d2b18";
  ctx.lineWidth = 3;
  ctx.strokeRect(0, -o.h, o.w, o.h);
  ctx.restore();
}

function updateBest() {
  const s = Math.floor(score);
  if (s > best) {
    best = s;
    localStorage.setItem("bobrBest", String(best));
    bestEl.textContent = String(best).padStart(4, "0");
  }
}

function finishGame() {
  running = false;
  updateBest();
  resultKicker.textContent = "ФИНИШ";
  resultTitle.textContent = "Бобёр добрался до балкона!";
  resultScore.textContent = `Счёт: ${String(Math.floor(score)).padStart(4, "0")}`;
  overlay.hidden = false;
}

function gameOver() {
  running = false;
  updateBest();
  resultKicker.textContent = "СТОЛКНОВЕНИЕ";
  resultTitle.textContent = "Бобёр устал";
  resultScore.textContent = `Счёт: ${String(Math.floor(score)).padStart(4, "0")}`;
  overlay.hidden = false;
}

function loop(t) {
  if (!running) return;
  const dt = Math.min((t - last) / 16.67, 2);
  last = t;
  ctx.clearRect(0, 0, W, H);
  drawSkyAndBalcony();

  spawn -= dt;
  if (spawn <= 0) {
    const h = 28 + Math.random() * 46;
    obstacles.push({ x: W + 10, w: 18 + Math.random() * 13, h });
    spawn = 58 + Math.random() * 68 - speed * 2.5;
  }

  speed += 0.0017 * dt;
  score += 0.16 * dt;
  bob.runPhase += 0.28 * dt;
  scoreEl.textContent = String(Math.floor(score)).padStart(4, "0");

  for (const o of obstacles) o.x -= speed * dt;
  obstacles = obstacles.filter(o => o.x > -60);

  bob.vy += 0.64 * dt;
  bob.y += bob.vy * dt;
  if (bob.y >= 206) {
    bob.y = 206;
    bob.vy = 0;
    bob.onGround = true;
  }

  drawBob();
  for (const o of obstacles) {
    drawObstacle(o);
    const bobBottom = bob.y + bob.h - 6;
    const bobLeft = bob.x + 12;
    const bobRight = bob.x + bob.w - 12;
    if (bobRight > o.x && bobLeft < o.x + o.w && bobBottom > 228 - o.h) {
      gameOver();
      return;
    }
  }

  // Reach the balcony after a clear run.
  if (score >= 120) {
    finishGame();
    return;
  }

  requestAnimationFrame(loop);
}

canvas.addEventListener("pointerdown", event => {
  event.preventDefault();
  jump();
});
window.addEventListener("keydown", event => {
  if (event.code === "Space") {
    event.preventDefault();
    jump();
  }
});
restart.addEventListener("click", reset);

// Robust portfolio lightbox: every picture is also a real link to its file.
const photos = [...document.querySelectorAll(".photo")];
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lb-img");
let current = 0;

function openPhoto(index) {
  current = index;
  const photo = photos[index];
  const img = photo.querySelector("img");
  lightboxImg.src = photo.dataset.full || photo.href;
  lightboxImg.alt = img ? img.alt : "Фотография работы 100balkonoff";
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closePhoto() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function nextPhoto(step) {
  current = (current + step + photos.length) % photos.length;
  openPhoto(current);
}

photos.forEach((photo, index) => {
  photo.addEventListener("click", event => {
    event.preventDefault();
    openPhoto(index);
  });
  photo.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPhoto(index);
    }
  });
});

document.querySelector(".lb-close").addEventListener("click", closePhoto);
document.querySelector(".lb-prev").addEventListener("click", () => nextPhoto(-1));
document.querySelector(".lb-next").addEventListener("click", () => nextPhoto(1));
lightbox.addEventListener("click", event => {
  if (event.target === lightbox) closePhoto();
});
window.addEventListener("keydown", event => {
  if (!lightbox.classList.contains("open")) return;
  if (event.key === "Escape") closePhoto();
  if (event.key === "ArrowLeft") nextPhoto(-1);
  if (event.key === "ArrowRight") nextPhoto(1);
});
