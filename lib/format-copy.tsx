import React from "react";

export function formatCopy(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") {
      elements.push(<br key={`br-${i}`} />);
      continue;
    }

    // Bullet points (group consecutive items into a single list).
    if (line.trimStart().startsWith("- ")) {
      const listItems: React.ReactNode[] = [];
      let listIndex = i;
      while (listIndex < lines.length && lines[listIndex].trimStart().startsWith("- ")) {
        const content = lines[listIndex].trimStart().slice(2);
        listItems.push(
          <li key={`li-${listIndex}`}>
            {inlineFormat(content, `li-${listIndex}`)}
          </li>
        );
        listIndex += 1;
      }
      elements.push(
        <ul key={`ul-${i}`} className="ml-6 list-disc space-y-1">
          {listItems}
        </ul>
      );
      i = listIndex - 1;
      continue;
    }

    // CTA links like [Text →]
    if (line.trim().startsWith("[") && line.trim().endsWith("]")) {
      const linkText = line.trim().slice(1, -1);
      elements.push(
        <p key={`cta-${i}`} className="mt-4">
          <span className="inline-block rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white">
            {linkText}
          </span>
        </p>
      );
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={`p-${i}`} className="leading-relaxed">
        {inlineFormat(line, `p-${i}`)}
      </p>
    );
  }

  return elements;
}

function inlineFormat(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.+?\*\*|\[[^\]]+\]\((https?:\/\/[^\s)]+)\)|https?:\/\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];

    // Bold markdown: **text**
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b-${match.index}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
      lastIndex = match.index + token.length;
      continue;
    }

    // Markdown links: [label](https://...)
    if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const closeBracket = token.indexOf("](");
      const label = token.slice(1, closeBracket);
      const href = token.slice(closeBracket + 2, -1);
      parts.push(
        <a
          key={`${keyPrefix}-mdlink-${match.index}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-blue-700 underline underline-offset-2 hover:text-blue-900"
        >
          {label}
        </a>
      );
      lastIndex = match.index + token.length;
      continue;
    }

    // Bare URLs
    lastIndex = match.index + match[0].length;
    parts.push(
      <a
        key={`${keyPrefix}-url-${match.index}`}
        href={token}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-blue-700 underline underline-offset-2 hover:text-blue-900"
      >
        {token}
      </a>
    );
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
