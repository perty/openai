const OpenAI = require("openai").default;
const readline = require("readline");
require('dotenv').config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
    const myAssistant = await openai.beta.assistants.create({
        instructions:
            "You are a personal math tutor. When asked a question, write and run Python code to answer the question.",
        name: "Math Tutor",
        tools: [{type: "code_interpreter"}],
        model: "gpt-4",
    });

    const aThread = await openai.beta.threads.create();

    const threadMessages = await openai.beta.threads.messages.create(
        aThread.id,
        {role: "user", content: "I need to solve the equation `3x + 11 = 14`. Can you help me?"}
    );

    const run = await openai.beta.threads.runs.create(
        aThread.id,
        {
            assistant_id: myAssistant.id,
            instructions: "Please address the user as Jane Doe. The user has a premium account."
        }
    );

    let run2;
    do {
        run2 = await openai.beta.threads.runs.retrieve(
            aThread.id,
            run.id
        );
    } while (run2.status === "in_progress")


    const messages = await openai.beta.threads.messages.list(
        aThread.id
    );

    for (d of messages.body.data.sort((a,b) => a.created_at - b.created_at)) {
        for (t of d.content) {
            console.log(t.text.value);
        }
    }
}

main();
