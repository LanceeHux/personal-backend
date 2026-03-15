module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      question,
      correctAnswer,
      selectedAnswer
    } = req.body || {};

    if (!question || !correctAnswer || !selectedAnswer) {
      return res.status(400).json({
        error: "question, correctAnswer, and selectedAnswer are required."
      });
    }

    const isCorrect =
      String(selectedAnswer).trim() === String(correctAnswer).trim();

    return res.status(200).json({
      score: isCorrect ? 100 : 0,
      verdict: isCorrect ? "Correct" : "Incorrect",
      feedback: isCorrect
        ? "You selected the correct answer."
        : "That choice does not match the correct answer."
    });
  } catch (error) {
    console.error("check-answer error:", error);
    return res.status(500).json({
      error: "Failed to check answer."
    });
  }
};
