(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const hint = document.getElementById('gameHint');
  const overlay = document.getElementById('gameOverlay');
  const resultKicker = document.getElementById('gameResultKicker');
  const resultTitle = document.getElementById('gameResultTitle');
  const resultScore = document.getElementById('gameResultScore');
  const restart = document.getElementById('restart');
  const jumpsEl = document.getElementById('jumps');

  // Logical game coordinates; CSS size stays responsive and the drawing scales to fit it.
  const W = 1000;
  const H = 340;
  const GROUND = 286;
  const GOAL_DISTANCE = 4800;
  const MAX_JUMPS = 2;
  const GRAVITY = 1900;
  const FIRST_JUMP_POWER = 760;
  const SECOND_JUMP_POWER = 690;

  let cssWidth = W;
  let cssHeight = H;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let running = false;
  let score = 0;
  let distance = 0;
  let speed = 285;
  let last = 0;
  let nextSpawnDistance = 650;
  let obstacles = [];
  let best = Number(localStorage.getItem('bobrBest') || 0);
  let animationId = 0;
  let startedOnce = false;

  bestEl.textContent = String(best).padStart(4, '0');
  if (jumpsEl) jumpsEl.textContent = '2/2';

  const bob = {
    x: 105,
    feetY: GROUND,
    w: 104,
    h: 132,
    vy: 0,
    onGround: true,
    jumpCount: 0,
    runPhase: 0,
    blink: 0
  };

  function getCanvasSize() {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(320, rect.width || W);
    cssHeight = Math.max(220, Math.min(340, cssWidth * 0.34));
    canvas.style.height = `${cssHeight}px`;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // Keep the 1000×340 game world proportional instead of stretching it on narrow screens.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const scale = Math.min((cssWidth * dpr) / W, (cssHeight * dpr) / H);
    const offsetX = ((cssWidth * dpr) - W * scale) / 2;
    const offsetY = ((cssHeight * dpr) - H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  }

  getCanvasSize();
  window.addEventListener('resize', getCanvasSize);

  function reset(autoJump = false) {
    score = 0;
    distance = 0;
    speed = 285;
    nextSpawnDistance = 650;
    obstacles = [];
    bob.feetY = GROUND;
    bob.vy = 0;
    bob.onGround = true;
    bob.jumpCount = 0;
    bob.runPhase = 0;
    bob.blink = 0;
    running = true;
    startedOnce = true;
    hint.hidden = true;
    overlay.hidden = true;
    scoreEl.textContent = '0000';
    updateJumpHud();
    last = performance.now();
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(loop);
    if (autoJump) {
      performJump();
    }
  }

  function performJump() {
    if (bob.onGround) {
      bob.vy = -FIRST_JUMP_POWER;
      bob.onGround = false;
      bob.jumpCount = 1;
      updateJumpHud();
      return true;
    }
    if (bob.jumpCount < MAX_JUMPS) {
      bob.vy = -SECOND_JUMP_POWER;
      bob.jumpCount = MAX_JUMPS;
      updateJumpHud();
      return true;
    }
    return false;
  }

  function jump() {
    if (!running) {
      reset(true);
      return;
    }
    performJump();
  }

  function updateJumpHud() {
    if (!jumpsEl) return;
    const available = Math.max(0, MAX_JUMPS - bob.jumpCount);
    jumpsEl.textContent = `${available}/${MAX_JUMPS}`;
  }

  function drawBackground(t) {
    // Soft sky.
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#fffdf9');
    sky.addColorStop(0.62, '#f7ead8');
    sky.addColorStop(1, '#efe0c4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Light clouds.
    ctx.globalAlpha = 0.62;
    drawCloud(170, 58, 1.1);
    drawCloud(515, 92, 0.78);
    drawCloud(730, 42, 0.9);
    ctx.globalAlpha = 1;

    // Far line of trees.
    for (let x = -20; x < W; x += 75) {
      const wobble = Math.sin(x * 0.08) * 8;
      ctx.fillStyle = '#d2e2d1';
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x + 20, 196 + wobble);
      ctx.lineTo(x + 42, GROUND);
      ctx.closePath();
      ctx.fill();
    }

    // Ground.
    ctx.fillStyle = '#8a5b35';
    ctx.fillRect(0, GROUND, W, 54);
    ctx.fillStyle = '#b97f4e';
    ctx.fillRect(0, GROUND, W, 9);
    ctx.strokeStyle = 'rgba(65,35,18,.22)';
    ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 54) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND + 18);
      ctx.lineTo(x + 34, GROUND + 18);
      ctx.stroke();
    }

    // Destination building / balcony.
    drawBalcony(t);
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 18 * s, 0, Math.PI * 2);
    ctx.arc(x + 23 * s, y - 7 * s, 25 * s, 0, Math.PI * 2);
    ctx.arc(x + 52 * s, y, 19 * s, 0, Math.PI * 2);
    ctx.roundRect(x - 10 * s, y, 70 * s, 16 * s, 8 * s);
    ctx.fill();
  }

  function drawBalcony(t) {
    const wallX = 815;
    const wallY = 76;
    const wallW = 185;
    const wallH = 185;
    ctx.fillStyle = '#f8f7f2';
    ctx.fillRect(wallX, wallY, wallW, wallH);
    ctx.strokeStyle = '#d9d4ce';
    ctx.lineWidth = 4;
    ctx.strokeRect(wallX, wallY, wallW, wallH);

    ctx.fillStyle = '#cce4ef';
    ctx.fillRect(wallX + 35, wallY + 26, 104, 94);
    ctx.strokeStyle = '#80868a';
    ctx.lineWidth = 4;
    ctx.strokeRect(wallX + 35, wallY + 26, 104, 94);
    ctx.beginPath();
    ctx.moveTo(wallX + 87, wallY + 28);
    ctx.lineTo(wallX + 87, wallY + 118);
    ctx.moveTo(wallX + 37, wallY + 72);
    ctx.lineTo(wallX + 137, wallY + 72);
    ctx.stroke();

    // Red balcony rail and awning.
    ctx.fillStyle = '#c91627';
    ctx.fillRect(wallX + 12, 202, 160, 8);
    ctx.fillRect(wallX + 12, 208, 7, 42);
    ctx.fillRect(wallX + 165, 208, 7, 42);
    for (let x = wallX + 30; x <= wallX + 148; x += 24) {
      ctx.fillRect(x, 208, 4, 42);
    }
    ctx.fillRect(wallX + 6, 63, 172, 12);
    ctx.fillStyle = '#920f1b';
    ctx.font = '900 15px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ФИНИШ • БАЛКОН', wallX + 92, 47);

    // Slight waving flag.
    const sway = Math.sin(t * 0.004) * 4;
    ctx.strokeStyle = '#c91627';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(968, 95);
    ctx.lineTo(968, 203);
    ctx.stroke();
    ctx.fillStyle = '#c91627';
    ctx.beginPath();
    ctx.moveTo(969, 99);
    ctx.lineTo(995, 108 + sway);
    ctx.lineTo(969, 119);
    ctx.closePath();
    ctx.fill();
  }

  function drawBeaver() {
    const phase = bob.runPhase;
    const runningPose = bob.onGround ? Math.sin(phase) : 0;
    const bounce = bob.onGround ? Math.abs(Math.cos(phase * 2)) * 1.8 : 0;
    const base = bob.feetY + bounce;
    const bx = bob.x;
    const bodyY = base - 70;

    ctx.save();
    ctx.translate(bx, bodyY);

    // Tail behind the body.
    ctx.save();
    ctx.rotate(-0.18 + Math.sin(phase) * 0.04);
    ctx.fillStyle = '#8e5a37';
    ctx.strokeStyle = '#5a3926';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-16, 34, 28, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(61,40,27,.38)';
    ctx.lineWidth = 2;
    for (let i = -22; i <= 22; i += 11) {
      ctx.beginPath();
      ctx.moveTo(i, 7);
      ctx.lineTo(i + 5, 56);
      ctx.stroke();
    }
    ctx.restore();

    // Legs - visibly animated when running.
    const leg1 = runningPose * 0.72;
    const leg2 = -runningPose * 0.72;
    drawLeg(16, 55, leg1, '#7e4e2f');
    drawLeg(56, 55, leg2, '#7e4e2f');

    // Body and red overalls.
    ctx.fillStyle = '#98613b';
    ctx.strokeStyle = '#5a3926';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 12, 78, 72, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#c91627';
    ctx.beginPath();
    ctx.roundRect(17, 28, 52, 48, 13);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 8px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('100balkonoff', 43, 52);

    // Strap buttons.
    ctx.fillStyle = '#f2b5bc';
    ctx.beginPath();
    ctx.arc(20, 30, 4, 0, Math.PI * 2);
    ctx.arc(63, 30, 4, 0, Math.PI * 2);
    ctx.fill();

    // Arms - one with the hammer, both swing on the run.
    const armLeft = 0.34 * runningPose;
    const armRight = -0.28 * runningPose;
    drawArm(8, 34, armLeft, false);
    drawHammerArm(76, 36, armRight);

    // Head.
    ctx.fillStyle = '#a36b43';
    ctx.strokeStyle = '#5a3926';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(45, -4, 43, 35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Ears.
    drawEar(17, -29, -0.08);
    drawEar(73, -29, 0.08);

    // Muzzle + teeth.
    ctx.fillStyle = '#d28d5b';
    ctx.beginPath();
    ctx.ellipse(45, 2, 27, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d211d';
    ctx.beginPath();
    ctx.ellipse(45, -3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(36, 7, 8, 12);
    ctx.fillRect(46, 7, 8, 12);

    // Eyes, with a blink every few seconds.
    const blinking = bob.blink > 0;
    drawEye(30, -10, blinking);
    drawEye(60, -10, blinking);

    // Red cap.
    ctx.fillStyle = '#c91627';
    ctx.strokeStyle = '#920f1b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(45, -22, 27, Math.PI, Math.PI * 2);
    ctx.lineTo(74, -22);
    ctx.quadraticCurveTo(61, -10, 45, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = '900 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('100', 45, -28);

    ctx.restore();
  }

  function drawLeg(x, y, angle, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#5a3926';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-7, 0, 15, 31, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#5b3724';
    ctx.beginPath();
    ctx.ellipse(2, 31, 13, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawArm(x, y, angle, flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((flip ? -1 : 1) * angle);
    ctx.fillStyle = '#9a623c';
    ctx.strokeStyle = '#5a3926';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-6, -1, 14, 39, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8a5635';
    ctx.beginPath();
    ctx.arc(1, 40, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHammerArm(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#9a623c';
    ctx.strokeStyle = '#5a3926';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-5, 0, 14, 40, 7);
    ctx.fill();
    ctx.stroke();
    ctx.translate(4, 38);
    ctx.rotate(-0.35);
    ctx.fillStyle = '#b9783b';
    ctx.fillRect(-3, -26, 6, 36);
    ctx.fillStyle = '#777c82';
    ctx.strokeStyle = '#50545a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-14, -33, 28, 10, 4);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawEar(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#8c5938';
    ctx.strokeStyle = '#5a3926';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c28a64';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEye(x, y, blinking) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#fff';
    if (blinking) {
      ctx.strokeStyle = '#4b3021';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(7, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#231814';
      ctx.beginPath();
      ctx.arc(1, 1, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawObstacle(o) {
    const y = GROUND;
    ctx.save();
    ctx.translate(o.x, y);

    // Shadow.
    ctx.fillStyle = 'rgba(51,25,12,.16)';
    ctx.beginPath();
    ctx.ellipse(o.w * 0.5, 4, o.w * 0.55, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Log with rounded ends.
    const r = o.w / 2;
    ctx.fillStyle = '#7b4a29';
    ctx.strokeStyle = '#4d2c1b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(0, -o.h, o.w, o.h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#b98250';
    ctx.beginPath();
    ctx.ellipse(r, -o.h, r - 4, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6d3f24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(r, -o.h, r - 7, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Bark lines.
    ctx.strokeStyle = 'rgba(49,27,16,.42)';
    ctx.lineWidth = 2;
    for (let i = 12; i < o.w - 4; i += 14) {
      ctx.beginPath();
      ctx.moveTo(i, -o.h + 11);
      ctx.lineTo(i - 2, -8);
      ctx.stroke();
    }
    ctx.restore();
  }

  function spawnObstacle() {
    // Obstacles have two sizes: normal and large. Both are designed around the two-jump mechanic.
    const large = Math.random() < 0.28;
    const h = large ? 56 + Math.random() * 17 : 36 + Math.random() * 18;
    const w = large ? 54 + Math.random() * 18 : 38 + Math.random() * 16;
    obstacles.push({
      x: W + 36,
      w,
      h,
      counted: false
    });
  }

  function updateBest() {
    const s = Math.floor(score);
    if (s > best) {
      best = s;
      localStorage.setItem('bobrBest', String(best));
      bestEl.textContent = String(best).padStart(4, '0');
    }
  }

  function showResult(kicker, title) {
    running = false;
    updateBest();
    resultKicker.textContent = kicker;
    resultTitle.textContent = title;
    resultScore.textContent = `Счёт: ${String(Math.floor(score)).padStart(4, '0')}`;
    overlay.hidden = false;
  }

  function finishGame() {
    showResult('ФИНИШ • 100BALKONOFF', 'Бобёр добрался до балкона!');
  }

  function gameOver() {
    showResult('ОЙ!', 'Бобёр устал');
  }

  function collides(o) {
    // Tighter hitboxes make the game fair: only the lower body/feet can hit a log.
    const left = bob.x + 30;
    const right = bob.x + bob.w - 24;
    const top = bob.feetY - bob.h + 30;
    const bottom = bob.feetY - 8;
    const obstacleLeft = o.x + 4;
    const obstacleRight = o.x + o.w - 4;
    const obstacleTop = GROUND - o.h + 3;
    const obstacleBottom = GROUND;
    return right > obstacleLeft && left < obstacleRight && bottom > obstacleTop && top < obstacleBottom;
  }

  function loop(t) {
    if (!running) return;
    const dt = Math.min((t - last) / 1000, 0.032);
    last = t;

    ctx.clearRect(0, 0, W, H);
    drawBackground(t);

    // Speed ramps gently, leaving enough time to react to every obstacle.
    speed = Math.min(445, speed + 6.2 * dt);
    distance += speed * dt;
    score += speed * dt * 0.024;

    // Spawn by distance, not by frames: this keeps the spacing stable even when the screen lags.
    if (distance >= nextSpawnDistance && distance < GOAL_DISTANCE - 520) {
      spawnObstacle();
      const gap = 500 + Math.random() * 250;
      nextSpawnDistance = distance + gap;
    }

    for (const o of obstacles) {
      o.x -= speed * dt;
      if (!o.counted && o.x + o.w < bob.x) {
        o.counted = true;
      }
    }
    obstacles = obstacles.filter(o => o.x > -80);

    // Physics.
    bob.vy += GRAVITY * dt;
    bob.feetY += bob.vy * dt;
    if (bob.feetY >= GROUND) {
      bob.feetY = GROUND;
      bob.vy = 0;
      bob.onGround = true;
      bob.jumpCount = 0;
      updateJumpHud();
    } else {
      bob.onGround = false;
    }

    bob.runPhase += dt * (speed / 24);
    bob.blink += dt;
    if (bob.blink > 4.5) bob.blink = bob.blink > 4.68 ? 0 : 4.52;

    scoreEl.textContent = String(Math.floor(score)).padStart(4, '0');

    for (const o of obstacles) {
      drawObstacle(o);
      if (collides(o)) {
        gameOver();
        return;
      }
    }

    drawBeaver();

    // Small running dust puffs make movement feel lively without hiding the beaver.
    if (bob.onGround) {
      const dust = (Math.sin(bob.runPhase * 1.8) + 1) * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath();
      ctx.arc(bob.x - 10 - dust * 5, GROUND - 4, 4 + dust * 2, 0, Math.PI * 2);
      ctx.arc(bob.x - 22 - dust * 7, GROUND - 2, 2.5 + dust, 0, Math.PI * 2);
      ctx.fill();
    }

    // Progress to the balcony.
    const progress = Math.min(1, distance / GOAL_DISTANCE);
    const barX = 24;
    const barY = 16;
    const barW = 250;
    ctx.fillStyle = 'rgba(255,255,255,.86)';
    ctx.roundRect(barX, barY, barW, 13, 7);
    ctx.fill();
    ctx.fillStyle = '#c91627';
    ctx.roundRect(barX + 2, barY + 2, (barW - 4) * progress, 9, 5);
    ctx.fill();
    ctx.fillStyle = '#6b4a35';
    ctx.font = '800 11px Inter, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('ДО БАЛКОНА', barX, 44);

    if (distance >= GOAL_DISTANCE) {
      finishGame();
      return;
    }

    animationId = requestAnimationFrame(loop);
  }

  canvas.addEventListener('pointerdown', event => {
    event.preventDefault();
    jump();
  }, { passive: false });

  window.addEventListener('keydown', event => {
    if (!event.repeat && (event.code === 'Space' || event.code === 'ArrowUp')) {
      event.preventDefault();
      jump();
    }
  });

  restart.addEventListener('click', reset);

  // Portfolio: keep standard links working, with the lightbox as a secondary keyboard interaction.
  const photos = [...document.querySelectorAll('.photo')];
  photos.forEach(photo => {
    photo.setAttribute('target', '_blank');
    photo.setAttribute('rel', 'noopener');
  });

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lb-img');
  let current = 0;

  function openPhoto(index) {
    const photo = photos[index];
    const img = photo?.querySelector('img');
    if (!photo || !img || !lightbox || !lightboxImg) return;
    current = index;
    lightboxImg.src = photo.href;
    lightboxImg.alt = img.alt || 'Фотография работы 100balkonoff';
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closePhoto() {
    if (!lightbox) return;
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function nextPhoto(step) {
    if (!photos.length) return;
    current = (current + step + photos.length) % photos.length;
    openPhoto(current);
  }

  photos.forEach((photo, index) => {
    photo.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPhoto(index);
      }
    });
  });

  const closeBtn = document.querySelector('.lb-close');
  const prevBtn = document.querySelector('.lb-prev');
  const nextBtn = document.querySelector('.lb-next');
  if (closeBtn) closeBtn.addEventListener('click', closePhoto);
  if (prevBtn) prevBtn.addEventListener('click', () => nextPhoto(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => nextPhoto(1));
  if (lightbox) {
    lightbox.addEventListener('click', event => {
      if (event.target === lightbox) closePhoto();
    });
  }
  window.addEventListener('keydown', event => {
    if (!lightbox || !lightbox.classList.contains('open')) return;
    if (event.key === 'Escape') closePhoto();
    if (event.key === 'ArrowLeft') nextPhoto(-1);
    if (event.key === 'ArrowRight') nextPhoto(1);
  });

  // Draw a static frame so the game never appears broken before the first input.
  ctx.clearRect(0, 0, W, H);
  drawBackground(0);
  drawBeaver();
})();
