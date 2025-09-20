import { connectDB } from "../db.js";

async function seedQuestions() {
  const db = await connectDB();
  const questions = db.collection("questions");

  // Eliminamos las previas para no duplicar
  await questions.deleteMany({});

  // Insertamos unas preguntas de ejemplo
  await questions.insertMany([
    {
      enunciado: "¿Cuál es la capital de Francia?",
      opciones: ["Madrid", "París", "Berlín", "Roma"],
      respuestaCorrecta: "París",
      categoria: "Geografía",
    },
    {
      enunciado: "¿Quién pintó la Mona Lisa?",
      opciones: ["Van Gogh", "Da Vinci", "Picasso", "Rembrandt"],
      respuestaCorrecta: "Da Vinci",
      categoria: "Arte",
    },
    {
      enunciado: "¿En qué año llegó el hombre a la luna?",
      opciones: ["1965", "1969", "1972", "1959"],
      respuestaCorrecta: "1969",
      categoria: "Historia",
    },
  ]);

  console.log("✅ Preguntas insertadas correctamente");
  process.exit();
}

seedQuestions();
