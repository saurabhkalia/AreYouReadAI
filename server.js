const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Keep track of rooms and players
const rooms = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create a new room
    socket.on('createRoom', () => {
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomCode] = {
            players: [{ id: socket.id, ready: false }],
            gameState: 'lobby'
        };
        socket.join(roomCode);
        socket.emit('roomCreated', roomCode);
        console.log(`Room created: ${roomCode} by ${socket.id}`);
    });

    // Join an existing room
    socket.on('joinRoom', (roomCode) => {
        if (rooms[roomCode] && rooms[roomCode].players.length < 2) {
            rooms[roomCode].players.push({ id: socket.id, ready: false });
            socket.join(roomCode);
            socket.emit('roomJoined', roomCode);
            io.to(roomCode).emit('playerJoined', socket.id);
            console.log(`User ${socket.id} joined room ${roomCode}`);

            // If room is full, can start the game
            if (rooms[roomCode].players.length === 2) {
                io.to(roomCode).emit('gameReady');
            }
        } else {
            socket.emit('error', 'Room not found or full');
        }
    });

    // Handle player ready state
    socket.on('playerReady', ({ roomCode, playerName, avatar }) => {
        if (rooms[roomCode]) {
            const player = rooms[roomCode].players.find(p => p.id === socket.id);
            if (player) {
                player.ready = true;
                player.playerName = playerName;
                player.avatar = avatar;

                // Tell other player about readiness
                socket.to(roomCode).emit('opponentReady', { playerName, avatar });

                const allReady = rooms[roomCode].players.every(p => p.ready);
                if (allReady && rooms[roomCode].players.length === 2) {
                    rooms[roomCode].gameState = 'playing';
                    // Send player data to both clients to initialize UI
                    io.to(roomCode).emit('startGame', { players: rooms[roomCode].players });
                }
            }
        }
    });

    // Sync aim angle
    socket.on('aimAngle', ({ roomCode, angle }) => {
        socket.to(roomCode).emit('updateAim', { angle });
    });

    // Sync shooting
    socket.on('shoot', ({ roomCode, power, angle }) => {
        socket.to(roomCode).emit('playerShot', { power, angle });
    });

    // Sync points update
    socket.on('updateScore', ({ roomCode, score }) => {
        socket.to(roomCode).emit('opponentScore', { score });
    });

    // Ready for next round
    socket.on('nextRoundReady', (roomCode) => {
        if (rooms[roomCode]) {
            const player = rooms[roomCode].players.find(p => p.id === socket.id);
            if (player) {
                player.roundReady = true;
                const allReady = rooms[roomCode].players.every(p => p.roundReady);
                if (allReady && rooms[roomCode].players.length === 2) {
                    rooms[roomCode].players.forEach(p => p.roundReady = false);
                    io.to(roomCode).emit('startNextRound');
                }
            }
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Find if user was in any room and clean up
        for (const [roomCode, room] of Object.entries(rooms)) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomCode).emit('playerLeft');
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
