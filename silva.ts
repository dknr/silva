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
type Tool = {
    type: 'function';
    function: {
        name: string;
        parameters: Map<string, unknown>;
    }
}

type ToolImpl = (params: unknown) => string;
type Tools = Map<string, ToolImpl>;

type CompletionRequest = {
    model: string;
    messages: Array<Message>;
    tools: Array<Tool>;
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
    const queue: T[] = [];
    let waiter: null | ((value: T) => void) = null;

    return {
        push: (value: T) => {
            if (waiter) {
                const wait = waiter;
                waiter = null;
                wait(value);
            } else {
                queue.push(value);
            }
        },
        pop: (): Promise<T> => {
            if (queue.length) {
                return queue.shift();
            } else {
                return new Promise<T>((resolve) => {
                    waiter = resolve;
                });
            }
        }
    }
}

type AgentEvent = {
    message: Message;
}

// TODO: not as a global
// IDEA: hot-reload tools - send new tool fns in on the fly
const tools: Map<string, ToolImpl> = {
    time: () => new Date().toISOString(),
}

const createCompletionFetch = async (baseUrl: string, request: CompletionRequest): Promise<CompletionResponse> => {
    return await fetch(new URL('v1/chat/completions', baseUrl), {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {'content-type': 'application/json'}
    });
}

const createAgent = (props: AgentProps, callbackFn: (event: AgentEvent) => void) => {
    const inputQueue = createAsyncQueue<Message>();
    const messages: Array<Message> = [];

    void (async () => {
        while (true) {
            console.log('top of loop')
            const content = await inputQueue.pop();
            const userMessage = {role: 'user', content};
            messages.push(userMessage);
            callbackFn(userMessage);

            const request: CompletionRequest = {
                model: props.model,
                messages,
                tools: props.tools,
            }
            const response = await createCompletionFetch(props.baseUrl, request);

            const completion: CompletionResponse = await response.json();
            console.log(completion);

            if (completion.choices.length > 1) {
                console.log('more than one choice') // TODO: logging and handle multiple choices
            }

            const choice0 = completion.choices[0];
            messages.push(choice0.message);
            callbackFn(choice0.message)

            if (choice0.message.tool_calls?.length) {
                for (const call of choice0.message.tool_calls) {
                    console.log(call);
                    if (call.type !== 'function') continue;
                    // TODO: error prone variable names - see global `tools`
                    const tool = tools[call.function.name];
                    if (!tool) {
                        console.log(`tool not found: ${call.function.name}`);
                        // TODO: tell the agent the tool was not found
                        continue;
                    }
                    const result = tool();
                    console.log(call.function.name, result);
                    inputQueue.push(result);
                }
            }
        }
    })();

    return {
        send: (message: string) => {
            inputQueue.push(message);
        }
    }
}

const agent = createAgent({
    baseUrl: 'http://10.11.116.184:8001',
    tools: [
        {type: 'function', function: {
            name: 'time',
            parameters: {}
        }}
    ],
}, console.log);

agent.send('hello!')
agent.send('what time is it?')

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
