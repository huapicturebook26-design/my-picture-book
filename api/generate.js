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

    const stylePrefix = "Claude Monet style impressionist oil painting, visible brushstrokes, vibrant sunlight, soft pastel colors, dreamy background, children's storybook illustration";
    let finalPrompt = "";

    try {
        // 第一順位：嘗試使用 Gemini 進行精準翻譯與風格延伸
        const promptText = `你是一個印象派繪本 Prompt 轉換器。請將使用者輸入的中文：「${text}」翻譯成英文，並提取出主體與動作。
請結合以下風格：${stylePrefix}。
請只回傳最終英文繪圖 Prompt，不要加任何其他標點或解釋。`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const geminiData = await geminiRes.json();

        if (geminiRes.ok && geminiData.candidates?.[0]?.content?.parts?.[0]?.text) {
            finalPrompt = geminiData.candidates[0].content.parts[0].text.trim();
            console.log("Gemini 翻譯成功:", finalPrompt);
        } else {
            // 第二順位：Gemini 塞車時，自動使用 MyMemory 翻譯 API 將中文轉為英文
            console.warn("Gemini 忙碌，切換至自動翻譯備援流程...", geminiData);
            const translateUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-TW|en`;
            const transRes = await fetch(translateUrl);
            const transData = await transRes.json();

            const translatedText = transData.responseData?.translatedText || text;
            finalPrompt = `${translatedText}, ${stylePrefix}`;
            console.log("備援翻譯成功:", finalPrompt);
        }

        // 2. 將精準翻譯後的英文 Prompt 傳給 Fal.ai 生圖
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
