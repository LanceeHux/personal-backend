function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://lanceehux.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question, correctAnswer, selectedAnswer } = req.body || {};

    if (!question || !correctAnswer || !selectedAnswer) {
      return res.status(400).json({
        error: "question, correctAnswer, and selectedAnswer are required."
      });
    }

    const correct = normalizeText(correctAnswer);
    const selected = normalizeText(selectedAnswer);
    const isCorrect = selected === correct;

    return res.status(200).json({
      score: isCorrect ? 100 : 0,
      verdict: isCorrect ? "Correct" : "Incorrect",
      feedback: isCorrect
        ? "You selected the correct answer."
        : "That choice is related, but it is not the best answer."
    });
  } catch (error) {
    console.error("check-answer-v2 error:", error);
    return res.status(500).json({
      error: "Failed to check answer."
    });
  }
};
