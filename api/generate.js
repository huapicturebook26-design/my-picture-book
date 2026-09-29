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
        const promptText = `你是一個印象派繪本 Prompt 轉換器。請將使用者輸入的中文語音：「${text}」提取出主體與動作，翻譯成英文，並強制結合莫內印象派風格。
請輸出為標準 Prompt，格式必須包含：
"Claude Monet style impressionist oil painting, visible brushstrokes, vibrant sunlight, soft pastel colors, dreamy background, children's storybook illustration."
請只回傳最終的英文 Prompt 文字，不要加任何其他標點或解釋。`;

        // 改用 v1 正式版 API 端點，解決 404 NOT_FOUND 問題
        const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const geminiData = await geminiRes.json();
        
        if (!geminiRes.ok || !geminiData.candidates || !geminiData.candidates[0]?.content?.parts?.[0]?.text) {
            console.error("Gemini 詳細錯誤:", JSON.stringify(geminiData));
            return res.status(500).json({ error: "Gemini API 解析失敗", raw: geminiData });
        }

        const finalPrompt = geminiData.candidates[0].content.parts[0].text.trim();
        console.log("生成的 Prompt:", finalPrompt);

        // 呼叫 Fal.ai 生圖
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
            console.error("Fal.ai 詳細錯誤:", JSON.stringify(falData));
            return res.status(500).json({ error: "Fal.ai 生圖失敗", raw: falData });
        }

        return res.status(200).json({ imageUrl: falData.images[0].url, prompt: finalPrompt });

    } catch (error) {
        console.error("伺服器端錯誤:", error);
        return res.status(500).json({ error: error.message });
    }
}
