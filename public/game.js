const socket = io();

// DOM Elements
const screens = {
    landing: document.getElementById('landing-screen'),
    lobby: document.getElementById('lobby-screen'),
    game: document.getElementById('game-screen'),
    gameOver: document.getElementById('game-over-screen')
};

// State
let gameState = {
    mode: null, // 'pvp' or 'pvai'
    roomCode: null,
    playerId: null,
    isPlayer1: false,
    playerName: 'Player 1',
    avatar: null
};

// UI Handling functions
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
        screen.classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
    screens[screenName].classList.add('active');
}

// Avatar upload
document.getElementById('avatarUpload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('avatarPreview').src = e.target.result;
            document.getElementById('avatarPreview').style.display = 'inline-block';
            gameState.avatar = e.target.result;
        }
        reader.readAsDataURL(file);
    }
});

// Event Listeners for Buttons
document.getElementById('btnCreatePvP').addEventListener('click', () => {
    gameState.playerName = document.getElementById('playerName').value || 'Player 1';
    gameState.mode = 'pvp';
    socket.emit('createRoom');
});

document.getElementById('btnJoinPvP').addEventListener('click', () => {
    const code = document.getElementById('joinRoomCode').value.toUpperCase();
    if (code) {
        gameState.playerName = document.getElementById('playerName').value || 'Player 2';
        gameState.mode = 'pvp';
        socket.emit('joinRoom', code);
    }
});

document.getElementById('btnPvAI').addEventListener('click', () => {
    gameState.playerName = document.getElementById('playerName').value || 'Player 1';
    gameState.mode = 'pvai';
    gameState.isPlayer1 = true;
    startLocalGame(); // We'll implement this later
});

document.getElementById('btnReady').addEventListener('click', () => {
    document.getElementById('btnReady').disabled = true;
    const statusEl = gameState.isPlayer1 ? document.getElementById('player1Status') : document.getElementById('player2Status');
    statusEl.innerHTML = `Player ${gameState.isPlayer1 ? '1' : '2'} (${gameState.playerName}): <span class="status ready">Ready!</span>`;
    socket.emit('playerReady', {
        roomCode: gameState.roomCode,
        playerName: gameState.playerName,
        avatar: gameState.avatar
    });
});

// Socket Event Listeners
socket.on('roomCreated', (code) => {
    gameState.roomCode = code;
    gameState.isPlayer1 = true;
    gameState.playerId = socket.id;
    document.getElementById('displayRoomCode').innerText = code;

    document.getElementById('player1Status').innerHTML = `Player 1 (${gameState.playerName}): <span class="status waiting">Waiting...</span>`;
    showScreen('lobby');
});

socket.on('roomJoined', (code) => {
    gameState.roomCode = code;
    gameState.isPlayer1 = false;
    gameState.playerId = socket.id;
    document.getElementById('displayRoomCode').innerText = code;

    document.getElementById('player1Status').innerHTML = `Player 1: <span class="status ready">In Room</span>`;
    document.getElementById('player2Status').innerHTML = `Player 2 (${gameState.playerName}): <span class="status waiting">Waiting...</span>`;
    showScreen('lobby');
});

socket.on('playerJoined', (id) => {
    if (gameState.isPlayer1 && id !== socket.id) {
        document.getElementById('player2Status').innerHTML = `Player 2: <span class="status ready">Joined!</span>`;
    }
});

socket.on('opponentReady', (data) => {
    gameState.opponentName = data.playerName;
    gameState.opponentAvatar = data.avatar;
    const opponentStatusId = gameState.isPlayer1 ? 'player2Status' : 'player1Status';
    document.getElementById(opponentStatusId).innerHTML = `Player ${gameState.isPlayer1 ? '2' : '1'} (${data.playerName}): <span class="status ready">Ready!</span>`;
});

socket.on('gameReady', () => {
    document.getElementById('btnReady').disabled = false;
});

socket.on('startGame', (data) => {
    showScreen('game');
    if (data && data.players) {
        const opponent = data.players.find(p => p.id !== socket.id);
        if (opponent) {
            gameState.opponentName = opponent.playerName;
            gameState.opponentAvatar = opponent.avatar;
        }
    }
    // Set UI for both players
    setupGameUI();
    initGame();
});

function getAvatarSrc(avatarData) {
    // Return custom avatar if available, otherwise return local soldier SVG
    return avatarData || `soldier.svg`;
}

function setupGameUI() {
    const p1NameEl = document.getElementById('p1-name-ui');
    const p2NameEl = document.getElementById('p2-name-ui');

    if (gameState.isPlayer1) {
        p1NameEl.innerText = gameState.playerName;
        p2NameEl.innerText = gameState.opponentName || 'Player 2';
    } else {
        p1NameEl.innerText = gameState.opponentName || 'Player 1';
        p2NameEl.innerText = gameState.playerName;
    }
}

document.getElementById('btnQuitGameMid').addEventListener('click', () => {
    location.reload();
});

socket.on('error', (msg) => {
    const msgEl = document.getElementById('lobby-message');
    msgEl.innerText = msg;
    msgEl.classList.remove('hidden');
    setTimeout(() => msgEl.classList.add('hidden'), 3000);
});

function startLocalGame() {
    showScreen('game');
    gameState.opponentName = 'AI Opponent';
    setupGameUI();
    initGame();
}

// Game Engine
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const powerBarContainer = document.getElementById('power-bar-container');
const powerBarFill = document.getElementById('power-bar-fill');

let engineState = {
    isRunning: false,
    level: 1,
    terrain: [],
    tanks: [],
    projectiles: [],
    targets: [], // question answers
    explosions: [], // Blast effects
    currentQuestion: null,
    timeRemaining: 10,
    timerInterval: null,
    gravity: 0.2,
    isCharging: false,
    chargePower: 0,
    maxPower: 20,
    chargeDirection: 1,
    myShotsRemaining: 3,
    opponentShotsRemaining: 3,
    myScore: 0,
    opponentScore: 0,
    pendingMyPoints: 0,
    pendingOpponentPoints: 0
};

class Tank {
    constructor(x, y, isPlayer1, color) {
        this.x = x;
        this.y = y;
        this.width = 46;
        this.height = 14;
        this.isPlayer1 = isPlayer1;
        this.color = color;
        // Default aim based on side
        this.angle = isPlayer1 ? -Math.PI / 4 : -3 * Math.PI / 4;

        // Setup Avatar Image
        this.avatarImg = new Image();
        if (isPlayer1) {
            this.avatarImg.src = getAvatarSrc(gameState.avatar);
        } else {
            this.avatarImg.src = getAvatarSrc(gameState.opponentAvatar);
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Draw tank tracks (bottom)
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.roundRect(-this.width/2 - 2, -6, this.width + 4, 6, 3);
        ctx.fill();

        // Draw tank body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.roundRect(-this.width/2 + 2, -this.height - 4, this.width - 4, this.height, 4);
        ctx.fill();

        // Add some body details (shading)
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(-this.width/2 + 2, -this.height/2 - 2, this.width - 4, this.height/2);

        // Draw turret base
        ctx.beginPath();
        ctx.arc(0, -this.height - 4, 10, 0, Math.PI, true); // Semi circle top
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.save();
        // Draw barrel
        // Move to turret pivot point
        ctx.translate(0, -this.height - 4);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#444';
        ctx.fillRect(0, -4, 32, 8); // main barrel
        ctx.fillStyle = '#222';
        ctx.fillRect(28, -5, 6, 10); // barrel tip
        ctx.restore();

        // Draw Avatar hovering above
        if (this.avatarImg.complete && this.avatarImg.naturalWidth !== 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, -this.height - 35, 15, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(this.avatarImg, -15, -this.height - 50, 30, 30);
            ctx.restore();

            // Avatar border
            ctx.beginPath();
            ctx.arc(0, -this.height - 35, 15, 0, Math.PI * 2);
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'white';
            ctx.stroke();
        }

        // Draw Angle in degrees text
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        // Convert rad to deg, where 0 is right, -90 is up
        let deg = Math.round((this.angle * 180) / Math.PI);
        // Normalize degrees so it looks intuitive (0 to 180 over the top)
        deg = deg < 0 ? Math.abs(deg) : 360 - deg;
        ctx.fillText(`${deg}°`, 0, 15);

        ctx.restore();
    }
}

class Projectile {
    constructor(x, y, vx, vy, color, isPlayer1) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = 4;
        this.color = color;
        this.isPlayer1 = isPlayer1;
        this.active = true;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += engineState.gravity;

        // Check bounds
        if (this.x < 0 || this.x > canvas.width || this.y > canvas.height) {
            this.active = false;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

// Simple seeded random to keep terrain consistent between players
let currentSeed = 1;
function seededRandom() {
    const x = Math.sin(currentSeed++) * 10000;
    return x - Math.floor(x);
}

function generateTerrain(level) {
    const terrain = [];
    const points = 50;
    const step = canvas.width / (points - 1);

    // Seed using level and question index to ensure both players get identical terrain
    currentSeed = engineState.level * 100 + engineState.questionIndex;

    for (let i = 0; i < points; i++) {
        let y = canvas.height - 100; // base height

        // Add random noise to all levels based on currentSeed so it changes every round
        y -= seededRandom() * 10;

        if (level === 2) {
            y -= Math.sin(i * 0.2) * 50 + seededRandom() * 20;
        } else if (level === 3) {
            y -= Math.sin(i * 0.3) * 100 + seededRandom() * 30;
        } else if (level === 4) {
            y -= Math.sin(i * 0.15) * 150 + Math.cos(i * 0.4) * 50 + seededRandom() * 40;
        }

        // Flatten edges for tanks
        if (i <= 10 || i >= points - 11) {
            y = canvas.height - 100;
        }

        terrain.push({ x: i * step, y: Math.max(200, Math.min(canvas.height - 20, y)) });
    }
    return terrain;
}

function drawTerrain() {
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    engineState.terrain.forEach(pt => ctx.lineTo(pt.x, pt.y));
    ctx.lineTo(canvas.width, canvas.height);
    ctx.fillStyle = '#228B22'; // Forest Green
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#006400';
    ctx.stroke();
}

let questionsDB = [];

async function loadQuestions() {
    const res = await fetch('questions.json');
    questionsDB = await res.json();
}

function initGame() {
    loadQuestions().then(() => {
        engineState.isRunning = true;
        engineState.questionIndex = 0;
        engineState.level = 1;
        startNewRound();
        setupControls();
        gameLoop();
    });
}

function startNewRound() {
    // Get question for current level
    const levelQuestions = questionsDB.filter(q => q.level === engineState.level);
    engineState.currentQuestion = levelQuestions[engineState.questionIndex % levelQuestions.length];

    document.getElementById('question-text').innerText = engineState.currentQuestion.question;
    document.getElementById('level-display').innerText = `Level ${engineState.level}`;

    // Stop any existing timer
    clearInterval(engineState.timerInterval);
    engineState.timeRemaining = 0; // 0 prevents controls from firing
    document.getElementById('timer-display').innerText = "---";

    engineState.myShotsRemaining = 3;
    engineState.opponentShotsRemaining = 3;
    document.getElementById('p1-shots').innerText = 3;
    document.getElementById('p2-shots').innerText = 3;

    engineState.pendingMyPoints = 0;
    engineState.pendingOpponentPoints = 0;

    engineState.terrain = generateTerrain(engineState.level);

    // Seed using level and question to ensure both players get identical tank spawns
    currentSeed = engineState.level * 100 + engineState.questionIndex + 2;

    // Randomize spawn positions within the flat zones
    // P1 zone: 50 to 200
    // P2 zone: 1000 to 1150
    const p1X = 50 + seededRandom() * 150;
    const p2X = 1000 + seededRandom() * 150;

    const p1Y = engineState.terrain.find(pt => pt.x >= p1X).y;
    const p2Y = engineState.terrain.find(pt => pt.x >= p2X).y;

    engineState.tanks = [
        new Tank(p1X, p1Y, true, '#4CAF50'), // Player 1 (Left)
        new Tank(p2X, p2Y, false, '#f44336') // Player 2 (Right)
    ];

    generateTargets();

    // Trigger Countdown Overlay only if it's the first question of a new level
    if (engineState.questionIndex === 0) {
        let countdown = 3;
        let showingTitle = true;
        const overlay = document.getElementById('announcement-overlay');
        const textEl = document.getElementById('announcement-text');

        overlay.classList.remove('hidden');
        textEl.innerText = `Level ${engineState.level}`;

        let countdownInterval = setInterval(() => {
            if (showingTitle) {
                showingTitle = false;
                textEl.innerText = countdown;
                countdown--;
            } else if (countdown > 0) {
                textEl.innerText = countdown;
                countdown--;
            } else {
                clearInterval(countdownInterval);
                overlay.classList.add('hidden');
                beginRoundPlay();
            }
        }, 1000);
    } else {
        // Skip countdown for subsequent questions in the same level
        beginRoundPlay();
    }
}

function beginRoundPlay() {
    engineState.timeRemaining = engineState.currentQuestion.difficulty === 'hard' ? 15 : 10;
    document.getElementById('timer-display').innerText = engineState.timeRemaining;

    engineState.timerInterval = setInterval(() => {
        engineState.timeRemaining--;
        document.getElementById('timer-display').innerText = engineState.timeRemaining;
        if (engineState.timeRemaining <= 0) {
            endRound();
        }
    }, 1000);
}

// Fisher-Yates shuffle using our seeded random
function shuffleArraySeeded(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function generateTargets() {
    engineState.targets = [];
    const options = [...engineState.currentQuestion.options];

    // Seed using level and question to ensure both players shuffle exactly the same way
    currentSeed = engineState.level * 100 + engineState.questionIndex + 1;
    shuffleArraySeeded(options);

    // 3 Bunkers spread across the middle ground
    // We will divide the center (x=300 to x=900) into 3 zones
    const zoneWidth = 200; // 3 zones: 300-500, 500-700, 700-900
    const bunkerSize = 60;

    options.forEach((opt, idx) => {
        // Calculate random X within this specific zone
        const zoneStartX = 300 + (idx * zoneWidth);
        const randomOffsetX = seededRandom() * (zoneWidth - bunkerSize);
        const x = zoneStartX + randomOffsetX;

        // Find ground Y at this exact X coordinate
        const groundPoint = engineState.terrain.find(pt => pt.x >= x);
        const groundY = groundPoint ? groundPoint.y : (canvas.height - 100);

        // Alternate pole height to prevent wide signboards from overlapping
        // Left and Right bunkers get a short pole, center bunker gets a tall pole
        const poleHeight = (idx === 1) ? 140 : 60;

        engineState.targets.push({
            x: x,
            y: groundY - bunkerSize,
            width: bunkerSize,
            height: bunkerSize,
            poleHeight: poleHeight,
            text: opt,
            isCorrect: opt === engineState.currentQuestion.answer,
            hitBy: [], // store who hit it
            color: '#555555', // Slate/Rock color
            showResult: false
        });
    });
}

let aiState = {
    state: 'IDLE', // IDLE, AIMING, CHARGING
    nextActionTime: 0,
    targetBox: null,
    aimingAngle: 0,
    targetPower: 0,
    currentPower: 0,
    isAccurate: true
};

function processAI() {
    if (gameState.mode !== 'pvai' || engineState.timeRemaining <= 0 || engineState.opponentShotsRemaining <= 0) return;

    const now = Date.now();
    const oppTank = engineState.tanks.find(t => !t.isPlayer1);

    if (aiState.state === 'IDLE' && now > aiState.nextActionTime) {
        aiState.isAccurate = Math.random() < 0.75;
        if (aiState.isAccurate) {
            aiState.targetBox = engineState.targets.find(t => t.isCorrect);
        } else {
            const wrongBoxes = engineState.targets.filter(t => !t.isCorrect);
            aiState.targetBox = wrongBoxes[Math.floor(Math.random() * wrongBoxes.length)];
        }

        if (aiState.targetBox) {
            const dx = aiState.targetBox.x + aiState.targetBox.width/2 - oppTank.x;
            const dy = aiState.targetBox.y + aiState.targetBox.height/2 - (oppTank.y - oppTank.height);

            aiState.aimingAngle = Math.PI + Math.PI/4 + (Math.random() * 0.2 - 0.1);

            const g = engineState.gravity;
            const cos = Math.cos(aiState.aimingAngle);
            const tan = Math.tan(aiState.aimingAngle);

            const denominator = 2 * cos * cos * (dy - dx * tan);
            if (denominator > 0) {
                const vSq = (g * dx * dx) / denominator;
                const powerFuzz = aiState.isAccurate ? (Math.random() * 0.5 - 0.25) : (Math.random() * 4 - 2);
                aiState.targetPower = Math.sqrt(vSq) + powerFuzz;
                aiState.targetPower = Math.min(aiState.targetPower, engineState.maxPower);

                aiState.state = 'AIMING';
            } else {
                aiState.nextActionTime = now + 500;
            }
        }
    } else if (aiState.state === 'AIMING') {
        const diff = aiState.aimingAngle - oppTank.angle;
        if (Math.abs(diff) > 0.05) {
            oppTank.angle += diff * 0.1;
        } else {
            oppTank.angle = aiState.aimingAngle;
            aiState.state = 'CHARGING';
            aiState.currentPower = 0;
        }
    } else if (aiState.state === 'CHARGING') {
        aiState.currentPower += 0.5;
        if (aiState.currentPower >= aiState.targetPower) {
            fireProjectile(oppTank, aiState.currentPower);
            engineState.opponentShotsRemaining--;
            document.getElementById('p2-shots').innerText = engineState.opponentShotsRemaining;

            aiState.state = 'IDLE';
            aiState.nextActionTime = Date.now() + 2000 + Math.random() * 2000;
        }
    }
}

function update() {
    processAI();
    engineState.projectiles.forEach(p => p.update());

    // Check collisions
    engineState.projectiles.forEach(p => {
        if (!p.active) return;

        // Terrain collision
        const terrainPoint = engineState.terrain.find(pt => pt.x >= p.x);
        if (terrainPoint && p.y >= terrainPoint.y) {
            p.active = false;
        }

        // Target collision
        engineState.targets.forEach(t => {
            if (p.x >= t.x && p.x <= t.x + t.width && p.y >= t.y && p.y <= t.y + t.height) {
                p.active = false;

                // Spawn explosion blast effect at impact point
                engineState.explosions.push({
                    x: p.x,
                    y: p.y,
                    radius: 5,
                    maxRadius: 30,
                    alpha: 1.0,
                    color: '#FFA500' // Orange blast
                });

                if (!t.hitBy.includes(p.isPlayer1)) {
                    t.hitBy.push(p.isPlayer1);
                    handleTargetHit(t, p.isPlayer1);
                }
            }
        });
    });

    engineState.projectiles = engineState.projectiles.filter(p => p.active);

    // Update explosions
    engineState.explosions.forEach(exp => {
        exp.radius += 2;
        exp.alpha -= 0.05;
    });
    engineState.explosions = engineState.explosions.filter(exp => exp.alpha > 0);

    if (engineState.isCharging) {
        engineState.chargePower += 0.5 * engineState.chargeDirection;
        if (engineState.chargePower >= engineState.maxPower) engineState.chargeDirection = -1;
        if (engineState.chargePower <= 0) engineState.chargeDirection = 1;

        const percentage = (engineState.chargePower / engineState.maxPower) * 100;
        powerBarFill.style.width = `${percentage}%`;
    }
}

function handleTargetHit(target, isPlayer1Hit) {
    // Only calculate points if I am the one who hit it (to avoid double scoring in sync)
    if (gameState.isPlayer1 === isPlayer1Hit) {
        let points = 0;
        if (target.isCorrect) {
            // Base points + time bonus
            points = 100 + (engineState.timeRemaining * 10);
        } else {
            // Minor penalty
            points = -20;
        }

        engineState.pendingMyPoints += points;
    } else if (gameState.mode === 'pvai' && !isPlayer1Hit) {
        // Calculate points for AI
        let points = 0;
        if (target.isCorrect) {
            points = 100 + (engineState.timeRemaining * 10);
        } else {
            points = -20;
        }
        engineState.pendingOpponentPoints += points;
    }
}

function endRound() {
    clearInterval(engineState.timerInterval);
    engineState.timeRemaining = 0;

    // Apply pending points at the end of the round
    engineState.myScore += engineState.pendingMyPoints;
    document.getElementById(gameState.isPlayer1 ? 'p1-score' : 'p2-score').innerText = engineState.myScore;

    if (gameState.mode === 'pvp') {
        socket.emit('updateScore', { roomCode: gameState.roomCode, score: engineState.myScore });
    } else if (gameState.mode === 'pvai') {
        engineState.opponentScore += engineState.pendingOpponentPoints;
        document.getElementById('p2-score').innerText = engineState.opponentScore;
    }

    // Highlight correct/incorrect answers
    engineState.targets.forEach(t => {
        t.showResult = true;
        t.color = t.isCorrect ? '#27ae60' : '#c0392b';
    });

    // Wait 3 seconds, then next round
    setTimeout(() => {
        engineState.questionIndex++;
        if (engineState.questionIndex >= 5) {
            engineState.questionIndex = 0;
            engineState.level++;
        }

        if (engineState.level > 4) {
            endGame();
        } else {
            if (gameState.mode === 'pvp') {
                socket.emit('nextRoundReady', gameState.roomCode);
            } else {
                startNewRound();
            }
        }
    }, 3000);
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    const lines = [];

    // Pre-calculate lines to center them vertically
    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        lines.push(line);
        line = words[n] + ' ';
      }
      else {
        line = testLine;
      }
    }
    lines.push(line);

    // Adjust y to start so the text block is vertically centered
    let startY = y - ((lines.length - 1) * lineHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
        context.fillText(lines[i].trim(), x, startY + (i * lineHeight));
    }
}

function drawTargets() {
    engineState.targets.forEach(t => {
        // Draw the Signboard extending upwards from the bunker
        const signPoleWidth = 6;
        const signPoleHeight = t.poleHeight;
        const signPoleX = t.x + t.width/2 - signPoleWidth/2;
        const signPoleY = t.y - signPoleHeight;

        ctx.fillStyle = '#654321'; // Wood pole
        ctx.fillRect(signPoleX, signPoleY, signPoleWidth, signPoleHeight);

        const signWidth = 140;
        const signHeight = 50;
        const signX = t.x + t.width/2 - signWidth/2;
        const signY = t.y - signPoleHeight - signHeight;

        // If showing result, signboard changes color, else dark blueish
        let signColor = t.showResult ? t.color : '#2C3E50';

        ctx.fillStyle = signColor;
        ctx.fillRect(signX, signY, signWidth, signHeight);
        ctx.strokeStyle = '#BDC3C7';
        ctx.lineWidth = 2;
        ctx.strokeRect(signX, signY, signWidth, signHeight);

        // Draw text on the Signboard
        ctx.fillStyle = 'white';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        wrapText(ctx, t.text, signX + signWidth/2, signY + signHeight/2, signWidth - 10, 14);

        // Draw the Rocky Bunker (Hitbox)
        // We will draw it as a dome/rock shape that fits exactly inside the width/height hitbox
        ctx.fillStyle = t.showResult ? t.color : '#555555';
        ctx.beginPath();
        ctx.moveTo(t.x, t.y + t.height); // bottom left
        ctx.lineTo(t.x + 5, t.y + 10); // jagged left
        ctx.lineTo(t.x + t.width/2, t.y); // top middle peak
        ctx.lineTo(t.x + t.width - 5, t.y + 15); // jagged right
        ctx.lineTo(t.x + t.width, t.y + t.height); // bottom right
        ctx.closePath();
        ctx.fill();

        // Inner rocky details
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(t.x + 15, t.y + t.height);
        ctx.lineTo(t.x + 20, t.y + 20);
        ctx.moveTo(t.x + 40, t.y + t.height);
        ctx.lineTo(t.x + 45, t.y + 30);
        ctx.stroke();

        // Draw hit markers above the rocky bunker
        if (t.hitBy.length > 0) {
            const hitText = t.hitBy.map(isP1 => isP1 ? 'P1' : 'P2').join(',');
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fillRect(t.x + t.width/2 - 15, t.y - 15, 30, 15);
            ctx.fillStyle = 'black';
            ctx.font = 'bold 10px Arial';
            ctx.fillText(hitText, t.x + t.width/2, t.y - 7);
        }
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTerrain();
    drawTargets();
    engineState.tanks.forEach(t => t.draw());
    engineState.projectiles.forEach(p => p.draw());

    // Draw explosions
    engineState.explosions.forEach(exp => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, exp.alpha);
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
        ctx.fillStyle = exp.color;
        ctx.fill();
        ctx.strokeStyle = '#FFFF00'; // Yellow inner rim
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    });
}

function endGame() {
    engineState.isRunning = false;
    showScreen('gameOver');

    document.getElementById('final-p1-score').innerText = gameState.isPlayer1 ? engineState.myScore : engineState.opponentScore;
    document.getElementById('final-p2-score').innerText = gameState.isPlayer1 ? engineState.opponentScore : engineState.myScore;

    let winnerText = "";
    if (engineState.myScore > engineState.opponentScore) {
        winnerText = "You Win!";
    } else if (engineState.opponentScore > engineState.myScore) {
        winnerText = "Opponent Wins!";
    } else {
        winnerText = "It's a Tie!";
    }
    document.getElementById('winner-announcement').innerText = winnerText;
}

document.getElementById('btnRestart').addEventListener('click', () => {
    location.reload();
});

document.getElementById('btnQuit').addEventListener('click', () => {
    location.reload();
});

function gameLoop() {
    if (!engineState.isRunning) return;
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function getMyTank() {
    return engineState.tanks.find(t => t.isPlayer1 === gameState.isPlayer1);
}

let controlsSetup = false;

function setupControls() {
    if (controlsSetup) return; // Prevent multiple attachments
    controlsSetup = true;

    canvas.addEventListener('mousemove', (e) => {
        if (engineState.myShotsRemaining <= 0) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const tank = getMyTank();
        if (tank) {
            // Tank barrel pivot is at (tank.x, tank.y - tank.height - 4)
            const dy = mouseY - (tank.y - tank.height - 4);
            const dx = mouseX - tank.x;
            tank.angle = Math.atan2(dy, dx);

            if (gameState.mode === 'pvp') {
                socket.emit('aimAngle', { roomCode: gameState.roomCode, angle: tank.angle });
            }
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        if (engineState.myShotsRemaining <= 0 || engineState.timeRemaining <= 0 || engineState.isCharging) return;
        if (e.button === 0) { // Left click
            engineState.isCharging = true;
            engineState.chargePower = 0;
            engineState.chargeDirection = 1;
            powerBarFill.style.width = '0%';
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (engineState.isCharging) {
            engineState.isCharging = false;
            powerBarFill.style.width = '0%'; // Reset bar after shot

            if (engineState.myShotsRemaining > 0) {
                fireProjectile(getMyTank(), engineState.chargePower);
                engineState.myShotsRemaining--;
                document.getElementById(gameState.isPlayer1 ? 'p1-shots' : 'p2-shots').innerText = engineState.myShotsRemaining;

                if (gameState.mode === 'pvp') {
                    socket.emit('shoot', {
                        roomCode: gameState.roomCode,
                        power: engineState.chargePower,
                        angle: getMyTank().angle
                    });
                }
            }
        }
    });
}

function fireProjectile(tank, power) {
    const startX = tank.x + Math.cos(tank.angle) * 32;
    const startY = tank.y - tank.height - 4 + Math.sin(tank.angle) * 32;

    const vx = Math.cos(tank.angle) * power;
    const vy = Math.sin(tank.angle) * power;

    engineState.projectiles.push(new Projectile(startX, startY, vx, vy, tank.color, tank.isPlayer1));
}

// Socket handlers for gameplay
socket.on('updateAim', ({ angle }) => {
    const oppTank = engineState.tanks.find(t => t.isPlayer1 !== gameState.isPlayer1);
    if (oppTank) oppTank.angle = angle;
});

socket.on('playerShot', ({ power, angle }) => {
    const oppTank = engineState.tanks.find(t => t.isPlayer1 !== gameState.isPlayer1);
    if (oppTank) {
        oppTank.angle = angle;
        fireProjectile(oppTank, power);
        engineState.opponentShotsRemaining--;
        document.getElementById(gameState.isPlayer1 ? 'p2-shots' : 'p1-shots').innerText = engineState.opponentShotsRemaining;
    }
});

socket.on('opponentScore', ({ score }) => {
    engineState.opponentScore = score;
    document.getElementById(gameState.isPlayer1 ? 'p2-score' : 'p1-score').innerText = engineState.opponentScore;
});

socket.on('startNextRound', () => {
    startNewRound();
});
