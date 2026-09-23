require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(express.static('public'));

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const gameRooms = new Map();
const playerRoomMap = new Map();

const questions = require('./data/questions.json');

function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function calculateScore(isCorrect, timeTakenMs, totalTimeLimitMs = 15000) {
  if (!isCorrect) return 0;
  const timeRemaining = Math.max(0, totalTimeLimitMs - timeTakenMs);
  const speedBonus = Math.round((timeRemaining / totalTimeLimitMs) * 500);
  const baseScore = 500;
  return baseScore + speedBonus;
}

function validateAnswer(selectedOption, currentQuestionIndex, questions) {
  if (currentQuestionIndex < 0 || currentQuestionIndex >= questions.length) {
    return false;
  }
  return selectedOption === questions[currentQuestionIndex].correct;
}

function getLeaderboard(room) {
  return Object.values(room.players)
    .sort((a, b) => b.score - a.score)
    .map((player, index) => ({
      name: player.name,
      score: player.score,
      rank: index + 1
    }));
}

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('quiz:create', ({ hostName, category }) => {
    let pin;
    do {
      pin = generatePin();
    } while (gameRooms.has(pin));

    const room = {
      pin,
      hostId: socket.id,
      hostName,
      category,
      players: {},
      currentQuestionIndex: -1,
      questionStartTime: null,
      timer: null,
      answersReceived: new Set(),
      gameState: 'lobby'
    };

    gameRooms.set(pin, room);
    playerRoomMap.set(socket.id, { pin, role: 'host' });

    socket.join(pin);

    socket.emit('quiz:created', { pin, roomId: pin });
    console.log(`Room created with PIN: ${pin} by ${hostName}`);
  });

  socket.on('quiz:join', ({ pin, playerName }) => {
    const room = gameRooms.get(pin);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found. Check the PIN.' });
      return;
    }

    if (room.gameState !== 'lobby') {
      socket.emit('error', { message: 'Game already in progress.' });
      return;
    }

    if (Object.values(room.players).some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      socket.emit('error', { message: 'Player name already taken.' });
      return;
    }

    const player = {
      id: socket.id,
      name: playerName,
      score: 0,
      lastAnswer: null,
      lastAnswerTime: null
    };

    room.players[socket.id] = player;
    playerRoomMap.set(socket.id, { pin, role: 'player' });

    socket.join(pin);

    socket.emit('quiz:joined', { pin, playerName });
    
    const playersArray = Object.values(room.players).map(p => ({ name: p.name, score: p.score }));
    io.to(pin).emit('lobby:update', { players: playersArray });
    console.log(`Player ${playerName} joined room ${pin}`);
  });

  socket.on('quiz:start', ({ pin }) => {
    const room = gameRooms.get(pin);
    if (!room || room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only host can start the quiz.' });
      return;
    }

    room.gameState = 'playing';
    room.currentQuestionIndex = -1;

    startNextQuestion(room);
  });

  function startNextQuestion(room) {
    room.currentQuestionIndex++;
    room.answersReceived.clear();

    if (room.currentQuestionIndex >= questions.length) {
      endQuiz(room);
      return;
    }

    const question = questions[room.currentQuestionIndex];
    room.questionStartTime = Date.now();

    const questionData = {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: questions.length,
      question: question.question,
      options: question.options,
      timeLimitSeconds: 15
    };

    io.to(room.pin).emit('question:start', questionData);

    if (room.timer) {
      clearTimeout(room.timer);
    }

    room.timer = setTimeout(() => {
      handleTimeUp(room);
    }, 15000);
  }

  function handleTimeUp(room) {
    const question = questions[room.currentQuestionIndex];
    
    io.to(room.pin).emit('question:time_up', {
      correctOption: question.correct,
      explanation: question.explanation
    });

    const leaderboard = getLeaderboard(room);
    io.to(room.pin).emit('leaderboard:update', { leaderboard });

    setTimeout(() => {
      startNextQuestion(room);
    }, 3000);
  }

  socket.on('answer:submit', ({ pin, selectedOption, timeTakenMs }) => {
    const room = gameRooms.get(pin);
    if (!room || room.gameState !== 'playing') {
      socket.emit('error', { message: 'Invalid submission.' });
      return;
    }

    if (room.answersReceived.has(socket.id)) {
      return;
    }

    if (!room.questionStartTime) return;

    const actualTimeTaken = Date.now() - room.questionStartTime;
    const validatedTimeTaken = Math.min(Math.max(timeTakenMs, actualTimeTaken), 15000);

    const question = questions[room.currentQuestionIndex];
    const isCorrect = selectedOption === question.correct;

    const player = room.players[socket.id];
    if (player) {
      const score = calculateScore(isCorrect, validatedTimeTaken);
      player.score += score;
      player.lastAnswer = selectedOption;
      player.lastAnswerTime = validatedTimeTaken;

      socket.emit('answer:confirmed', {
        selectedOption,
        isCorrect,
        correctOption: question.correct,
        scoreEarned: score,
        totalScore: player.score
      });

      room.answersReceived.add(socket.id);

      if (room.answersReceived.size === Object.keys(room.players).length) {
        if (room.timer) {
          clearTimeout(room.timer);
        }
        handleTimeUp(room);
      }
    }
  });

  function endQuiz(room) {
    room.gameState = 'ended';
    
    const leaderboard = getLeaderboard(room);
    const winner = leaderboard[0];

    io.to(room.pin).emit('quiz:ended', {
      winner: winner,
      finalRanks: leaderboard
    });

    gameRooms.delete(room.pin);
  }

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    const playerInfo = playerRoomMap.get(socket.id);
    if (!playerInfo) return;

    const { pin, role } = playerInfo;
    const room = gameRooms.get(pin);

    if (role === 'host' && room) {
      if (room.timer) clearTimeout(room.timer);
      io.to(pin).emit('error', { message: 'Host disconnected. Game ended.' });
      gameRooms.delete(pin);
    } else if (role === 'player' && room) {
      delete room.players[socket.id];
      if (room.answersReceived) room.answersReceived.delete(socket.id);

      if (Object.keys(room.players).length > 0) {
        const playersArray = Object.values(room.players).map(p => ({ name: p.name, score: p.score }));
        io.to(pin).emit('lobby:update', { players: playersArray });
      } else if (room.gameState === 'playing') {
        if (room.timer) clearTimeout(room.timer);
        gameRooms.delete(pin);
      }
    }

    playerRoomMap.delete(socket.id);
  });

  socket.on('error', (err) => {
    console.error('Socket error:', err);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Quiz server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
});
