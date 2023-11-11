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

rl.on("close", () => {
    console.log("Goodbye!");
    process.exit(0);
});

const systemPrompt = `
    Answer user questions by generating SQL queries against the 
    Chinook Music Database.
    `;

let databaseSchemaString = "";

const sqlite3 = require('sqlite3').verbose();

let conn = new sqlite3.Database('data/Chinook.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the Chinook database.');
    }
});

async function getTableNames(db) {
    const query = "SELECT name FROM sqlite_master WHERE type='table';";
    return new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const tableNames = rows.map(row => row.name);
                resolve(tableNames);
            }
        });
    });
}

async function getColumnNames(db, tableName) {
    const query = `PRAGMA table_info('${tableName}');`;
    return new Promise((resolve, reject) => {
        db.all(query, [], (err, rows) => {
            if (err) {
                reject(err);
            } else {
                const columnNames = rows.map(row => row.name);
                resolve(columnNames);
            }
        });
    });
}

async function getDatabaseInfo(db) {
    const tableNames = await getTableNames(db);
    return await Promise.all(tableNames.map(async (tableName) => {
        const columnNames = await getColumnNames(db, tableName);
        return {tableName, columnNames};
    }));
}

const databaseSchemaDict = getDatabaseInfo(conn);

databaseSchemaDict.forEach(table => {
    databaseSchemaString += `Table: ${table.table_name}\nColumns: ${table.column_names.join(', ')}\n`;
});

const tools = [
    {
        type: "function",
        function: {
            name: "ask_database",
            description: `
                Use this function to answer user questions about music.
                Input should be a fully formed SQL query.,
                `,
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: `
                        SQL query extracting info to answer the user's question.
                        SQL should be written using this database schema:
                        ${databaseSchemaString}
                        The query should be returned in plain text, not in JSON.
                        `,
                    }
                },
                required: ["query"],
            }
        }
    }
]

const chatWithGPT = async () => {
    const messages = [{
        role: "system",
        content: systemPrompt
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
            stream: true
        });

        let response = "";
        for await (const chunk of completion) {
            if (("content" in chunk.choices[0].delta)) {
                response += chunk.choices[0].delta.content;
                process.stdout.write(chunk.choices[0].delta.content);
            }
        }
        messages.push({role: "assistant", content: response});
    }
};

function executeQuery(query) {

}
