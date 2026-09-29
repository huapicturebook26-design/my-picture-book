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
        return res.status(500).json({ error: "伺服器缺少 GEMINI_API_KEY 或 FAL_API_KEY 環境變數" });
    }

    try {
        const systemInstruction = `你是一個印象派繪本 Prompt 轉換器。請將使用者輸入的中文語音提取出主體與動作，翻譯成英文，並強制結合莫內印象派風格。
請輸出為標準 Prompt，格式必須包含：
"Claude Monet style impressionist oil painting, visible brushstrokes, vibrant sunlight, soft pastel colors, [使用者描述的主體英文], dreamy background, children's storybook illustration."
請只回傳最終的英文 Prompt 文字，不要加任何其他標點或解釋。`;

        // 使用通用穩定的 gemini-1.5-flash 模型名稱
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text }] }]
            })
        });

        const geminiData = await geminiRes.json();
        
        // 嚴謹檢查，避免讀取不到 [0] 導致伺服器崩潰
        if (!geminiData.candidates || !geminiData.candidates[0] || !geminiData.candidates[0].content) {
            console.error("Gemini 錯誤詳情:", JSON.stringify(geminiData));
            return res.status(500).json({ error: "Gemini 驗證失敗，請檢查 API Key 是否正確" });
        }

        const finalPrompt = geminiData.candidates[0].content.parts[0].text.trim();

        // 呼叫 Fal.ai
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

        if (!falData.images || !falData.images[0]) {
            console.error("Fal.ai 錯誤詳情:", JSON.stringify(falData));
            return res.status(500).json({ error: "Fal.ai 生成圖片失敗" });
        }

        return res.status(200).json({ imageUrl: falData.images[0].url, prompt: finalPrompt });

    } catch (error) {
        console.error("伺服器未知錯誤:", error);
        return res.status(500).json({ error: error.message });
    }
}
