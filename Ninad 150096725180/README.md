# 🧠 Assignment 14: Real-Time Multiplayer Live Quiz Battle (Socket.io)
> **Track:** Backend & Real-Time Web | **Level:** Advanced | **Estimated Time:** 7–9 Hours  
> **Tech Stack:** Node.js, Express.js, Socket.io, In-Memory Game State Engine, CORS

---

## 📌 1. Objective & Overview

Build a high-stakes, interactive **Real-Time Multiplayer Trivia & Quiz Battle Arena** (similar to Kahoot / Quizizz) using **Socket.io** and **Express.js**. In this project, students will architect an authoritative game server that manages synchronized question countdown clocks, evaluates player answer submissions with speed-based score bonuses, and broadcasts live dynamic leaderboards across all connected participants.

### Key Learning Outcomes:
- Managing asymmetric roles in real-time rooms: **Quiz Host / Admin** vs **Players**.
- Synchronizing server-driven countdown timers and handling question transitions without client-side drift.
- Designing anti-cheat server validation: answers submitted after timer expiry are rejected.
- Calculating dynamic scoring algorithms based on answer correctness and millisecond response speed.
- Sorting, updating, and broadcasting live leaderboard rankings after every question round.

---

## 🛠️ 2. Tech Stack & Dependencies

```bash
# Initialize project
npm init -y

# Install dependencies
npm install express socket.io cors dotenv

# Install dev tools
npm install -D nodemon
```

---

## 🎮 3. Game Flow & State Machine

```
[Host Creates Room (PIN)] 
        ⬇
[Players Join Lobby via PIN] 
        ⬇
[Host Clicks "Start Game"] 
        ⬇
[Server Broadcasts Question & Starts 15s Timer] 
        ⬇
[Players Submit Answers (Calculates Speed Score)] 
        ⬇
[Timer Expires ➔ Server Reveals Correct Answer & Broadcasts Live Leaderboard] 
        ⬇
[Next Question or Final Winner Screen]
```

---

## 📡 4. Real-Time Socket Event Protocol

### 🎪 Lobby & Game Control

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `quiz:create` | `Host -> Server` | `{ "hostName": "Professor X", "category": "Tech" }` | Host initializes a quiz room, receives a 4-digit PIN |
| `quiz:created` | `Server -> Host` | `{ "pin": "8421", "roomId": "quiz_8421" }` | Sends PIN to the host |
| `quiz:join` | `Player -> Server` | `{ "pin": "8421", "playerName": "Karan" }` | Player enters lobby with PIN |
| `lobby:update` | `Server -> Room` | `{ "players": [{ "name": "Karan", "score": 0 }] }` | Broadcasts lobby roster as players join |
| `quiz:start` | `Host -> Server` | `{ "pin": "8421" }` | Host starts the quiz battle |

### ⏱️ Question Round & Live Gameplay

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `question:start` | `Server -> Room` | `{ "questionIndex": 1, "totalQuestions": 5, "question": "What is Node.js runtime based on?", "options": ["V8", "SpiderMonkey", "Chakra", "JVM"], "timeLimitSeconds": 15 }` | Broadcasted by server. Omits correct answer to prevent cheating! |
| `answer:submit` | `Player -> Server` | `{ "pin": "8421", "selectedOption": 0, "timeTakenMs": 3200 }` | Player submits chosen option |
| `question:time_up` | `Server -> Room` | `{ "correctOption": 0, "explanation": "Node.js is built on Google Chrome's V8 engine." }` | Server reveals correct answer |
| `leaderboard:update`| `Server -> Room` | `{ "leaderboard": [{ "rank": 1, "name": "Karan", "score": 1420 }] }` | Broadcasts sorted rankings |
| `quiz:ended` | `Server -> Room` | `{ "winner": { "name": "Karan", "score": 4850 }, "finalRanks": [...] }` | Emitted after last question |

---

## 🧮 5. Server-Side Scoring Algorithm

```javascript
// Score = Base (1000) * Speed Multiplier
function calculateScore(isCorrect, timeTakenMs, totalTimeLimitMs = 15000) {
  if (!isCorrect) return 0;
  
  const timeRemaining = Math.max(0, totalTimeLimitMs - timeTakenMs);
  const speedBonus = Math.round((timeRemaining / totalTimeLimitMs) * 500); // Up to 500 bonus points
  const baseScore = 500;
  
  return baseScore + speedBonus; // Total max 1000 points per question
}
```

---

## 🏗️ 6. Directory Structure

```text
assignment-14-quiz-socket/
├── public/
│   ├── index.html           # Host / Player entry portal
│   ├── host.html            # Host control screen with live question display
│   ├── player.html          # Mobile-friendly 4-color button answer grid
│   └── app.js               # Socket handlers
├── data/
│   └── questions.json       # Question bank
├── sockets/
│   ├── gameEngine.js        # Timers, round transitions & leaderboard sorting
│   └── lobbyHandler.js      # PIN generation & player joining
├── server.js
├── package.json
└── README.md
```

---

## 🧪 7. Testing & Verification Guide

1. Start the server on `http://localhost:5000`.
2. Open Host View on Tab 1 (`http://localhost:5000/host.html`). Click **Create Quiz** and note the 4-digit PIN.
3. Open Player View on Tab 2 and Tab 3 (`http://localhost:5000/player.html`). Enter PIN and join as "Player 1" and "Player 2".
4. From the Host screen, click **Start Game**.
5. Answer quickly on Player 1, and wait 10 seconds before answering on Player 2.
6. Verify Player 1 receives a higher score due to faster response speed bonus.
7. Verify neither player can submit an answer after the 15-second timer runs out.

---

## 📊 8. Grading Rubric (100 Marks)

| Evaluation Component | Marks |
|---|:---:|
| **Lobby & PIN-Based Multi-Player Room Management** | 25 |
| **Server-Controlled Synchronous Question Clocks & Timers** | 25 |
| **Speed-Based Dynamic Scoring & Anti-Cheat Validation** | 20 |
| **Real-Time Leaderboard Sorting & Rank Calculation** | 15 |
| **Dual Interface Polish (Host Dashboard & Player Game Pad)** | 15 |
| **Total Marks** | **100** |

---

## 📤 9. Submission Guidelines

- Submit your GitHub repository: `itm-assignment-14-quiz-socket`.
- Include sample questions in `data/questions.json` and a brief video demo of a 3-player battle.
