import {Bot} from 'gramio';
import z from "zod";

import { createAgent, ToolRegistry, tool } from "./agent/mod.ts";
import { createAsyncQueue } from "./agent/queue.ts";

const tools: ToolRegistry = {
    time: tool(z.object(), () => Promise.resolve(new Date().toISOString())),
    bash: tool(
        z.object({command: z.string()}),
        async ({command}) => {
            const result = await Deno.spawnAndWait("bash", ['-c', command]);
            return JSON.stringify({
                command,
                code: result.code,
                stdout: new TextDecoder().decode(result.stdout),
                stderr: new TextDecoder().decode(result.stderr),
            }, null, 2)
        }
    ),
    fetch: tool(
        z.object({url: z.string()}),
        async ({url}) => {
            const result = await fetch(url);

            const contentType = result.headers.get('content-type');
            if (!contentType?.startsWith('text')) {
                throw new Error(`content type not allowed: ${contentType}`);
            }

            return await result.text();
        }
    ),
}

const allowedId = parseInt(Deno.env.get('TG_ALLOWED_ID') ?? '', 10);
if (!allowedId) throw new Error();

const bot = new Bot(Deno.env.get('TG_TOKEN') ?? '');
bot.on('message', (context) => {
    if (context.from.id !== allowedId) return;
    if (!context.hasText()) return;
    console.log(context.text);
    agent.send(context.text);
});

bot.start();
bot.api.sendMessage({chat_id: allowedId, text: 'bot started'});

const agent = createAgent({
    baseUrl: 'http://10.11.116.184:8002',
    model: '',
    tools,
}, (e) => {
    try {
        if (e.role === 'assistant' && e.content) {
            bot.api.sendMessage({chat_id: allowedId, text: e.content});
        }
        console.log(e);
        // if (e.tool_calls?.length) {
        //     console.log('🔨', e.tool_calls[0].function.name, e.tool_calls[0].function.arguments);
        // } else if (e.role === 'tool') {
        //     // no-op
        // } else {
        //     console.log(e.role, e.content)
        // }
    } catch {
        console.log(e);
    }
});
