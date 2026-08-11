export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Only POST requests are allowed"
    });
  }

  try {
    const { message } = req.body || {};

    if (!message) {
      return res.status(400).json({
        error: "No message received"
      });
    }

    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GROQ_API_KEY is missing"
      });
    }

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "أنت AyAI، مساعد شخصي ذكي. تحدث بالعربية العراقية بشكل طبيعي وواضح. أجب عن سؤال المستخدم مباشرة وباختصار مفيد."
            },
            {
              role: "user",
              content: message
            }
          ],
          temperature: 0.7,
          max_completion_tokens: 1024
        })
      }
    );

    const result = await groqResponse.json();

    if (!groqResponse.ok) {
      return res.status(groqResponse.status).json({
        error: result?.error?.message || "Groq request failed"
      });
    }

    const answer = result?.choices?.[0]?.message?.content;

    if (!answer) {
      return res.status(500).json({
        error: "Groq returned no answer"
      });
    }

    return res.status(200).json({
      answer: answer
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message || "Server error"
    });
  }
}
