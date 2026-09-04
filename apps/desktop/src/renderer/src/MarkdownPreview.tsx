import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownHeadingId, safeMarkdownUrl } from "../../shared/markdown";

interface MarkdownPreviewProps {
  source: string;
}

function headingId(node: { position?: { start?: { line?: number } } } | undefined): string | undefined {
  const line = node?.position?.start?.line;
  return typeof line === "number" ? markdownHeadingId(line) : undefined;
}

export default function MarkdownPreview({ source }: MarkdownPreviewProps) {
  return (
    <div className="markdown-preview" data-testid="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeMarkdownUrl}
        components={{
          h1: ({ node, ...props }) => <h1 id={headingId(node)} {...props} />,
          h2: ({ node, ...props }) => <h2 id={headingId(node)} {...props} />,
          h3: ({ node, ...props }) => <h3 id={headingId(node)} {...props} />,
          h4: ({ node, ...props }) => <h4 id={headingId(node)} {...props} />,
          h5: ({ node, ...props }) => <h5 id={headingId(node)} {...props} />,
          h6: ({ node, ...props }) => <h6 id={headingId(node)} {...props} />,
          a: ({ node: _node, href, ...props }) => (
            <a
              {...props}
              href={safeMarkdownUrl(href ?? "") || undefined}
              rel="noreferrer noopener"
              target={href?.startsWith("#") ? undefined : "_blank"}
            />
          ),
          img: () => null,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
