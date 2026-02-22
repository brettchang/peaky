"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { useCallback, useEffect, useRef } from "react";

function getMarkdown(editor: Editor): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (editor.storage as any).markdown.getMarkdown();
}

// Prevent toolbar buttons from stealing editor focus/selection
function preventFocusLoss(e: React.MouseEvent) {
  e.preventDefault();
}

export function CopyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (markdown: string) => void;
}) {
  const isInternalChange = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
        },
      }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    immediatelyRender: false,
    content: value,
    onUpdate: ({ editor }) => {
      const md = getMarkdown(editor);
      isInternalChange.current = true;
      onChange(md);
    },
    editorProps: {
      attributes: {
        class:
          "max-w-none text-sm text-gray-900 leading-relaxed focus:outline-none min-h-[120px]",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    editor.commands.setContent(value);
  }, [value, editor]);

  const toggleLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const url = window.prompt("URL:");
    if (!url) {
      editor.chain().focus().run();
      return;
    }
    if (hasSelection) {
      // Apply link to the selected text
      editor.chain().focus().setTextSelection({ from, to }).setLink({ href: url }).run();
    } else {
      // No text selected — insert the URL as linked text
      editor
        .chain()
        .focus()
        .insertContent(`<a href="${url}">${url}</a>`)
        .run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="rounded-md border border-gray-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-gray-200 px-3 py-1.5">
        {/* Heading */}
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`rounded px-2 py-1 text-xs font-semibold ${
            editor.isActive("heading", { level: 2 })
              ? "bg-gray-200 text-gray-900"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          H
        </button>

        <div className="mx-1 h-4 w-px bg-gray-200" />

        {/* Bold */}
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded px-2 py-1 text-xs font-semibold ${
            editor.isActive("bold")
              ? "bg-gray-200 text-gray-900"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          B
        </button>

        {/* Bullet List */}
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded px-2 py-1 text-xs ${
            editor.isActive("bulletList")
              ? "bg-gray-200 text-gray-900"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="inline-block"
          >
            <circle cx="3" cy="4" r="1.5" fill="currentColor" />
            <circle cx="3" cy="8" r="1.5" fill="currentColor" />
            <circle cx="3" cy="12" r="1.5" fill="currentColor" />
            <rect x="6" y="3" width="8" height="2" rx="0.5" fill="currentColor" />
            <rect x="6" y="7" width="8" height="2" rx="0.5" fill="currentColor" />
            <rect x="6" y="11" width="8" height="2" rx="0.5" fill="currentColor" />
          </svg>
        </button>

        <div className="mx-1 h-4 w-px bg-gray-200" />

        {/* Link */}
        <button
          type="button"
          onMouseDown={preventFocusLoss}
          onClick={toggleLink}
          className={`rounded px-2 py-1 text-xs ${
            editor.isActive("link")
              ? "bg-gray-200 text-gray-900"
              : "text-gray-600 hover:bg-gray-100"
          }`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="inline-block"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </button>
      </div>
      {/* Editor area */}
      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
