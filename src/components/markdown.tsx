import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Coach replies: Markdown with GFM tables, styled to match the app. Links open safely. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[15px] leading-relaxed [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mt-2 font-semibold" {...p} />,
          h2: (p) => <h3 className="mt-2 font-semibold" {...p} />,
          h3: (p) => <h3 className="mt-2 font-semibold" {...p} />,
          a: ({ href, children }) => (
            <a href={href} className="text-accent underline" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: (p) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-border px-1.5 py-1 text-left text-xs font-normal text-muted" {...p} />,
          td: (p) => <td className="border-b border-border px-1.5 py-1" {...p} />,
          code: (p) => <code className="rounded bg-background px-1 text-sm" {...p} />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
