export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const {
      question,
      answerIdea,
      sourceBasis,
      userAnswer
    } = req.body;

    const prompt = [
      {
        role: "system",
        content: "You grade a student's answer compared to a concept from study material. Return JSON only."
      },
      {
        role: "user",
        content: `
Evaluate the student's answer.

QUESTION:
${question}

EXPECTED IDEA:
${answerIdea}

SOURCE CONTEXT:
${sourceBasis}

STUDENT ANSWER:
${userAnswer}

Return JSON:

{
 "score": number 0-100,
 "verdict": "correct | partially_correct | incorrect",
 "feedback": "...",
 "missed_points": [],
 "strong_points": [],
 "corrected_answer": "..."
}
`
      }
    ];

    const groq = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: prompt,
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: "json_object" }
      })
    });

    const data = await groq.json();

    const content = data.choices[0].message.content;

    res.status(200).json(JSON.parse(content));

  } catch (err) {

    res.status(500).json({ error: err.message });

  }
}
