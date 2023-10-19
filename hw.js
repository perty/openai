// This code is for v4 of the openai package: npmjs.com/package/openai
const OpenAI = require("openai").default;
const readline = require("readline");
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const chatWithGPT = async (messages = []) => {
    const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: messages,
        temperature: 0.5,
        max_tokens: 256,
    });

    const gptResponse = response.choices[0].message.content;
    console.log(`GPT: ${gptResponse}`);

    rl.question("You: ", (userInput) => {
        if (userInput.toLowerCase() === "exit") {
            rl.close();
            return;
        }
        messages.push({ role: "user", content: userInput });
        chatWithGPT(messages);
    });
};

console.log("Start chatting with GPT! (Type 'exit' to quit)");
rl.question("You: ", (userInput) => {
    if (userInput.toLowerCase() === "exit") {
        rl.close();
        return;
    }

    const messages = [{ role: "user", content: userInput }];
    chatWithGPT(messages);
});

rl.on("close", () => {
    console.log("Goodbye!");
    process.exit(0);
});
