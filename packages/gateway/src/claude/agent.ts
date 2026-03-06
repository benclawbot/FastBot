import { query } from '@anthropic-ai/claude-agent-sdk';
import { getSession, setClaudeSessionId } from './session-manager.js';
import { setActiveQuery, clearActiveQuery } from './request-queue.js';

export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  usage?: any;
}

export async function sendToAgent(
  sessionKey: string,
  message: string,
  options: {
    onProgress?: (text: string) => void;
    abortController?: AbortController;
    model?: string;
  } = {}
): Promise<AgentResponse> {
  const session = getSession(sessionKey);

  let fullText = '';
  const toolsUsed: string[] = [];

  try {
    const controller = options.abortController || new AbortController();
    const existingSessionId = session.claudeSessionId;

    const response = query({
      prompt: message,
      options: {
        cwd: session.workingDirectory,
        tools: ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Task'],
        permissionMode: 'acceptEdits',
        abortController: controller,
        systemPrompt: {
          type: 'preset' as const,
          preset: 'claude_code' as const,
        },
        model: options.model || 'opus',
        resume: existingSessionId,
      }
    });

    setActiveQuery(sessionKey, response);

    for await (const responseMessage of response) {
      if (controller.signal.aborted) break;

      if (responseMessage.type === 'assistant') {
        for (const block of responseMessage.message.content) {
          if (block.type === 'text') {
            fullText += block.text;
            options.onProgress?.(fullText);
          } else if (block.type === 'tool_use') {
            toolsUsed.push(block.name);
          }
        }
      } else if (responseMessage.type === 'result') {
        if (responseMessage.subtype === 'success' && 'session_id' in responseMessage) {
          setClaudeSessionId(sessionKey, responseMessage.session_id);
        }
      }
    }
  } finally {
    clearActiveQuery(sessionKey);
  }

  return { text: fullText || 'No response', toolsUsed };
}
