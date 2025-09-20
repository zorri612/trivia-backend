import express from "express";
import { MongoClient, ObjectId} from "mongodb";
import http from "http";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.js";
import dotenv from "dotenv";
dotenv.config();
import { Game } from "./models/Game.js";
import { getDB } from "./db.js";
import { Question } from "./models/Question.js";
import gamesRoutes from "./routes/games.js";
import adminRoutes from "./routes/admin.js";
import cors from "cors";
import adminDashboardRoutes from "./routes/adminDashboard.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // luego restringimos
  },
});

const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI;

// Middlewares
app.use(express.json());

// ✅ Configuración de CORS
app.use(cors({
  origin: "https://trivia-front-web.vercel.app/",  // el puerto de tu frontend
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// Rutas básicas
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Backend Trivia funcionando 🚀" });
});
app.use("/api/auth", authRoutes);
app.use("/api/games", gamesRoutes);
app.use("/api/admin", adminRoutes);
app.use(cors({
  origin: "https://trivia-front-web.vercel.app/", // el puerto donde corre tu React (Vite por defecto es 5173)
  credentials: true
}));
app.use(express.json());

app.use("/api/admin", adminDashboardRoutes);

// Conexión a Mongo y arranque del server
async function start() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    console.log("✅ Conectado a MongoDB");

    const db = client.db("trivia");
    app.locals.db = db;
    Game.init(db); // 🔥 Inicializamos el modelo con la DB
    Question.init(db); // 🔥 inicializamos el modelo de preguntas


    // jugadores en espera (simple, en memoria)
    let waitingPlayers = [];
    const questionTimers = {};

// normaliza cadenas (quita acentos y compara en minúsculas)
function normalizeStr(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
    

    io.on("connection", (socket) => {
  console.log("🟢 Cliente conectado:", socket.id);

  socket.on("join-lobby", async (user) => {
    waitingPlayers.push({ socketId: socket.id, ...user });
    console.log("Jugador en lobby:", user.username);

    // 🔥 Notificar a todos los clientes el estado actual del lobby
  io.emit("lobby-update", waitingPlayers);

    if (waitingPlayers.length === 5) {
      const players = waitingPlayers.map((p) => ({
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        status: "alive",
      }));

      // Crear partida
      const gameId = await Game.create(players);

      // unir sockets a la sala
      players.forEach((p) => {
        const playerSocket = io.sockets.sockets.get(p.socketId);
        if (playerSocket) {
          playerSocket.join(`game-${gameId}`);
        }
      });

      // notificar inicio
      io.to(`game-${gameId}`).emit("game-start", { gameId, players });

      // Enviar la primera pregunta
      await sendNextQuestion(gameId);

      waitingPlayers = [];
    }
  });

  socket.on("answer", async ({ gameId, questionId, option, optionIndex }) => {
  try {
    // 1) validar existencia de ronda activa y pregunta
    const round = currentRounds[gameId];
    if (!round) {
      socket.emit("answer-result", { error: "No hay ronda activa" });
      return;
    }

    // Verificar deadline
    if (round.deadline && Date.now() > round.deadline) {
      socket.emit("answer-result", { error: "time_expired" });
      return;
    }

    // proteger que el questionId coincida con la ronda activa
    if (String(round.questionId) !== String(questionId)) {
      socket.emit("answer-result", { error: "Pregunta no coincide con ronda activa" });
      return;
    }

    // 2) obtener partida y jugador
    const game = await Game.collection().findOne({ _id: new ObjectId(gameId) });
    if (!game) return;

    const player = game.players.find((p) => p.socketId === socket.id);
    if (!player) return;

    // si ya estaba eliminado, ignorar
    if (player.status !== "alive") {
      socket.emit("answer-result", { correct: false, reason: "eliminated" });
      return;
    }

    // 3) evitar respuestas duplicadas del mismo jugador en la misma ronda
    if (round.answers.some((a) => a.socketId === socket.id)) {
      socket.emit("answer-result", { error: "already_answered" });
      return;
    }

    // 4) obtener la pregunta real desde BD para comparar
    const questionDoc = await Question.collection().findOne({ _id: new ObjectId(questionId) });
    if (!questionDoc) return;

    // 5) Determinar optionIndex y optionText
    let chosenIndex = typeof optionIndex === "number" ? optionIndex : null;
    let chosenText = option ?? null;

    if (chosenIndex === null) {
      const foundIndex = (questionDoc.opciones || []).findIndex(
        (o) => normalizeStr(o) === normalizeStr(chosenText)
      );
      if (foundIndex !== -1) {
        chosenIndex = foundIndex;
        chosenText = questionDoc.opciones[foundIndex];
      } else {
        chosenIndex = 0;
        chosenText = chosenText || questionDoc.opciones[0];
      }
    } else {
      chosenText = questionDoc.opciones?.[chosenIndex] ?? chosenText;
    }

    // 6) Comparar con la respuesta correcta
    let isCorrect = false;
    if (typeof questionDoc.respuesta === "number") {
      isCorrect = questionDoc.respuesta === chosenIndex;
    } else if (typeof questionDoc.respuesta === "string") {
      isCorrect = normalizeStr(questionDoc.respuesta) === normalizeStr(chosenText);
    } else if (typeof questionDoc.respuestaCorrecta === "number") {
      isCorrect = questionDoc.respuestaCorrecta === chosenIndex;
    } else if (typeof questionDoc.respuestaCorrecta === "string") {
      isCorrect = normalizeStr(questionDoc.respuestaCorrecta) === normalizeStr(chosenText);
    } else {
      const correctIdx = (questionDoc.opciones || []).findIndex(
        (o) => normalizeStr(o) === normalizeStr(chosenText)
      );
      isCorrect =
        correctIdx !== -1 &&
        normalizeStr(questionDoc.opciones[correctIdx]) === normalizeStr(chosenText);
    }

    // 7) guardar respuesta en la ronda en memoria
    round.answers.push({
      socketId: socket.id,
      userId: player.userId || null,
      username: player.username || null,
      optionIndex: chosenIndex,
      option: chosenText,
      correct: !!isCorrect,
      timestamp: new Date(),
    });

    // 8) actualizar estado y puntaje en DB en un solo paso
    const newStatus = isCorrect ? "alive" : "eliminated";
    const incScore = isCorrect ? 1 : 0;

    await Game.collection().updateOne(
      { _id: new ObjectId(gameId), "players.socketId": socket.id },
      {
        $set: { "players.$.status": newStatus },
        ...(isCorrect ? { $inc: { "players.$.score": incScore } } : {}),
      }
    );

    // recargar jugadores actualizados
    const updatedGame = await Game.collection().findOne({ _id: new ObjectId(gameId) });
    const updatedPlayers = updatedGame.players;

    // 9) emitir resultados parciales
    socket.emit("answer-result", { correct: !!isCorrect });
    io.to(`game-${gameId}`).emit("round-update", {
      players: updatedPlayers,
      answeredBy: socket.id,
      correct: !!isCorrect,
    });

    // notificar eliminación si corresponde
    if (!isCorrect) {
      socket.emit("eliminated");
    }

    // 10) Si todos respondieron → terminar ronda
    const expected = round.expectedRespondents || [];
    const answeredSocketIds = round.answers.map((a) => a.socketId);
    const allAnswered = expected.every((sid) => answeredSocketIds.includes(sid));

    if (allAnswered) {
      if (questionTimers[gameId]) {
        clearTimeout(questionTimers[gameId]);
        delete questionTimers[gameId];
      }

      await endRound(gameId);

      const postGame = await Game.collection().findOne({ _id: new ObjectId(gameId) });
      if (!postGame) return;
      const aliveAfter = postGame.players.filter((p) => p.status === "alive");

      if (aliveAfter.length > 1) {
        await sendNextQuestion(gameId);
      } else if (aliveAfter.length === 1) {
        const winner = aliveAfter[0];
        await Game.collection().updateOne(
          { _id: new ObjectId(gameId) },
          { $set: { status: "finished", winner: winner.username } }
        );
        io.to(`game-${gameId}`).emit("game-over", { winner });
      } else {
        await Game.collection().updateOne(
          { _id: new ObjectId(gameId) },
          { $set: { status: "finished", winner: null } }
        );
        io.to(`game-${gameId}`).emit("game-over", { winner: null });
        io.in(`game-${gameId}`).socketsLeave(`game-${gameId}`);
      }
    }
  } catch (err) {
    console.error("❌ Error en answer handler:", err);
  }
});




  socket.on("disconnect", () => {
    console.log("🔴 Cliente desconectado:", socket.id);
    waitingPlayers = waitingPlayers.filter((p) => p.socketId !== socket.id);

    // 🔥 Actualizar a los demás
  io.emit("lobby-update", waitingPlayers);
  });
});

/**
 * 📌 Función para mandar la siguiente pregunta a la sala
 */
let currentRounds = {}; 

// 🔥 Función para mandar pregunta con timeout
async function sendNextQuestion(gameId) {
  const nextQuestion = await Question.getRandom();
  if (!nextQuestion) return;

  const game = await Game.collection().findOne({ _id: new ObjectId(gameId) });
  if (!game || game.status !== "playing") return;

  // lista de jugadores vivos
  const alivePlayers = game.players.filter((p) => p.status === "alive");
  if (alivePlayers.length <= 1) return; // aquí se manejará ganador o empate en otra función

  const deadline = Date.now() + 15000; // 15s

  currentRounds[gameId] = {
    questionId: nextQuestion._id,
    enunciado: nextQuestion.enunciado,
    categoria: nextQuestion.categoria,
    answers: [],
    expectedRespondents: alivePlayers.map((p) => p.socketId),
    deadline,
  };

  // enviar SOLO a jugadores vivos
  for (const p of alivePlayers) {
    const s = io.sockets.sockets.get(p.socketId);
    if (s) {
      s.emit("new-question", {
        gameId,
        questionId: nextQuestion._id,
        enunciado: nextQuestion.enunciado,
        opciones: nextQuestion.opciones,
        deadline,
      });
    }
  }

  // limpiar timer anterior si existe
  if (questionTimers[gameId]) {
    clearTimeout(questionTimers[gameId]);
  }

  // programar cierre de ronda
  questionTimers[gameId] = setTimeout(async () => {
    await endRound(gameId);

    const updatedGame = await Game.collection().findOne({ _id: new ObjectId(gameId) });
    if (!updatedGame) return;

    const stillAlive = updatedGame.players.filter((p) => p.status === "alive");

    if (stillAlive.length === 1) {
      const winner = stillAlive[0];
      await Game.collection().updateOne(
        { _id: new ObjectId(gameId) },
        { $set: { status: "finished", winner: winner.username } }
      );
      io.to(`game-${gameId}`).emit("game-over", { winner });
    } else if (stillAlive.length > 1) {
      await sendNextQuestion(gameId);
    } else {
      // empate: todos eliminados
      await Game.collection().updateOne(
        { _id: new ObjectId(gameId) },
        { $set: { status: "finished", winner: null } }
      );
      io.to(`game-${gameId}`).emit("game-over", { winner: null });
    }
  }, 15000);
}



async function endRound(gameId) {
  const round = currentRounds[gameId];
  if (!round) return;

  // Guardar la ronda completa en la partida
  await Game.collection().updateOne(
    { _id: new ObjectId(gameId) },
    { $push: { rounds: round } }
  );

  // emitir a la sala que la ronda terminó
  io.to(`game-${gameId}`).emit("round-ended", round);

  // limpiar memoria y timer
  delete currentRounds[gameId];
  if (questionTimers[gameId]) {
    clearTimeout(questionTimers[gameId]);
    delete questionTimers[gameId];
  }

  console.log("✅ Ronda guardada y finalizada para juego:", gameId);
}


// 🔥 Manejo del fin de ronda
async function handleRoundEnd(gameId, players) {
    const alivePlayers = players.filter((p) => p.status === "alive");

    if (alivePlayers.length === 1) {
        const winner = alivePlayers[0];
        await Game.collection().updateOne(
            { _id: new ObjectId(gameId) },
            { $set: { status: "finished", winner: winner.username } }
        );

        io.to(`game-${gameId}`).emit("game-over", { winner });
        return;
    }

    if (alivePlayers.length > 1) {
        // Reiniciar "answered"
        await Game.collection().updateOne(
            { _id: new ObjectId(gameId) },
            { $set: { "players.$[].answered": false } }
        );
        await sendQuestion(gameId);
    }
}



    server.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Error al conectar con Mongo:", err);
    process.exit(1);
  }
}

start();
