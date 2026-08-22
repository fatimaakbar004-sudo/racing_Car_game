/* ==========================================================================
   ULTIMATE CAR RACING — game logic
   Lane-based dodging game: steer with arrow keys, burn nitro, collect
   coins, and survive escalating levels across three track themes.
   ========================================================================== */

const gameArea = document.getElementById("gameArea");
const player = document.getElementById("player");
const roadLines = document.getElementById("roadLines");

const scoreEl = document.getElementById("score");
const coinsEl = document.getElementById("coins");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");

const nitroFill = document.getElementById("nitroFill");

const startScreen = document.getElementById("startScreen");
const pauseScreen = document.getElementById("pauseScreen");
const gameOverScreen = document.getElementById("gameOverScreen");

const levelScreen = document.getElementById("levelScreen");

const levelText = document.getElementById("levelText");

const finalScore = document.getElementById("finalScore");

const finalCoins = document.getElementById("finalCoins");

const highScoreEl = document.getElementById("highScore");

const collisionEffect = document.getElementById("collisionEffect");

const carCanvas = document.getElementById("carCanvas");

let gameRunning = false;
let gamePaused = false;

let score = 0;
let coins = 0;
let lives = 3;

let level = 1;

let nitro = 100;
let nitroActive = false;

let playerX = 0;

let speed = 5;
let roadPosition = 0;

let enemies = [];
let coinObjects = [];

let enemyTimer = 0;
let coinTimer = 0;

let combo = 0;
let lastComboTime = 0;
const COMBO_WINDOW = 1600; // ms — collect another coin within this window to build combo

let shieldActive = false;
let shieldTimer = 0;
let shieldObjects = [];
let shieldSpawnTimer = 0;

let nitroParticleTimer = 0;
let comboPopupTimeout = null;

let lastTime = 0;

let animationId;

let highScore = Number(localStorage.getItem("carRacingHighScore")) || 0;

highScoreEl.textContent = highScore;

/* Car Images */

const carImages = [
  "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=300&q=80",

  "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=300&q=80",

  "https://images.unsplash.com/photo-1542282088-72c9c27ed0cd?auto=format&fit=crop&w=300&q=80",

  "https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=300&q=80",
];

/* ==========================================================================
   AUDIO ENGINE
   Everything here is synthesized live with the Web Audio API — an
   original arcade/synthwave bassline loop plus a handful of SFX. No
   external audio file is loaded, so there's nothing to go stale, need
   licensing, or fail to fetch.
   ========================================================================== */

const AudioEngine = (() => {
  let ctx = null;
  let masterGain, musicGain, sfxGain;

  let musicPlaying = false;
  let schedulerTimer = null;
  let nextNoteTime = 0;
  let currentStep = 0;

  const tempo = 128; // BPM
  const stepDuration = 60 / tempo / 2; // eighth notes
  const rootFreq = 82.41; // E2

  // Two-bar bassline (semitone offsets from root) — simple minor riff
  const bassPattern = [0, 0, 3, 3, 5, 5, 3, 3, 0, 0, 7, 7, 5, 5, 3, 3];

  function init() {
    if (ctx) return;

    ctx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.3;
    musicGain.connect(masterGain);

    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.55;
    sfxGain.connect(masterGain);
  }

  function noteFreq(semitoneOffset) {
    return rootFreq * Math.pow(2, semitoneOffset / 12);
  }

  function scheduleBassNote(time, semitone) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(noteFreq(semitone), time);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(900, time);

    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.7, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + stepDuration * 0.9);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);

    osc.start(time);
    osc.stop(time + stepDuration);
  }

  function scheduleHat(time) {
    const bufferSize = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);

    noise.start(time);
    noise.stop(time + 0.05);
  }

  function scheduler() {
    while (nextNoteTime < ctx.currentTime + 0.1) {
      const semitone = bassPattern[currentStep % bassPattern.length];

      scheduleBassNote(nextNoteTime, semitone);

      if (currentStep % 2 === 1) {
        scheduleHat(nextNoteTime);
      }

      nextNoteTime += stepDuration;
      currentStep++;
    }
  }

  function startMusic() {
    init();

    if (ctx.state === "suspended") {
      ctx.resume();
    }

    if (musicPlaying) return;

    musicPlaying = true;
    currentStep = 0;
    nextNoteTime = ctx.currentTime + 0.05;

    scheduler();
    schedulerTimer = setInterval(scheduler, 25);
  }

  function stopMusic() {
    musicPlaying = false;

    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  }

  function toggleMusic() {
    if (musicPlaying) {
      stopMusic();
    } else {
      startMusic();
    }

    return musicPlaying;
  }

  function playCoin(comboStep = 0) {
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const baseFreq = 880 * Math.pow(2, Math.min(comboStep, 8) / 12);

    osc.type = "square";
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, t + 0.1);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  function playCrash() {
    if (!ctx) return;

    const t = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.3);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 700;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);

    noise.start(t);
    noise.stop(t + 0.3);
  }

  function playNitro() {
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.3);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(0.32, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);

    osc.connect(gain);
    gain.connect(sfxGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  function playLevelUp() {
    if (!ctx) return;

    const t = ctx.currentTime;

    [0, 4, 7, 12].forEach((semitone, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "square";
      osc.frequency.setValueAtTime(440 * Math.pow(2, semitone / 12), t + i * 0.08);

      gain.gain.setValueAtTime(0.001, t + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.22, t + i * 0.08 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.15);

      osc.connect(gain);
      gain.connect(sfxGain);

      osc.start(t + i * 0.08);
      osc.stop(t + i * 0.08 + 0.16);
    });
  }

  return {
    startMusic,
    stopMusic,
    toggleMusic,
    playCoin,
    playCrash,
    playNitro,
    playLevelUp,
    isPlaying: () => musicPlaying,
  };
})();

/* ==========================================================================
   3D CAR LAYER (Three.js)
   Renders the player and enemy cars as real low-poly 3D models on a
   transparent canvas laid over the road. Screen position stays driven
   by the existing DOM hitboxes (#player / .enemy), so collision logic
   is untouched — this module only handles what gets drawn.
   If Three.js or WebGL isn't available, init() throws, mode3D stays
   false, and the original flat car images (already in the DOM) are
   simply left visible via CSS.
   ========================================================================== */

const Car3D = (() => {
  const CAMERA_DIST = 900;
  const BASE_TILT = -0.55; // gives every car a slight raised-hood 3D look

  let renderer, scene, camera;
  let playerMesh = null;
  let shieldMesh = null;
  const enemyMeshes = new Map();

  function createCarMesh(bodyColor, isPlayer) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.45,
      roughness: 0.35,
    });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x0b0b14,
      metalness: 0.2,
      roughness: 0.5,
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9,
    });
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: isPlayer ? 1.3 : 0.4,
    });
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff2f92,
      emissive: 0xff2f92,
      emissiveIntensity: 0.85,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(46, 96, 22), bodyMat);
    body.position.z = 14;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(32, 46, 18), cabinMat);
    cabin.position.set(0, -6, 30);
    group.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(10, 10, 8, 12);
    [
      [-24, 30, 8],
      [24, 30, 8],
      [-24, -30, 8],
      [24, -30, 8],
    ].forEach(([x, y, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      group.add(wheel);
    });

    const lightGeo = new THREE.SphereGeometry(4, 8, 8);
    [
      [-14, 46, 16],
      [14, 46, 16],
    ].forEach(([x, y, z]) => {
      const l = new THREE.Mesh(lightGeo, headlightMat);
      l.position.set(x, y, z);
      group.add(l);
    });
    [
      [-14, -46, 16],
      [14, -46, 16],
    ].forEach(([x, y, z]) => {
      const l = new THREE.Mesh(lightGeo, taillightMat);
      l.position.set(x, y, z);
      group.add(l);
    });

    group.rotation.x = BASE_TILT;

    return group;
  }

  function init(canvas, width, height) {
    if (typeof THREE === "undefined") {
      throw new Error("Three.js not available");
    }

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);

    scene = new THREE.Scene();

    const fovRad = 2 * Math.atan(height / (2 * CAMERA_DIST));
    camera = new THREE.PerspectiveCamera(
      THREE.MathUtils.radToDeg(fovRad),
      width / height,
      10,
      3000
    );
    camera.position.set(width / 2, -height / 2, CAMERA_DIST);
    camera.lookAt(width / 2, -height / 2, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(-150, 250, 400);
    scene.add(sun);

    const rim = new THREE.PointLight(0x8b5cf6, 0.9, 1400);
    rim.position.set(width / 2, -height * 0.2, 250);
    scene.add(rim);

    playerMesh = createCarMesh(0x00e5ff, true);
    scene.add(playerMesh);

    const shieldGeo = new THREE.TorusGeometry(72, 6, 8, 24);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x00e5ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.55,
    });
    shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.visible = false;
    playerMesh.add(shieldMesh);
  }

  function setShield(active) {
    if (shieldMesh) shieldMesh.visible = active;
  }

  function resize(width, height) {
    if (!renderer) return;

    renderer.setSize(width, height, false);

    const fovRad = 2 * Math.atan(height / (2 * CAMERA_DIST));
    camera.fov = THREE.MathUtils.radToDeg(fovRad);
    camera.aspect = width / height;
    camera.position.set(width / 2, -height / 2, CAMERA_DIST);
    camera.lookAt(width / 2, -height / 2, 0);
    camera.updateProjectionMatrix();
  }

  function elementCenter(el) {
    return {
      x: el.offsetLeft + el.offsetWidth / 2,
      y: el.offsetTop + el.offsetHeight / 2,
    };
  }

  function syncPlayer(el, bank) {
    if (!playerMesh) return;

    const c = elementCenter(el);
    playerMesh.position.set(c.x, -c.y, 0);
    playerMesh.rotation.z = bank;
  }

  const enemyPalette = [0xff5252, 0xffa726, 0x66bb6a, 0xd8d8d8];
  let paletteIndex = 0;

  function addEnemy(enemyObj) {
    if (!scene) return;

    const color = enemyPalette[paletteIndex % enemyPalette.length];
    paletteIndex++;

    const mesh = createCarMesh(color, false);
    mesh.rotation.z = Math.PI; // face oncoming traffic toward the player

    scene.add(mesh);
    enemyMeshes.set(enemyObj, mesh);
  }

  function syncEnemy(enemyObj, el) {
    const mesh = enemyMeshes.get(enemyObj);
    if (!mesh) return;

    const c = elementCenter(el);
    mesh.position.set(c.x, -c.y, 0);
  }

  function removeEnemy(enemyObj) {
    const mesh = enemyMeshes.get(enemyObj);
    if (mesh && scene) scene.remove(mesh);
    enemyMeshes.delete(enemyObj);
  }

  function clearEnemies() {
    enemyMeshes.forEach((mesh) => scene && scene.remove(mesh));
    enemyMeshes.clear();
  }

  function render() {
    if (renderer) renderer.render(scene, camera);
  }

  return {
    init,
    resize,
    syncPlayer,
    addEnemy,
    syncEnemy,
    removeEnemy,
    clearEnemies,
    setShield,
    render,
  };
})();

let mode3D = false;
let playerBank = 0;
let playerBankTarget = 0;

/* ==========================================================================
   VISUAL & HAPTIC EFFECTS
   Short-lived, absolutely-positioned elements that animate themselves
   out via CSS and clean up after themselves — no extra canvas, no
   particle library.
   ========================================================================== */

function spawnParticles(x, y, colorClass, count = 10) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement("span");
    p.className = `particle ${colorClass}`;

    const angle = Math.random() * Math.PI * 2;
    const distance = 30 + Math.random() * 50;
    const duration = 0.4 + Math.random() * 0.3;

    p.style.left = x + "px";
    p.style.top = y + "px";
    p.style.setProperty("--dx", Math.cos(angle) * distance + "px");
    p.style.setProperty("--dy", Math.sin(angle) * distance + "px");
    p.style.animationDuration = duration + "s";

    gameArea.appendChild(p);

    setTimeout(() => p.remove(), duration * 1000 + 60);
  }
}

function screenShake() {
  gameArea.classList.add("shake");
  setTimeout(() => gameArea.classList.remove("shake"), 300);
}

function vibrate(pattern) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

function showComboPopup(multiplier) {
  const popup = document.getElementById("comboPopup");
  if (!popup) return;

  popup.textContent = `COMBO x${multiplier}`;
  popup.classList.remove("pop");
  void popup.offsetWidth; // restart the animation
  popup.classList.add("pop");

  clearTimeout(comboPopupTimeout);
  comboPopupTimeout = setTimeout(() => popup.classList.remove("pop"), 900);
}

function elementCenter(el) {
  return {
    x: el.offsetLeft + el.offsetWidth / 2,
    y: el.offsetTop + el.offsetHeight / 2,
  };
}

/* Setup Player */

function setupPlayer() {
  playerX = gameArea.clientWidth / 2 - player.offsetWidth / 2;

  player.style.left = playerX + "px";
}

/* Start Game */

function startGame() {
  removeObjects();

  score = 0;
  coins = 0;
  lives = 3;

  level = 1;

  nitro = 100;

  speed = 5;

  roadPosition = 0;

  enemies = [];
  coinObjects = [];

  enemyTimer = 0;
  coinTimer = 0;

  combo = 0;
  lastComboTime = 0;

  shieldActive = false;
  shieldTimer = 0;
  shieldSpawnTimer = 0;
  shieldObjects = [];

  nitroParticleTimer = 0;

  player.classList.remove("shielded");
  if (mode3D) Car3D.setShield(false);

  gameRunning = true;
  gamePaused = false;

  scoreEl.textContent = score;
  coinsEl.textContent = coins;
  livesEl.textContent = lives;
  levelEl.textContent = level;

  nitroFill.style.width = "100%";

  setupPlayer();

  changeRoad();

  startScreen.classList.remove("active");
  pauseScreen.classList.remove("active");
  gameOverScreen.classList.remove("active");

  showLevel();

  if (mode3D) Car3D.clearEnemies();

  AudioEngine.startMusic();

  lastTime = performance.now();

  animationId = requestAnimationFrame(gameLoop);
}

/* Game Loop */

function gameLoop(timestamp) {
  if (!gameRunning) return;

  if (gamePaused) {
    animationId = requestAnimationFrame(gameLoop);

    return;
  }

  const deltaTime = timestamp - lastTime;

  lastTime = timestamp;

  updateRoad();

  updateScore(deltaTime);

  updateEnemies();

  updateCoins();

  updateShieldPickups();

  updateShield(deltaTime);

  updateCombo();

  updateLevel();

  updateNitro();

  if (nitroActive) {
    nitroParticleTimer += deltaTime;

    if (nitroParticleTimer > 60) {
      const c = elementCenter(player);
      spawnParticles(c.x, player.offsetTop + player.offsetHeight, "particle-cyan", 2);
      nitroParticleTimer = 0;
    }
  } else {
    nitroParticleTimer = 0;
  }

  if (mode3D) {
    playerBankTarget *= 0.85;
    playerBank += (playerBankTarget - playerBank) * 0.3;
    Car3D.syncPlayer(player, playerBank);
    Car3D.render();
  }

  animationId = requestAnimationFrame(gameLoop);
}

/* Road Animation */

function updateRoad() {
  roadPosition += nitroActive ? 18 : 8;

  if (roadPosition >= 120) {
    roadPosition = 0;
  }

  roadLines.style.backgroundPosition = `center ${roadPosition}px`;
}

/* Score */

function updateScore(deltaTime) {
  score += deltaTime * 0.01 * (nitroActive ? 2 : 1);

  scoreEl.textContent = Math.floor(score);
}

/* Level System */

function updateLevel() {
  const newLevel = Math.floor(score / 150) + 1;

  if (newLevel > level) {
    level = newLevel;

    levelEl.textContent = level;

    speed += 1;

    changeRoad();

    showLevel();

    AudioEngine.playLevelUp();
  }
}

/* Different Roads */

function changeRoad() {
  gameArea.classList.remove("city-road", "desert-road", "night-road");

  const roads = ["city-road", "desert-road", "night-road"];

  const road = roads[(level - 1) % roads.length];

  gameArea.classList.add(road);
}

/* Show Level */

function showLevel() {
  levelText.textContent = `LEVEL ${level}`;

  levelScreen.classList.add("active");

  setTimeout(() => {
    levelScreen.classList.remove("active");
  }, 1500);
}

/* Lanes */

function getLanes() {
  const width = gameArea.clientWidth;

  const carWidth = 70;

  return [
    width * 0.22 - carWidth / 2,

    width * 0.5 - carWidth / 2,

    width * 0.78 - carWidth / 2,
  ];
}

/* Create Enemy */

function createEnemy() {
  const enemy = document.createElement("div");

  enemy.className = "enemy";

  const image = carImages[Math.floor(Math.random() * carImages.length)];

  enemy.innerHTML = `
    <img
      src="${image}"
      alt="Enemy Car"
    >
  `;

  const lanes = getLanes();

  const lane = lanes[Math.floor(Math.random() * lanes.length)];

  enemy.style.left = lane + "px";

  enemy.style.top = "-130px";

  gameArea.appendChild(enemy);

  const enemyData = {
    element: enemy,

    y: -130,

    hit: false,
  };

  enemies.push(enemyData);

  if (mode3D) Car3D.addEnemy(enemyData);
}

/* Update Enemies */

function updateEnemies() {
  enemyTimer++;

  const spawnRate = Math.max(55 - level * 6, 20);

  if (enemyTimer >= spawnRate) {
    createEnemy();

    enemyTimer = 0;
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    enemy.y += nitroActive ? speed * 1.4 : speed;

    enemy.element.style.top = enemy.y + "px";

    if (mode3D) Car3D.syncEnemy(enemy, enemy.element);

    if (checkCollision(player, enemy.element) && !enemy.hit) {
      enemy.hit = true;

      handleCollision(enemy, i);
    }

    if (enemy.y > gameArea.clientHeight + 150) {
      if (mode3D) Car3D.removeEnemy(enemy);

      enemy.element.remove();

      enemies.splice(i, 1);
    }
  }
}

/* Create Coin */

function createCoin() {
  const coin = document.createElement("div");

  coin.className = "coin";

  coin.innerHTML = "🪙";

  const lanes = getLanes();

  const lane = lanes[Math.floor(Math.random() * lanes.length)];

  coin.style.left = lane + 15 + "px";

  coin.style.top = "-50px";

  gameArea.appendChild(coin);

  coinObjects.push({
    element: coin,

    y: -50,
  });
}

/* Update Coins */

function updateCoins() {
  coinTimer++;

  if (coinTimer > 100) {
    createCoin();

    coinTimer = 0;
  }

  for (let i = coinObjects.length - 1; i >= 0; i--) {
    const coin = coinObjects[i];

    coin.y += speed * 0.9;

    coin.element.style.top = coin.y + "px";

    if (checkCollision(player, coin.element)) {
      const now = performance.now();

      combo = now - lastComboTime <= COMBO_WINDOW ? combo + 1 : 1;
      lastComboTime = now;

      const multiplier = Math.min(1 + Math.floor(combo / 3), 5);

      coins++;
      score += 25 * multiplier;

      AudioEngine.playCoin(combo);

      const c = elementCenter(coin.element);
      spawnParticles(c.x, c.y, "particle-gold", 10);

      if (multiplier > 1) {
        showComboPopup(multiplier);
      }

      vibrate(15);

      coinsEl.textContent = coins;

      scoreEl.textContent = Math.floor(score);

      coin.element.remove();

      coinObjects.splice(i, 1);

      continue;
    }

    if (coin.y > gameArea.clientHeight + 50) {
      coin.element.remove();

      coinObjects.splice(i, 1);
    }
  }
}

/* Shield Power-Up */

function createShield() {
  const shield = document.createElement("div");

  shield.className = "shield-pickup";
  shield.innerHTML = "🛡️";

  const lanes = getLanes();
  const lane = lanes[Math.floor(Math.random() * lanes.length)];

  shield.style.left = lane + 15 + "px";
  shield.style.top = "-50px";

  gameArea.appendChild(shield);

  shieldObjects.push({ element: shield, y: -50 });
}

function updateShieldPickups() {
  shieldSpawnTimer++;

  if (shieldSpawnTimer > 650 && Math.random() < 0.02) {
    createShield();
    shieldSpawnTimer = 0;
  }

  for (let i = shieldObjects.length - 1; i >= 0; i--) {
    const s = shieldObjects[i];

    s.y += speed * 0.9;
    s.element.style.top = s.y + "px";

    if (checkCollision(player, s.element)) {
      activateShield();

      const c = elementCenter(s.element);
      spawnParticles(c.x, c.y, "particle-cyan", 14);

      s.element.remove();
      shieldObjects.splice(i, 1);
      continue;
    }

    if (s.y > gameArea.clientHeight + 50) {
      s.element.remove();
      shieldObjects.splice(i, 1);
    }
  }
}

function activateShield() {
  shieldActive = true;
  shieldTimer = 4000;

  player.classList.add("shielded");
  if (mode3D) Car3D.setShield(true);

  vibrate(25);
}

function updateShield(deltaTime) {
  if (!shieldActive) return;

  shieldTimer -= deltaTime;

  if (shieldTimer <= 0) {
    shieldActive = false;
    player.classList.remove("shielded");
    if (mode3D) Car3D.setShield(false);
  }
}

/* Combo decay — if too long passes without a coin, the streak resets */

function updateCombo() {
  if (combo > 0 && performance.now() - lastComboTime > COMBO_WINDOW) {
    combo = 0;
  }
}

/* Collision */

function checkCollision(element1, element2) {
  const rect1 = element1.getBoundingClientRect();

  const rect2 = element2.getBoundingClientRect();

  return !(
    rect1.bottom < rect2.top + 15 ||
    rect1.top > rect2.bottom - 15 ||
    rect1.right < rect2.left + 15 ||
    rect1.left > rect2.right - 15
  );
}

/* Handle Crash */

function handleCollision(enemy, index) {
  if (mode3D) Car3D.removeEnemy(enemy);

  const c = elementCenter(enemy.element);

  enemy.element.remove();

  enemies.splice(index, 1);

  if (shieldActive) {
    spawnParticles(c.x, c.y, "particle-cyan", 12);

    score += 10;
    scoreEl.textContent = Math.floor(score);

    return;
  }

  AudioEngine.playCrash();

  vibrate([40, 30, 40]);

  screenShake();

  spawnParticles(c.x, c.y, "particle-orange", 14);

  collisionEffect.classList.add("active");

  setTimeout(() => {
    collisionEffect.classList.remove("active");
  }, 300);

  lives--;

  livesEl.textContent = lives;

  if (lives <= 0) {
    endGame();
  }
}

/* Nitro */

function activateNitro() {
  if (!gameRunning || gamePaused || nitro <= 0 || nitroActive) return;

  nitroActive = true;

  AudioEngine.playNitro();

  vibrate(10);

  const c = elementCenter(player);
  spawnParticles(c.x, player.offsetTop + player.offsetHeight, "particle-cyan", 8);

  player.classList.add("nitro-active");

  setTimeout(() => {
    nitroActive = false;

    player.classList.remove("nitro-active");
  }, 2000);
}

/* Update Nitro */

function updateNitro() {
  if (nitroActive) {
    nitro -= 1;
  } else {
    nitro += 0.15;
  }

  if (nitro < 0) {
    nitro = 0;

    nitroActive = false;

    player.classList.remove("nitro-active");
  }

  if (nitro > 100) {
    nitro = 100;
  }

  nitroFill.style.width = nitro + "%";
}

/* Move Player */

function movePlayer(direction) {
  if (!gameRunning || gamePaused) return;

  const amount = 45;

  if (direction === "left") {
    playerX -= amount;
    playerBankTarget = -0.22;
  }

  if (direction === "right") {
    playerX += amount;
    playerBankTarget = 0.22;
  }

  const min = gameArea.clientWidth * 0.1;

  const max = gameArea.clientWidth * 0.9 - player.offsetWidth;

  if (playerX < min) {
    playerX = min;
  }

  if (playerX > max) {
    playerX = max;
  }

  player.style.left = playerX + "px";
}

/* Pause */

function togglePause() {
  if (!gameRunning) return;

  gamePaused = !gamePaused;

  if (gamePaused) {
    pauseScreen.classList.add("active");

    AudioEngine.stopMusic();
  } else {
    pauseScreen.classList.remove("active");

    AudioEngine.startMusic();

    lastTime = performance.now();
  }
}

/* ==========================================================================
   LEADERBOARD
   Top 5 runs, kept locally on this device via localStorage. No account
   or server needed — just a small persisted, sorted list.
   ========================================================================== */

const LEADERBOARD_KEY = "carRacingLeaderboard";

function getLeaderboard() {
  try {
    return JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function saveToLeaderboard(finalScoreVal, finalCoinsVal, levelReached) {
  const board = getLeaderboard();

  board.push({
    score: finalScoreVal,
    coins: finalCoinsVal,
    level: levelReached,
  });

  board.sort((a, b) => b.score - a.score);

  const trimmed = board.slice(0, 5);

  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(trimmed));

  return trimmed;
}

function renderLeaderboard(board, highlightScore) {
  const list = document.getElementById("leaderboardList");
  if (!list) return;

  if (board.length === 0) {
    list.innerHTML = '<li class="leaderboard-empty">No runs yet — go set one!</li>';
    return;
  }

  list.innerHTML = board
    .map((entry, i) => {
      const isNew = entry.score === highlightScore ? " is-new" : "";

      return `
        <li class="leaderboard-item${isNew}">
          <span class="lb-rank">#${i + 1}</span>
          <span class="lb-score">${entry.score}</span>
          <span class="lb-meta">🪙 ${entry.coins} · Lv ${entry.level}</span>
        </li>
      `;
    })
    .join("");
}

/* Animate a stat counting up from 0 to its final value */

function animateCount(el, target) {
  const duration = 700;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    el.textContent = Math.floor(eased * target);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = target;
    }
  }

  requestAnimationFrame(step);
}

/* End Game */

function endGame() {
  gameRunning = false;

  AudioEngine.stopMusic();

  const final = Math.floor(score);
  const isNewHigh = final > highScore;

  if (isNewHigh) {
    highScore = final;

    localStorage.setItem("carRacingHighScore", highScore);
  }

  highScoreEl.textContent = highScore;

  animateCount(finalScore, final);
  animateCount(finalCoins, coins);

  const board = saveToLeaderboard(final, coins, level);
  renderLeaderboard(board, final);

  const banner = document.getElementById("newHighScoreBanner");

  if (banner) {
    banner.style.display = isNewHigh ? "flex" : "none";
  }

  if (isNewHigh) {
    vibrate([20, 40, 20, 40, 60]);
  }

  gameOverScreen.classList.add("active");
}

/* Remove Objects */

function removeObjects() {
  if (mode3D) Car3D.clearEnemies();

  enemies.forEach((enemy) => enemy.element.remove());

  coinObjects.forEach((coin) => coin.element.remove());

  shieldObjects.forEach((s) => s.element.remove());
  shieldObjects = [];
}

/* Keyboard */

document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    event.preventDefault();

    movePlayer("left");
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();

    movePlayer("right");
  }

  if (event.key === "n" || event.key === "N") {
    activateNitro();
  }

  if (event.key === " ") {
    event.preventDefault();

    togglePause();
  }
});

/* Mobile Controls */

document
  .getElementById("leftBtn")
  .addEventListener("click", () => movePlayer("left"));

document
  .getElementById("rightBtn")
  .addEventListener("click", () => movePlayer("right"));

/* Touch Gestures — swipe left/right anywhere on the road to steer,
   a quick tap activates Nitro. Lets mobile players steer without
   pinning a thumb to the small D-pad buttons. */

let touchStartX = null;
let touchStartY = null;
let touchStartTime = 0;
let touchSteered = false;

const SWIPE_THRESHOLD = 28; // px of horizontal movement per steer step
const TAP_MAX_DURATION = 250; // ms
const TAP_MAX_DRIFT = 12; // px

gameArea.addEventListener(
  "touchstart",
  (event) => {
    const t = event.touches[0];

    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
    touchSteered = false;
  },
  { passive: true }
);

gameArea.addEventListener(
  "touchmove",
  (event) => {
    if (touchStartX === null) return;

    const t = event.touches[0];
    const dx = t.clientX - touchStartX;

    if (Math.abs(dx) >= SWIPE_THRESHOLD) {
      movePlayer(dx > 0 ? "right" : "left");

      touchStartX = t.clientX;
      touchSteered = true;
    }
  },
  { passive: true }
);

gameArea.addEventListener(
  "touchend",
  (event) => {
    if (touchStartX === null) return;

    const elapsed = Date.now() - touchStartTime;
    const t = event.changedTouches[0];
    const dx = Math.abs(t.clientX - touchStartX);
    const dy = Math.abs(t.clientY - touchStartY);

    if (!touchSteered && elapsed <= TAP_MAX_DURATION && dx <= TAP_MAX_DRIFT && dy <= TAP_MAX_DRIFT) {
      activateNitro();
    }

    touchStartX = null;
    touchStartY = null;
  },
  { passive: true }
);

document.getElementById("nitroBtn").addEventListener("click", activateNitro);

/* Buttons */

document.getElementById("startBtn").addEventListener("click", startGame);

document.getElementById("restartBtn").addEventListener("click", startGame);

const shareBtn = document.getElementById("shareBtn");

if (shareBtn) {
  shareBtn.addEventListener("click", async () => {
    const text = `I scored ${Math.floor(score)} points and collected ${coins} coins in Ultimate Car Racing! 🏎️💨`;

    if (navigator.share) {
      try {
        await navigator.share({ text, title: "Ultimate Car Racing" });
      } catch (err) {
        // user cancelled the share sheet — nothing to do
      }
    } else if (navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);

        const original = shareBtn.textContent;
        shareBtn.textContent = "✅ Copied!";

        setTimeout(() => {
          shareBtn.textContent = original;
        }, 1500);
      } catch (err) {
        // clipboard unavailable — nothing to do
      }
    }
  });
}

document.getElementById("pauseBtn").addEventListener("click", togglePause);

document.getElementById("resumeBtn").addEventListener("click", togglePause);

/* Music Button */

const musicBtn = document.getElementById("musicBtn");

musicBtn.addEventListener("click", () => {
  const playing = AudioEngine.toggleMusic();

  musicBtn.textContent = playing ? "🎵" : "🔇";
});

/* Resize */

window.addEventListener("resize", () => {
  if (gameRunning) {
    const max = gameArea.clientWidth * 0.9 - player.offsetWidth;

    if (playerX > max) {
      playerX = max;

      player.style.left = playerX + "px";
    }
  }

  if (mode3D) {
    Car3D.resize(gameArea.clientWidth, gameArea.clientHeight);
  }
});

/* Initial Setup */

setupPlayer();

try {
  Car3D.init(carCanvas, gameArea.clientWidth, gameArea.clientHeight);
  mode3D = true;
  gameArea.classList.add("mode-3d");
} catch (err) {
  // WebGL/Three.js unavailable — the flat fallback car images
  // (already in the DOM) stay visible via CSS, so the game still works.
  mode3D = false;
}