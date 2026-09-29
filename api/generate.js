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

    // 奇幻風格前綴（當 Gemini 忙碌啟用備援翻譯時使用）
    const stylePrefix = "Claude Monet style impressionist oil painting, surreal fantasy creature, visible brushstrokes, vibrant magical lighting, soft pastel color palette, whimsical storybook illustration";
    let finalPrompt = "";

    try {
        // 【關鍵修改點】：強化奇幻生物「融合」與「特徵拼貼」的指令
        const systemPrompt = `你是一個印象派奇幻繪本 Prompt 轉換器。
請將使用者輸入的中文語音：「${text}」轉換成英文繪圖 Prompt。

【轉換規則】：
1. 如果使用者提到兩種以上的動物或物體（例如：章魚+貓），請務必將它們描述為「單一超現實混合生物（fantasy hybrid creature / surreal chimera）」，例如：「a creature with the head and upper body of a cat, fused seamlessly with tentacles of an octopus as its lower body」。
2. 強制結合莫內印象派與奇幻繪本風格。

【風格關鍵字】：
${stylePrefix}

請只回傳最終英文繪圖 Prompt，不要有任何中文解釋或標點。`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
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
            console.log("Gemini 奇幻翻譯成功:", finalPrompt);
        } else {
            // Gemini 塞車時，自動改用 MyMemory 備援翻譯
            console.warn("Gemini 忙碌，切換至自動翻譯備援流程...", geminiData);
            const translateUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=zh-TW|en`;
            const transRes = await fetch(translateUrl);
            const transData = await transRes.json();

            const translatedText = transData.responseData?.translatedText || text;
            finalPrompt = `A fantasy hybrid creature of ${translatedText}, ${stylePrefix}`;
            console.log("備援翻譯成功:", finalPrompt);
        }

        // 2. 將精準翻譯後的奇幻 Prompt 傳給 Fal.ai 生圖
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
