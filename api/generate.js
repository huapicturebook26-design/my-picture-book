export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { text } = req.body;
    if (!text) {
        return res.status(400).json({ error: 'Missing text parameter' });
    }

    // 從 Vercel 後台讀取環境變數 (外部完全看不到)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const FAL_API_KEY = process.env.FAL_API_KEY;

    try {
        // --- 1. 呼叫 Gemini 2.5 Flash (將中文轉成印象派英文 Prompt) ---
        const systemInstruction = `你是一個印象派繪本 Prompt 轉換器。請將使用者輸入的中文語音提取出主體與動作，翻譯成英文，並強制結合莫內印象派風格。
請輸出為標準 Prompt，格式必須包含：
"Claude Monet style impressionist oil painting, visible brushstrokes, vibrant sunlight, soft pastel colors, [使用者描述的主體英文], dreamy background, children's storybook illustration."
請只回傳最終的英文 Prompt 文字，不要加任何其他標點或解釋。`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text }] }]
            })
        });

        const geminiData = await geminiRes.json();
        const finalPrompt = geminiData.candidates[0].content.parts[0].text.trim();

        // --- 2. 呼叫 Fal.ai (Flux Fast 模型算圖) ---
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
        const imageUrl = falData.images[0].url;

        // 回傳圖片網址與 Prompt 給前端
        return res.status(200).json({ imageUrl, prompt: finalPrompt });

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: "伺服器處理失敗" });
    }
}
