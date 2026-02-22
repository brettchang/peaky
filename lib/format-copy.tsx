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

    // Bullet points
    if (line.startsWith("- ")) {
      const content = line.slice(2);
      elements.push(
        <li key={`li-${i}`} className="ml-6 list-disc">
          {inlineFormat(content)}
        </li>
      );
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
        {inlineFormat(line)}
      </p>
    );
  }

  return elements;
}

function inlineFormat(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={`b-${match.index}`} className="font-semibold">
        {match[1]}
      </strong>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
