// socketTest.js
import { io } from "socket.io-client";

const socket = io("http://localhost:4000"); // cambia el puerto si es diferente

socket.on("connect", () => {
  console.log("✅ Conectado al servidor con id:", socket.id);

  // Emitir respuesta de un jugador
  socket.emit("answer", {
    gameId: "68bbcb3a849d3f3327537cde", // el id del juego que viste en GET
    userId: "215",
    username: "Jugador_637",
    answer: "1969"
  });
});
