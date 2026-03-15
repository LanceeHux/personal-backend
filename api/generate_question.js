export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {

    const { text, difficulty, type } = req.body;

    const prompt = [
      {
        role: "system",
        content: "You generate study questions from learning material. Return only JSON."
      },
      {
        role: "user",
        content: `
Create ONE ${difficulty} ${type} question from the material.

Return JSON:

{
 "question": "...",
 "answer_idea": "...",
 "source_snippet": "...",
 "topic": "..."
}

SOURCE:
${text.slice(0,5000)}
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
        temperature: 0.6,
        max_tokens: 400,
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
