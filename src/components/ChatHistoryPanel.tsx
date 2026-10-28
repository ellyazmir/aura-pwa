import React, { useState } from 'react';
import { X, Plus, Trash2, MessageSquare, History } from 'lucide-react';
import type { SavedChat } from '../lib/chatHistory';

interface ChatHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  chats: SavedChat[];
  activeChatId: string | null;
  /** True while an answer is being written: switching chats then would mix up the reply. */
  busy: boolean;
  onSelect: (chat: SavedChat) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onNewChat: () => void;
}

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export const ChatHistoryPanel: React.FC<ChatHistoryPanelProps> = ({
  isOpen,
  onClose,
  chats,
  activeChatId,
  busy,
  onSelect,
  onDelete,
  onClearAll,
  onNewChat,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        aria-label="Tutup riwayat"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs cursor-default"
      />

      <aside className="relative w-80 max-w-[85vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Riwayat Sembang</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New chat */}
        <div className="p-3">
          <button
            onClick={onNewChat}
            disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Sembang baharu</span>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1.5">
          {chats.length === 0 && (
            <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-10 px-4">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-60" />
              Belum ada sembang. Soalan dan jawapan anda akan disimpan di sini, dalam peranti ini sahaja.
            </div>
          )}

          {chats.map((chat) => {
            const active = chat.id === activeChatId;
            const questions = chat.messages.filter((m) => m.role === 'user').length;
            return (
              <div
                key={chat.id}
                className={`group flex items-start gap-1 rounded-lg border transition-colors ${
                  active
                    ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30'
                    : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <button
                  onClick={() => onSelect(chat)}
                  disabled={busy}
                  className="flex-1 min-w-0 text-left px-3 py-2 disabled:opacity-60"
                >
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {chat.title}
                  </span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    {formatWhen(chat.updatedAt)} · {questions} mesej
                    {chat.subject && chat.subject !== 'Umum' ? ` · ${chat.subject}` : ''}
                  </span>
                </button>
                <button
                  onClick={() => onDelete(chat.id)}
                  disabled={busy}
                  title="Padam sembang ini"
                  className="m-1.5 p-1.5 rounded-md text-slate-300 hover:text-red-500 hover:bg-white dark:hover:bg-slate-800 opacity-0 group-hover:opacity-100 focus:opacity-100 transition disabled:opacity-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {chats.length > 0 && (
          <div className="p-3 border-t border-slate-200 dark:border-slate-800">
            {confirmClear ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600 dark:text-slate-300">Padam semua riwayat?</span>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    Batal
                  </button>
                  <button
                    onClick={() => {
                      setConfirmClear(false);
                      onClearAll();
                    }}
                    className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold"
                  >
                    Padam
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                disabled={busy}
                className="w-full text-xs font-medium text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
              >
                Padam semua riwayat
              </button>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};
