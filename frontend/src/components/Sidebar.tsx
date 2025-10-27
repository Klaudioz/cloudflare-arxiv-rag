/**
 * Sidebar component for settings and navigation
 */

import React, { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { apiClient } from '@/api/client';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: Props) {
  const { apiKey, setApiKey, clearMessages } = useAppStore();
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [showApiInput, setShowApiInput] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const handleSaveApiKey = async () => {
    if (tempApiKey.trim()) {
      setConnectionStatus('connecting');
      apiClient.setApiKey(tempApiKey);

      try {
        await apiClient.health();
        setApiKey(tempApiKey);
        setConnectionStatus('connected');
        setShowApiInput(false);
      } catch (error) {
        setConnectionStatus('disconnected');
        alert('Failed to connect. Please check your API key.');
      }
    }
  };

  const handleClearChat = () => {
    if (confirm('Are you sure you want to clear the chat history?')) {
      clearMessages();
    }
  };

  return (
    <>
      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 lg:hidden" onClick={onClose} />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 lg:static lg:inset-auto z-40 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-bold text-lg">arXiv RAG</h2>
            <button onClick={onClose} className="lg:hidden p-2 hover:bg-gray-100 rounded">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* API Key Section */}
            <div>
              <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M7.5 2H4a2 2 0 00-2 2v3a2 2 0 002 2h3.5a2 2 0 002-2V4a2 2 0 00-2-2z" />
                  <path d="M16 2h-3.5a2 2 0 00-2 2v3a2 2 0 002 2H16a2 2 0 002-2V4a2 2 0 00-2-2z" />
                  <path d="M7.5 12H4a2 2 0 00-2 2v3a2 2 0 002 2h3.5a2 2 0 002-2v-3a2 2 0 00-2-2z" />
                  <path d="M16 12h-3.5a2 2 0 00-2 2v3a2 2 0 002 2H16a2 2 0 002-2v-3a2 2 0 00-2-2z" />
                </svg>
                API Key
              </h3>

              <div className="text-sm">
                {apiKey ? (
                  <div>
                    <div className="flex items-center gap-2 text-green-600 mb-2">
                      <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                      Connected
                    </div>
                    <button
                      onClick={() => setShowApiInput(true)}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
                      Change API Key
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowApiInput(true)}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    Set API Key
                  </button>
                )}
              </div>

              {showApiInput && (
                <div className="mt-3 space-y-2">
                  <input
                    type="password"
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveApiKey}
                      disabled={connectionStatus === 'connecting'}
                      className="flex-1 px-3 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 disabled:bg-gray-300 transition"
                    >
                      {connectionStatus === 'connecting' ? 'Connecting...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setShowApiInput(false);
                        setTempApiKey(apiKey);
                      }}
                      className="flex-1 px-3 py-2 bg-gray-200 rounded text-sm hover:bg-gray-300 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Options */}
            <div className="pt-4 space-y-2 border-t border-gray-200">
              <button
                onClick={handleClearChat}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded transition flex items-center gap-2 text-gray-700"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Chat
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 p-4 text-xs text-gray-600">
            <p className="mb-2">v0.1.0</p>
            <a
              href="https://github.com/Klaudioz/cloudflare-arxiv-rag"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
