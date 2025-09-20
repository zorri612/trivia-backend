import express from "express";
import { Game } from "../models/Game.js";

const router = express.Router();

// 📊 Estadísticas generales
router.get("/stats", async (req, res) => {
  try {
    // total de partidas
    const totalGames = await Game.collection().countDocuments();

    // partidas finalizadas
    const finishedGames = await Game.collection().countDocuments({ status: "finished" });

    // últimas 5 partidas
    const lastGames = await Game.collection()
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    res.json({
      totalGames,
      finishedGames,
      lastGames,
    });
  } catch (err) {
    console.error("❌ Error en /stats:", err);
    res.status(500).json({ error: "Error obteniendo estadísticas" });
  }
});

// 📌 Ranking de jugadores top
router.get("/top-players", async (req, res) => {
  try {
    const topPlayers = await Game.collection().aggregate([
      { $unwind: "$players" }, // separar cada jugador
      { $match: { "players.score": { $gt: 0 } } }, // solo los que jugaron
      {
        $group: {
          _id: "$players.username",
          totalPoints: { $sum: "$players.score" },
          gamesPlayed: { $sum: 1 },
          gamesWon: {
            $sum: {
              $cond: [{ $eq: ["$winner", "$players.username"] }, 1, 0],
            },
          },
        },
      },
      { $sort: { totalPoints: -1 } }, // ordenar por puntos
      { $limit: 10 },
    ]).toArray();

    res.json(topPlayers);
  } catch (err) {
    console.error("❌ Error top-players:", err);
    res.status(500).json({ error: "Error obteniendo ranking" });
  }
});
// 📌 Estadísticas extra: duración y rondas promedio
router.get("/extra-stats", async (req, res) => {
  try {
    const games = await Game.collection().find({ status: "finished" }).toArray();

    if (!games.length) {
      return res.json({
        avgDuration: 0,
        avgRounds: 0,
      });
    }

    // duración = última ronda.timestamp - createdAt
    const durations = games.map((g) => {
      const start = new Date(g.createdAt).getTime();
      let end = start;

      if (g.rounds && g.rounds.length > 0) {
        const lastRound = g.rounds[g.rounds.length - 1];
        const lastAnswer = lastRound.answers?.[lastRound.answers.length - 1];
        if (lastAnswer?.timestamp) {
          end = new Date(lastAnswer.timestamp).getTime();
        }
      }

      return (end - start) / 1000; // en segundos
    });

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const avgRounds =
      games.reduce((a, g) => a + (g.rounds?.length || 0), 0) / games.length;

    res.json({
      avgDuration: Number(avgDuration.toFixed(2)),
      avgRounds: Number(avgRounds.toFixed(2)),
    });
  } catch (err) {
    console.error("❌ Error en extra-stats:", err);
    res.status(500).json({ error: "Error obteniendo extra stats" });
  }
});


export default router;
