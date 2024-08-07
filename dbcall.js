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
    You are an assistant that helps users by generating SQL queries against the Chinook Music Database. 
    Users will ask questions in natural language, and you will convert those questions into SQL queries 
    to retrieve the required information from the database. Provide the results in a clear and human-readable format.
    `;

const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('data/Chinook.db', sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error(err.message);
    } else {
        process.stdout.write('Connected to the Chinook database.\n');
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

async function getSchema(conn) {
    let schema = "";
    const databaseSchemaDict = await getDatabaseInfo(conn);
    databaseSchemaDict.forEach(table => {
        schema += `Table: ${table.tableName}\nColumns: ${table.columnNames.join(', ')}\n`;
    });
    return schema;
}

(async () => {
    const databaseSchemaString = await getSchema(db);

    const tools = [
        {
            type: "function",
            function: {
                name: "ask_database",
                description: `
                    Use this function to answer user questions about music.
                    Input should be a fully formed SQL query.
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
    ];

    function formatResult(rows) {
        if (rows.length === 0) return "No results found.";
        const keys = Object.keys(rows[0]);
        return rows.map(row => keys.map(key => `${key}: ${row[key]}`).join(', ')).join('\n');
    }

    function executeQuery(query) {
        process.stdout.write(`Query: ${query}\n`);
        return new Promise((resolve, reject) => {
            let rows = [];
            db.serialize(() => {
                db.each(query, (err, row) => {
                    if (err) {
                        console.error(err.message);
                        reject(err.message);
                    } else {
                        rows.push(row);
                    }
                }, (err, _count) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            });
        });
    }

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
                model: "gpt-4o",
                tools: tools,
                messages: messages,
                temperature: 0.5,
                stream: true
            });

            let response = "";
            let functionArgs = "";
            let functionName = "";
            let toolCallId = undefined;
            for await (const chunk of completion) {
                if (chunk.choices[0].delta.tool_calls) {
                    for (const toolCall of chunk.choices[0].delta.tool_calls) {
                        if (toolCall.id) {
                            toolCallId = toolCall.id;
                        }
                        if (toolCall.function.name) {
                            functionName += toolCall.function.name;
                        }
                        if (toolCall.function.arguments) {
                            functionArgs += toolCall.function.arguments;
                        }
                    }
                } else if (("content" in chunk.choices[0].delta)) {
                    response += chunk.choices[0].delta.content;
                    process.stdout.write(chunk.choices[0].delta.content);
                }
            }

            // Lägg till ny rad efter hela svaret
            if (response.length > 0) {
                process.stdout.write("\n");
            }

            if (functionName.length < 1) {
                messages.push({role: "assistant", content: response});
            } else {
                const fn = JSON.parse(functionArgs);
                const functionResponse = await executeQuery(fn.query).then(rows => {
                    return formatResult(rows);
                }).catch(error => {
                    return `Error: ${error}`;
                });
                process.stdout.write(functionResponse + "\n");

                messages.push({
                        role: "assistant",
                        content: "",
                        tool_calls: [
                            {
                                id: toolCallId,
                                type: "function",
                                function: {
                                    name: functionName,
                                    arguments: functionArgs
                                }
                            }
                        ]
                    }
                );
                messages.push({
                    tool_call_id: toolCallId,
                    role: "tool",
                    name: functionName,
                    content: functionResponse,
                });
            }
        }
    };

    chatWithGPT();
})();
