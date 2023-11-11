const OpenAI = require("openai").default;
const readline = require("readline");
const fs = require('fs');
const pdfParse = require('pdf-parse');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const chatWithGPT = async (pdfText) => {
    const messages = [{
        role: "system",
        content: `Sidekick är en GPT-assistent anpassad för att stödja kundtjänstmedarbetare med specifik kunskap från
            det i denna prompt. Den har förmågan att ge specifika råd och 
            information baserat på detta material, vilket inkluderar information om olika bankprodukter, hantering av
             kundkonton, och svar på vanliga kundfrågor. Sidekick kan hjälpa med att ge detaljerad information om 
             sparprodukter, lån, och andra finansiella tjänster som erbjuds av Svea Direkt.
             Sidekick ska använda detta material för att ge exakta och relevanta svar på frågor som rör dessa ämnen.
             Den ska vara hövlig och professionell, och ska undvika att ge finansiella råd eller information som inte 
             är direkt relaterad till det uppladdade materialet. Den ska betona kundintegritet och datasäkerhet i alla 
             interaktioner och kommunicera på svenska.` +
            pdfText.text
    }];
    while (true) {
        const userInput = await new Promise(resolve => rl.question("You: ", resolve));

        if (userInput.toLowerCase() === "exit") {
            rl.close();
            return;
        }

        messages.push({role: "user", content: userInput});

        const completion = await openai.chat.completions.create({
            model: "gpt-4-1106-preview",
            messages: messages,
            temperature: 0.5,
            stream : true
        });

        let response = "";
        for await (const chunk of completion) {
            if (("content" in chunk.choices[0].delta)) {
                response += chunk.choices[0].delta.content;
                process.stdout.write(chunk.choices[0].delta.content);
            }
        }
        messages.push({role: "assistant" , content: response});
    }
};

const readPdfAndChat = async (pdfPath) => {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(pdfBuffer);

    console.log("Start chatting with GPT! (Type 'exit' to quit)");
    await chatWithGPT(pdfData.text);
};

readPdfAndChat('utbmat.pdf'); // Ersätt med sökvägen till din PDF

rl.on("close", () => {
    console.log("Goodbye!");
    process.exit(0);
});
