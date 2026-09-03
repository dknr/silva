type ToolCall = {
    type: string; // expect 'function'
    function: {
        name: string;
        arguments: unknown;
    }
    id: string;
}
type Message = {
    role: string;
    content: string;
    reasoning_content?: string;
    tool_calls?: ToolCall[];
}
type JSONSchema = {
    type?: string;
    description?: string;
    properties?: Record<string, JSONSchema>;
    required?: string[];
    [key: string]: unknown;
}
type Tool = {
    name: string;
    parameters: JSONSchema;
    function: (arguments?: Map<string, unknown>) => Promise<string>;
}

type CompletionRequest = {
    model: string;
    messages: Array<Message>;
    tools: Array<{
        type: 'function',
        function: {
            name: string;
            parameters: JSONSchema;
        }
    }>;
    reasoning_effort?: string;
}

type CompletionChoice = {
    finish_reason: string;
    index: number;
    message: Message;
}
type CompletionResponse = {
    choices: CompletionChoice[];
}

type AgentProps = {
    baseUrl: string;
    model: string;
    tools?: Tool[];
}

const createAsyncQueue = <T>() => {
    let queue: T[] = [];
    let waiter: null | ((value: T) => void) = null;

    return {
        push: (value: T) => {
            if (waiter) {
                const wait = waiter;
                waiter = null;
                wait([value]);
            } else {
                queue.push(value);
            }
        },
        flush: (): Promise<T[]> => {
            if (queue.length) {
                const result = queue;
                queue = [];
                return result
            } else {
                return new Promise<T>((resolve) => {
                    waiter = resolve;
                });
            }
        }
    }
}

const createCompletionFetch = async (baseUrl: string, request: CompletionRequest): Promise<CompletionResponse> => {
    return await fetch(new URL('v1/chat/completions', baseUrl), {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {'content-type': 'application/json'}
    });
}

const createAgent = (props: AgentProps, callbackFn: (event: Message) => void) => {
    const inputQueue = createAsyncQueue<Message>();
    const messages: Array<Message> = [];

    void (async () => {
        while (true) {
            // console.log('top of loop')
            const newMessages = await inputQueue.flush()
            for (const message of newMessages) {
                callbackFn(message);
                messages.push(message);
            }

            const request: CompletionRequest = {
                model: props.model,
                messages,
                tools: props.tools.map((t) => ({
                    type: 'function',
                    function: {
                        name: t.name,
                        parameters: t.parameters,
                    }
                })),
                reasoning_effort: 'none'
            }
            const response = await createCompletionFetch(props.baseUrl, request);

            const completion: CompletionResponse = await response.json();
            // console.log(completion);

            if (completion.choices.length > 1) {
                console.log('more than one choice') // TODO: logging and handle multiple choices
            }

            const choice0 = completion.choices[0];
            messages.push(choice0.message);
            callbackFn(choice0.message)
            console.log(choice0)

            if (choice0.message.tool_calls?.length) {
                for (const call of choice0.message.tool_calls) {
                    // console.log(call);
                    if (call.type !== 'function') continue;
                    // TODO: error prone variable names - see global `tools`
                    const tool = props.tools.find((t) => t.name === call.function.name)
                    if (!tool) {
                        inputQueue.push({role: 'tool', content: `tool not found: ${call.function.name}`})
                        continue;
                    }

                    try {
                        const args = JSON.parse(call.function.arguments);
                        const result = await tool.function(args);
                        // console.log(call.function.name, result);
                        inputQueue.push({role: 'tool', content: result});
                    } catch (e) {
                        inputQueue.push({role: 'tool', content: `exception: ${e}`});
                    }
                }
            }
        }
    })();

    return {
        send: (message: Message) => {
            inputQueue.push(message);
        }
    }
}

const agent = createAgent({
    baseUrl: 'http://10.11.116.184:8001',
    tools: [
        {
            name: 'time',
            parameters: {},
            function: () => new Date().toISOString(),
        },
        {
            name: 'bash',
            parameters: {
                type: 'object',
                properties: {
                    command: {type: 'string'},
                },
                required: ['command'],
            },
            function: () => 'bash tool not implemented yet',
        },
        {
            name: 'fetch',
            parameters: {
                type: 'object',
                properties: {
                    url: {type: 'string'},
                },
                required: ['url'],
            },
            function: async ({url}) => {
                const result = await fetch(url);
                return await result.text();
            }
        }
    ],
}, (e) => {
    try {
        console.log(e.role, e.content)
    } catch {
        console.log(e);
    }
});

agent.send({role: 'user', content: 'hello!'})
agent.send({role: 'user', content: 'what time is it?'})
setTimeout(() => {
    agent.send({role: 'user', content: 'try the fetch tool with https://caos.one/posts'});
}, 6000)

// const modelsResponse = await fetch('http://10.11.116.184:8001/v1/models');
// const models = await modelsResponse.json();
// console.log(models);

// const completionRequest: CompletionRequest = {
//     model: 'Qwen3.8-27B-Q4_K_M.gguf',
//     messages: [
//         { role: 'user', content: 'Hello!' }
//     ]
// }
// const completionResponse = await fetch('http://10.11.116.184:8001/v1/chat/completions', {
//     method: 'POST',
//     body: JSON.stringify(completionRequest),
//     headers: {'content-type': 'application/json'},
// });
// const completion = await completionResponse.json();
// console.log(completion);
