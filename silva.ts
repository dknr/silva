import { Tool, tool } from "./types.ts";
import { createAgent } from "./agent.ts";
import z from "zod";

const tools: Record<string, Tool> = {
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

const agent = createAgent({
    baseUrl: 'http://10.11.116.184:8002',
    model: '',
    tools,
}, (e) => {
    try {
        if (e.tool_calls?.length) {
            console.log('🔨', e.tool_calls[0].function.name, e.tool_calls[0].function.arguments);
        } else if (e.role === 'tool') {
            // no-op
        } else {
            console.log(e.role, e.content)
        }
    } catch {
        console.log(e);
    }
});

agent.send('hello!')
agent.send('what time is it?')
setTimeout(() => {
    agent.send('explore the working directory with the bash tool');
}, 6000)

// setInterval(() => {
//     agent.send('keep digging');
// }, 30000)
