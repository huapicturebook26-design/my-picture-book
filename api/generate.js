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
        const promptText = `你是一個印象派繪本 Prompt 轉換器。請將使用者輸入的中文：「${text}」轉換成英文 Prompt，風格為：Claude Monet style impressionist oil painting, visible brushstrokes, vibrant sunlight, soft pastel colors, dreamy background, children's storybook illustration. 請只回傳最終英文文字。`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        let finalPrompt = "";

        // 嘗試呼叫 Gemini API (支援 1 次自動重試)
        for (let i = 0; i < 2; i++) {
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
                break; // 成功即跳出迴圈
            }

            // 如果遇到塞車且是第一次嘗試，等待 1 秒後重試
            if (i === 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            } else {
                // 若連兩次都塞車，使用安全備用 Prompt，確保生圖不中斷
                console.warn("Gemini 忙碌中，使用備用 Prompt:", geminiData);
                finalPrompt = `Claude Monet style impressionist oil painting of ${text}, visible brushstrokes, vibrant sunlight, soft pastel colors, dreamy background, children's storybook illustration`;
            }
        }

        // 2. 呼叫 Fal.ai 生圖
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
