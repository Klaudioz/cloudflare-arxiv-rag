/**
 * Main chat interface component
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { apiClient } from '@/api/client';
import MessageList from './MessageList';
import InputBar from './InputBar';
import Sidebar from './Sidebar';
import type { Message, RAGResponse } from '@/types';

export default function ChatInterface() {
  const {
    apiKey,
    messages,
    loading,
    error,
    cacheHitRate,
    addMessage,
    setLoading,
    setError,
    setCacheHitRate,
  } = useAppStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingMessage]);

  const handleSendMessage = async (query: string) => {
    if (!apiKey) {
      setError('Please set your API key first');
      return;
    }

    if (!query.trim()) {
      return;
    }

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    addMessage(userMessage);

    setLoading(true);
    setError(null);
    setStreamingMessage('');

    try {
      // Stream the response
      let fullResponse = '';
      let latency = 0;
      let cacheHit = false;
      let sources: any[] = [];

      try {
        for await (const chunk of apiClient.streamAsk(query, 3)) {
          try {
            const data = JSON.parse(chunk);

            if (data.response) {
              fullResponse += data.response;
              setStreamingMessage(fullResponse);
            }

            if (data.latency_ms) {
              latency = data.latency_ms;
            }

            if (data.cache_hit !== undefined) {
              cacheHit = data.cache_hit;
              if (cacheHit) {
                setCacheHitRate(cacheHitRate + 1);
              }
            }

            if (data.sources) {
              sources = data.sources;
            }
          } catch {
            // Ignore parsing errors for streaming
          }
        }
      } catch {
        // Fallback to non-streaming if streaming fails
        const response: RAGResponse = await apiClient.ask(query, 3);
        fullResponse = response.response;
        latency = response.latency_ms;
        cacheHit = response.cache_hit;
        sources = response.sources || [];

        if (cacheHit) {
          setCacheHitRate(cacheHitRate + 1);
        }
      }

      // Add assistant message
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date(),
        sources,
        latency_ms: latency,
      };
      addMessage(assistantMessage);
      setStreamingMessage('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get response';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">arXiv RAG Assistant</h1>
          <div className="flex items-center gap-2">
            {cacheHitRate > 0 && (
              <div className="text-sm text-green-600 font-medium">
                Cache: {cacheHitRate > 0 ? `${Math.round((cacheHitRate / (messages.length / 2)) * 100)}%` : '0%'}
              </div>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <MessageList messages={messages} streamingMessage={streamingMessage} />
          <div ref={messagesEndRef} />
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Input Area */}
        <InputBar onSend={handleSendMessage} loading={loading} />
      </div>
    </div>
  );
}
