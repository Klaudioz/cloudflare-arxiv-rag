/**
 * Individual message component
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { Message } from '@/types';
import PaperSources from './PaperSources';

interface Props {
  message: Message;
  streaming?: boolean;
}

export default function MessageItem({ message, streaming }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-2xl px-4 py-3 rounded-lg ${
          isUser ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-100 text-gray-900 rounded-bl-none'
        }`}
      >
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}

        {!isUser && (
          <div className="mt-3 space-y-2">
            {message.latency_ms && (
              <div className="text-xs text-gray-600">
                ⏱ Response time: {message.latency_ms}ms
              </div>
            )}

            {message.sources && message.sources.length > 0 && (
              <PaperSources sources={message.sources} />
            )}

            {streaming && (
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <span className="inline-block w-1 h-1 bg-gray-600 rounded-full animate-pulse"></span>
                Thinking...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
