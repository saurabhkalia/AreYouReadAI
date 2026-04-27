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
    // Return custom avatar if available, otherwise return generic placeholder using a UI avatar service
    return avatarData || `https://ui-avatars.com/api/?name=Soldier&background=random`;
}

function setupGameUI() {
    const p1NameEl = document.getElementById('p1-name-ui');
    const p2NameEl = document.getElementById('p2-name-ui');
    const p1AvatarEl = document.getElementById('p1-avatar-ui');
    const p2AvatarEl = document.getElementById('p2-avatar-ui');

    if (gameState.isPlayer1) {
        p1NameEl.innerText = gameState.playerName;
        p1AvatarEl.src = getAvatarSrc(gameState.avatar);
        p2NameEl.innerText = gameState.opponentName || 'Player 2';
        p2AvatarEl.src = getAvatarSrc(gameState.opponentAvatar);
    } else {
        p1NameEl.innerText = gameState.opponentName || 'Player 1';
        p1AvatarEl.src = getAvatarSrc(gameState.opponentAvatar);
        p2NameEl.innerText = gameState.playerName;
        p2AvatarEl.src = getAvatarSrc(gameState.avatar);
    }
}

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
    opponentScore: 0
};

class Tank {
    constructor(x, y, isPlayer1, color) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 20;
        this.isPlayer1 = isPlayer1;
        this.color = color;
        // Default aim based on side
        this.angle = isPlayer1 ? -Math.PI / 4 : -3 * Math.PI / 4;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);

        // Draw tank body
        ctx.fillStyle = this.color;
        ctx.fillRect(-this.width/2, -this.height, this.width, this.height);

        // Draw turret
        ctx.beginPath();
        ctx.arc(0, -this.height, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();

        // Draw barrel
        ctx.rotate(this.angle);
        ctx.fillStyle = '#555';
        ctx.fillRect(0, -3, 30, 6);

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

        if (level === 2) {
            y -= Math.sin(i * 0.2) * 50;
        } else if (level === 3) {
            y -= Math.sin(i * 0.3) * 100 + seededRandom() * 20;
        } else if (level === 4) {
            y -= Math.sin(i * 0.15) * 150 + Math.cos(i * 0.4) * 50 + seededRandom() * 30;
        }

        // Flatten edges for tanks
        if (i < 5 || i > points - 6) {
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

    engineState.timeRemaining = engineState.currentQuestion.difficulty === 'hard' ? 15 : 10;
    document.getElementById('timer-display').innerText = engineState.timeRemaining;

    engineState.myShotsRemaining = 3;
    engineState.opponentShotsRemaining = 3;
    document.getElementById('p1-shots').innerText = 3;
    document.getElementById('p2-shots').innerText = 3;

    engineState.terrain = generateTerrain(engineState.level);

    const p1X = 100;
    const p2X = canvas.width - 100;
    const p1Y = engineState.terrain.find(pt => pt.x >= p1X).y;
    const p2Y = engineState.terrain.find(pt => pt.x >= p2X).y;

    engineState.tanks = [
        new Tank(p1X, p1Y, true, '#4CAF50'), // Player 1 (Left)
        new Tank(p2X, p2Y, false, '#f44336') // Player 2 (Right)
    ];

    generateTargets();

    clearInterval(engineState.timerInterval);
    engineState.timerInterval = setInterval(() => {
        engineState.timeRemaining--;
        document.getElementById('timer-display').innerText = engineState.timeRemaining;
        if (engineState.timeRemaining <= 0) {
            endRound();
        }
    }, 1000);
}

function generateTargets() {
    engineState.targets = [];
    const options = [...engineState.currentQuestion.options];
    // Shuffle options using seeded random if in PvP to match?
    // Actually, simple deterministic placement based on order is fine for sync:

    // Spread targets between x=300 and x=700
    const startX = 250;
    const spacing = 400 / (options.length - 1);

    options.forEach((opt, idx) => {
        const x = startX + (idx * spacing);
        const groundY = engineState.terrain.find(pt => pt.x >= x).y;

        engineState.targets.push({
            x: x - 40,
            y: groundY - 40,
            width: 80,
            height: 40,
            text: opt,
            isCorrect: opt === engineState.currentQuestion.answer,
            hitBy: [], // store who hit it
            color: '#34495e',
            showResult: false
        });
    });
}

let aiState = {
    isShooting: false,
    nextActionTime: 0,
    targetSet: false,
    aimingAngle: 0,
    targetPower: 0
};

function processAI() {
    if (gameState.mode !== 'pvai' || engineState.timeRemaining <= 0 || engineState.opponentShotsRemaining <= 0) return;

    const now = Date.now();

    // AI thinks for a bit before taking action
    if (!aiState.targetSet && now > aiState.nextActionTime) {
        // Decide what to shoot at: 75% chance correct, 25% wrong
        const isAccurate = Math.random() < 0.75;
        let targetBox;

        if (isAccurate) {
            targetBox = engineState.targets.find(t => t.isCorrect);
        } else {
            const wrongBoxes = engineState.targets.filter(t => !t.isCorrect);
            targetBox = wrongBoxes[Math.floor(Math.random() * wrongBoxes.length)];
        }

        if (targetBox) {
            // Calculate rough trajectory to hit the target
            const oppTank = engineState.tanks.find(t => !t.isPlayer1);

            // Basic physics solver for angle and power
            // x = v*cos(theta)*t => t = x / (v*cos(theta))
            // y = v*sin(theta)*t + 0.5*g*t^2

            const dx = targetBox.x + targetBox.width/2 - oppTank.x;
            const dy = targetBox.y + targetBox.height/2 - (oppTank.y - oppTank.height);

            // Fix an angle, solve for power (velocity)
            // AI is on the right, so shoot left (angle between Math.PI and Math.PI*1.5)
            // Let's pick a random high arc
            aiState.aimingAngle = Math.PI + Math.PI/4 + (Math.random() * 0.2 - 0.1);

            // v^2 = (g * x^2) / (2 * cos^2(theta) * (x * tan(theta) - y))
            const g = engineState.gravity;
            const cos = Math.cos(aiState.aimingAngle);
            const tan = Math.tan(aiState.aimingAngle);

            const vSq = (g * dx * dx) / (2 * cos * cos * (dx * tan - dy));

            if (vSq > 0) {
                // Add some slight fuzziness to power based on AI accuracy
                const powerFuzz = isAccurate ? (Math.random() * 0.5 - 0.25) : (Math.random() * 4 - 2);
                aiState.targetPower = Math.sqrt(vSq) + powerFuzz;

                // Cap power
                aiState.targetPower = Math.min(aiState.targetPower, engineState.maxPower);

                aiState.targetSet = true;
                aiState.isShooting = true;
                // Animate tank aiming
                oppTank.angle = aiState.aimingAngle;
            } else {
                // Try again next frame if trajectory is invalid
                aiState.nextActionTime = now + 500;
            }
        }
    }

    if (aiState.isShooting) {
        // Fire instantly or charge? Let's just fire instantly for simplicity but simulate charging delay
        setTimeout(() => {
            if (engineState.timeRemaining > 0 && engineState.opponentShotsRemaining > 0) {
                const oppTank = engineState.tanks.find(t => !t.isPlayer1);
                fireProjectile(oppTank, aiState.targetPower);
                engineState.opponentShotsRemaining--;
                document.getElementById('p2-shots').innerText = engineState.opponentShotsRemaining;

                // Reset AI for next shot
                aiState.targetSet = false;
                aiState.isShooting = false;
                // Random delay before next shot (between 2 to 4 seconds)
                aiState.nextActionTime = Date.now() + 2000 + Math.random() * 2000;
            }
        }, 1000); // 1 second charging simulation
        aiState.isShooting = false; // Prevent multiple timeouts
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
                if (!t.hitBy.includes(p.isPlayer1)) {
                    t.hitBy.push(p.isPlayer1);
                    handleTargetHit(t, p.isPlayer1);
                }
            }
        });
    });

    engineState.projectiles = engineState.projectiles.filter(p => p.active);

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

        engineState.myScore += points;
        document.getElementById(gameState.isPlayer1 ? 'p1-score' : 'p2-score').innerText = engineState.myScore;

        if (gameState.mode === 'pvp') {
            socket.emit('updateScore', { roomCode: gameState.roomCode, score: engineState.myScore });
        }
    } else if (gameState.mode === 'pvai' && !isPlayer1Hit) {
        // Calculate points for AI
        let points = 0;
        if (target.isCorrect) {
            points = 100 + (engineState.timeRemaining * 10);
        } else {
            points = -20;
        }
        engineState.opponentScore += points;
        document.getElementById('p2-score').innerText = engineState.opponentScore;
    }
}

function endRound() {
    clearInterval(engineState.timerInterval);
    engineState.timeRemaining = 0;

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

    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = context.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        context.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      }
      else {
        line = testLine;
      }
    }
    context.fillText(line, x, y);
}

function drawTargets() {
    engineState.targets.forEach(t => {
        ctx.fillStyle = t.color;
        ctx.fillRect(t.x, t.y, t.width, t.height);

        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x, t.y, t.width, t.height);

        // Draw hit markers
        if (t.hitBy.length > 0) {
            const hitText = t.hitBy.map(isP1 => isP1 ? 'P1' : 'P2').join(',');
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.fillRect(t.x, t.y - 15, t.width, 15);
            ctx.fillStyle = 'black';
            ctx.font = '10px Arial';
            ctx.fillText(hitText, t.x + 5, t.y - 5);
        }

        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Wrap text to fit inside box
        wrapText(ctx, t.text, t.x + t.width/2, t.y + 15, t.width - 10, 12);
    });
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTerrain();
    drawTargets();
    engineState.tanks.forEach(t => t.draw());
    engineState.projectiles.forEach(p => p.draw());
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

function setupControls() {
    canvas.addEventListener('mousemove', (e) => {
        if (engineState.myShotsRemaining <= 0) return;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const tank = getMyTank();
        if (tank) {
            // Tank barrel pivot is at (tank.x, tank.y - tank.height)
            const dy = mouseY - (tank.y - tank.height);
            const dx = mouseX - tank.x;
            tank.angle = Math.atan2(dy, dx);

            if (gameState.mode === 'pvp') {
                socket.emit('aimAngle', { roomCode: gameState.roomCode, angle: tank.angle });
            }
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        if (engineState.myShotsRemaining <= 0 || engineState.timeRemaining <= 0) return;
        if (e.button === 0) { // Left click
            engineState.isCharging = true;
            engineState.chargePower = 0;
            engineState.chargeDirection = 1;
            powerBarContainer.style.display = 'block';
            powerBarFill.style.width = '0%';
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (engineState.isCharging) {
            engineState.isCharging = false;
            powerBarContainer.style.display = 'none';
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
    });
}

function fireProjectile(tank, power) {
    const startX = tank.x + Math.cos(tank.angle) * 30;
    const startY = tank.y - tank.height + Math.sin(tank.angle) * 30;

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
