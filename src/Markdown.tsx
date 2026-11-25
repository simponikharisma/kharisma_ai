import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

function nodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return nodeToText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

function isArabicFirst(text: string) {
  const firstArabic = text.search(ARABIC_SCRIPT);
  const firstLatin = text.search(/[A-Za-z0-9]/);
  return firstArabic >= 0 && (firstLatin < 0 || firstArabic < firstLatin);
}

const components: Components = {
  p: ({ children }) => {
    const arabicFirst = isArabicFirst(nodeToText(children));
    return (
      <p dir={arabicFirst ? "rtl" : undefined} className={arabicFirst ? "md-arabic" : undefined}>
        {children}
      </p>
    );
  },
  li: ({ children }) => {
    const arabicFirst = isArabicFirst(nodeToText(children));
    return (
      <li dir={arabicFirst ? "rtl" : undefined} className={arabicFirst ? "md-arabic" : undefined}>
        {children}
      </li>
    );
  },
  a: ({ href, children }) => {
    const external = typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className="md-link"
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table>{children}</table>
    </div>
  ),
  // Gambar dari respons AI tidak dimuat otomatis (privasi + CSP); tampilkan sebagai tautan.
  img: ({ alt, src }) => (
    <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noopener noreferrer" className="md-link">
      {alt || src || "Gambar"}
    </a>
  )
};

export function Markdown({ content, className }: { content: string; className?: string }) {
  if (!content.trim()) return null;
  return (
    <div className={`md-content${className ? ` ${className}` : ""}`} dir="auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
