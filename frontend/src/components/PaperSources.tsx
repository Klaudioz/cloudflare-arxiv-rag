/**
 * Paper sources component
 */

import React, { useState } from 'react';
import type { Paper } from '@/types';

interface Props {
  sources: Paper[];
}

export default function PaperSources({ sources }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 pt-2 border-t border-gray-300">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.5 1.5H2.5A1 1 0 001.5 2.5v15a1 1 0 001 1h15a1 1 0 001-1v-8m-14-5h8m-8 4h12m-12 4h12m-8-14v8" />
        </svg>
        {sources.length} Source{sources.length !== 1 ? 's' : ''}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {sources.map((paper, idx) => (
            <div key={idx} className="text-xs bg-gray-50 p-2 rounded">
              <a
                href={paper.pdf_url || `https://arxiv.org/abs/${paper.arxiv_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium"
              >
                {paper.title}
              </a>
              <div className="text-gray-600 mt-1">
                <p>{paper.authors?.slice(0, 2).join(', ')}...</p>
                <p className="text-gray-500 mt-1">{paper.published_date?.split('T')[0]}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
