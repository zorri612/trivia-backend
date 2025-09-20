// socketTest-multi.js
import { io } from "socket.io-client";

const SERVER_URL = "http://localhost:4000";
const NUM_PLAYERS = 5;

// Lista de jugadores simulados
const players = Array.from({ length: NUM_PLAYERS }, (_, i) => ({
  userId: `${Math.floor(Math.random() * 1000)}`,
  username: `Jugador_${Math.floor(Math.random() * 1000)}`,
}));

players.forEach((player) => {
  const socket = io(SERVER_URL);

  socket.on("connect", () => {
    console.log(`✅ ${player.username} conectado con id: ${socket.id}`);
    socket.emit("join-lobby", player);
  });

  socket.on("game-start", ({ gameId }) => {
    console.log(`🎉 ${player.username} está en la partida ${gameId}`);
  });

  socket.on("new-question", ({ gameId, questionId, enunciado, opciones }) => {
  console.log(`❓ ${player.username} recibió: ${enunciado}`);

  setTimeout(() => {
    const idx = Math.floor(Math.random() * opciones.length); // elige índice aleatorio
    const opt = opciones[idx];
    console.log(`➡️ ${player.username} responde (idx ${idx}): ${opt}`);
    socket.emit("answer", { gameId, questionId, option: opt, optionIndex: idx });
  }, 2000 + Math.floor(Math.random() * 3000)); // responder entre 2s y 5s
});


  socket.on("answer-result", ({ correct }) => {
    console.log(
      `📢 ${player.username} recibió resultado: ${correct ? "✅ Correcto" : "❌ Incorrecto"}`
    );
  });

  socket.on("round-update", ({ players }) => {
    console.log("🔄 Estado de jugadores:", players);
  });

  socket.on("game-over", ({ winner }) => {
    console.log(`🏆 Ganador: ${winner.username}`);
    io.in(`game-${gameId}`).socketsLeave(`game-${gameId}`);
    socket.disconnect();
  });
});
