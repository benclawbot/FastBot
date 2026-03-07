import { Server, Socket } from 'socket.io';
import { sendToAgent, sendLoopToAgent, clearConversation } from './claude/agent.js';
import { sessionManager } from './claude/session-manager.js';
import type { SessionHistoryEntry } from './claude/session-history.js';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  ts: number;
}

export function setupChatHandler(io: Server, socket: Socket) {
  const userId = (socket as any).user?.sub;
  if (!userId) {
    socket.emit('chat:error', { error: 'Authentication required' });
    return;
  }

  // Join user's session room
  socket.join(`user:${userId}`);

  // Get or create session for this user (shared with Telegram)
  const sessionKey = `user:${userId}`;
  let session = sessionManager.getSession(sessionKey);

  // Initialize session if not exists (use home directory as default)
  if (!session) {
    const workspaceDir = process.env.HOME || '.';
    session = sessionManager.createSession(sessionKey, workspaceDir);
  }

  // Send session joined event
  const history: SessionHistoryEntry[] = sessionManager.getSessionHistory(sessionKey, 50);
  const messages: ChatMessage[] = history.map((entry: SessionHistoryEntry, i: number) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: entry.lastMessagePreview,
    ts: new Date(entry.lastActivity).getTime(),
  }));

  socket.emit('session:joined', {
    sessionId: session.conversationId,
    messages,
  });

  // Handle chat messages
  socket.on('chat:message', async (data: { content: string }) => {
    const { content } = data;

    if (!content || !content.trim()) return;

    // Check for commands
    if (content.startsWith('/project ')) {
      const newPath = content.slice(9).trim();

      // Validate path - prevent path traversal
      if (newPath.includes('..') || newPath.startsWith('/') || /^[a-zA-Z]:/.test(newPath)) {
        socket.emit('chat:message', {
          role: 'assistant',
          content: 'Invalid path. Use a relative path without traversal.',
          ts: Date.now(),
        });
        return;
      }

      session = sessionManager.setWorkingDirectory(sessionKey, newPath);
      clearConversation(sessionKey);
      socket.emit('chat:message', {
        role: 'assistant',
        content: `✅ Project set to: ${newPath}`,
        ts: Date.now(),
      });
      return;
    }

    if (content === '/clear') {
      clearConversation(sessionKey);
      socket.emit('chat:message', {
        role: 'assistant',
        content: '✅ Conversation cleared',
        ts: Date.now(),
      });
      return;
    }

    if (content === '/resume' || content === '/continue') {
      const lastSession = sessionManager.resumeLastSession(sessionKey);
      if (lastSession) {
        socket.emit('chat:message', {
          role: 'assistant',
          content: `✅ Resumed session for: ${lastSession.workingDirectory}`,
          ts: Date.now(),
        });
      } else {
        socket.emit('chat:message', {
          role: 'assistant',
          content: 'No previous session found',
          ts: Date.now(),
        });
      }
      return;
    }

    if (content === '/model ') {
      const parts = content.split(' ');
      if (parts.length >= 2) {
        const model = parts[1];
        // Would set model preference here
        socket.emit('chat:message', {
          role: 'assistant',
          content: `Model: ${model}`,
          ts: Date.now(),
        });
      }
      return;
    }

    // /sessions - list recent sessions
    if (content === '/sessions') {
      const history = sessionManager.getSessionHistory(sessionKey, 10);
      socket.emit('chat:message', {
        role: 'assistant',
        content: history.length
          ? `Sessions:\n${history.map((h, i) => `${i + 1}. ${h.projectPath}`).join('\n')}`
          : 'No sessions found',
        ts: Date.now(),
      });
      return;
    }

    // /status - show session status
    if (content === '/status') {
      socket.emit('chat:message', {
        role: 'assistant',
        content: `Working: ${session?.workingDirectory}\nSession: ${session?.conversationId}`,
        ts: Date.now(),
      });
      return;
    }

    // /ping - health check
    if (content === '/ping') {
      socket.emit('chat:message', {
        role: 'assistant',
        content: 'Pong!',
        ts: Date.now(),
      });
      return;
    }

    // /commands - list commands
    if (content === '/commands') {
      const { getAvailableCommands } = await import('./claude/command-parser.js');
      socket.emit('chat:message', {
        role: 'assistant',
        content: getAvailableCommands(),
        ts: Date.now(),
      });
      return;
    }

    // Emit user message first
    socket.emit('chat:message', {
      role: 'user',
      content,
      ts: Date.now(),
    });

    // Start streaming indicator
    socket.emit('chat:stream:start');

    try {
      // Determine command mode
      let command: 'plan' | 'explore' | 'loop' | undefined;
      let prompt = content;

      if (content.startsWith('/plan ')) {
        command = 'plan';
        prompt = content.slice(6);
      } else if (content.startsWith('/explore ')) {
        command = 'explore';
        prompt = content.slice(9);
      } else if (content.startsWith('/loop ')) {
        command = 'loop';
        prompt = content.slice(6);
      }

      // Send to agent
      let response;
      if (command === 'loop') {
        response = await sendLoopToAgent(sessionKey, prompt);
      } else {
        response = await sendToAgent(sessionKey, prompt, { command });
      }

      // Stream response in chunks
      if (response.text) {
        const chunks = response.text.match(/.{1,100}/g) || [response.text];
        for (const chunk of chunks) {
          socket.emit('chat:stream:chunk', { chunk });
          await new Promise(r => setTimeout(r, 30));
        }
      }

      socket.emit('chat:stream:end');

      // Emit final message
      socket.emit('chat:message', {
        role: 'assistant',
        content: response.text || 'No response',
        ts: Date.now(),
      });

    } catch (error) {
      socket.emit('chat:stream:end');
      socket.emit('chat:message', {
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ts: Date.now(),
      });
    }
  });

  // Handle session info request
  socket.on('session:info', () => {
    const session = sessionManager.getSession(sessionKey);
    socket.emit('session:info', {
      workingDirectory: session?.workingDirectory,
      conversationId: session?.conversationId,
      history: sessionManager.getSessionHistory(sessionKey, 10),
    });
  });
}
