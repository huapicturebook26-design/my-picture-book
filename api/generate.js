export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text } = req.body || {};
    if (!text) {
        return res.status(400).json({ error: 'Missing text parameter' });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const FAL_API_KEY = process.env.FAL_API_KEY;

    if (!GEMINI_API_KEY || !FAL_API_KEY) {
        return res.status(500).json({ error: "伺服器缺少 GEMINI_API_KEY 或 FAL_API_KEY" });
    }

    try {
        const systemPrompt = `你是一個印象派繪本 Prompt 轉換器。請將使用者輸入的中文語音：「${text}」精準翻譯並提取出主體與動作，轉換成詳細的英文繪圖 Prompt。
風格必須包含：Claude Monet style impressionist oil painting, visible brushstrokes, vibrant sunlight, soft pastel colors, dreamy background, children's storybook illustration.
請只回傳最終英文文字，不要有任何中文解釋或額外標點。`;

        // 優先使用 gemini-3.8-flash，若塞車則自動切換至 gemini-flash
        const modelsToTry = [
            'gemini-3.8-flash',
            'gemini-flash'
        ];

        let finalPrompt = "";
        let geminiErrorDetails = null;

        for (const modelName of modelsToTry) {
            try {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
                const geminiRes = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: systemPrompt }] }]
                    })
                });

                const geminiData = await geminiRes.json();

                if (geminiRes.ok && geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
                    finalPrompt = geminiData.candidates[0].content.parts[0].text.trim();
                    console.log(`成功透過 ${modelName} 取得 Prompt:`, finalPrompt);
                    break; // 成功取得翻譯即跳出
                } else {
                    geminiErrorDetails = geminiData;
                    console.warn(`模型 ${modelName} 呼叫失敗，嘗試下一個備用模型...`);
                }
            } catch (err) {
                console.warn(`模型 ${modelName} 網路請求失敗:`, err);
            }
        }

        // 若兩個 Gemini 模型都因流量極高而無法連線，回傳明確提示
        if (!finalPrompt) {
            return res.status(503).json({ 
                error: "Gemini 伺服器目前極度忙碌中，請稍後再試一次！", 
                raw: geminiErrorDetails 
            });
        }

        // 2. 將 Gemini 翻譯好的精準英文 Prompt 傳給 Fal.ai 生圖
        const falRes = await fetch("https://fal.run/fal-ai/flux/schnell", {
            method: "POST",
            headers: {
                "Authorization": `Key ${FAL_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                prompt: finalPrompt,
                image_size: "square_hd",
                num_inference_steps: 4
            })
        });

        const falData = await falRes.json();

        if (!falRes.ok || !falData.images || !falData.images[0]?.url) {
            console.error("Fal.ai Error:", falData);
            return res.status(500).json({ error: "Fal.ai 生圖失敗", raw: falData });
        }

        return res.status(200).json({ 
            imageUrl: falData.images[0].url, 
            prompt: finalPrompt 
        });

    } catch (error) {
        console.error("Server Internal Error:", error);
        return res.status(500).json({ error: error.message });
    }
}
