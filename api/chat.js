export default async function handler(req, res) {

    if (req.method !== "POST") {

        return res.status(405).json({
            error: "Only POST requests are allowed"
        });

    }

    try {

        const {
            message,
            memory
        } = req.body || {};

        if (!message) {

            return res.status(400).json({
                error: "No message received"
            });

        }

        const apiKey =
            process.env.GROQ_API_KEY;

        if (!apiKey) {

            return res.status(500).json({
                error: "GROQ_API_KEY is missing"
            });

        }

        const systemPrompt = `
أنت AyAI.

أنت مساعد شخصي ذكي ومتقدم.

تحدث بالعربية العراقية بشكل طبيعي عندما يناسب السياق.

كن واضحاً ومختصراً في الأسئلة البسيطة.

في الأسئلة المعقدة قدم إجابة منظمة.

لديك ذاكرة محادثة يرسلها النظام لك.

لا تدّعي أنك عدلت كوداً أو نفذت تغييراً في النظام.

إذا طلب المستخدم منك تطوير نفسك أو تعديل كودك،
فلا تنفذ التطوير هنا.

بدلاً من ذلك أخبر النظام أن الطلب هو Development Request
ليتم التعامل معه بواسطة نظام التطوير والموافقة.

ذاكرة المحادثة:

${memory || "لا توجد ذاكرة سابقة."}
`;

        const groqResponse =
            await fetch(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${apiKey}`
                    },

                    body: JSON.stringify({

                        model:
                            "llama-3.3-70b-versatile",

                        messages: [

                            {
                                role: "system",
                                content:
                                    systemPrompt
                            },

                            {
                                role: "user",
                                content:
                                    message
                            }

                        ],

                        temperature: 0.7,

                        max_completion_tokens:
                            1200

                    })
                }
            );

        const result =
            await groqResponse.json();

        if (!groqResponse.ok) {

            return res.status(
                groqResponse.status
            ).json({

                error:
                    result?.error?.message ||
                    "Groq request failed"

            });

        }

        const answer =
            result?.choices?.[0]?.message?.content;

        if (!answer) {

            return res.status(500).json({
                error:
                    "Groq returned no answer"
            });

        }

        return res.status(200).json({

            answer:
                answer.trim()

        });

    } catch (error) {

        console.error(
            "AyAI Chat API:",
            error
        );

        return res.status(500).json({

            error:
                error.message ||
                "Server error"

        });

    }

}
