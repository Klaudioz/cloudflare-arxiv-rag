/**
 * Message list component
 */

import React from 'react';
import type { Message } from '@/types';
import MessageItem from './MessageItem';

interface Props {
  messages: Message[];
  streamingMessage: string;
}

export default function MessageList({ messages, streamingMessage }: Props) {
  return (
    <div className="space-y-4">
      {messages.length === 0 && !streamingMessage && (
        <div className="text-center py-12">
          <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-500">Start by asking a question about arXiv papers</p>
        </div>
      )}

      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}

      {streamingMessage && (
        <MessageItem
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingMessage,
            timestamp: new Date(),
          }}
          streaming={true}
        />
      )}
    </div>
  );
}
