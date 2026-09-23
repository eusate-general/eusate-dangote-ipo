"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

// Citation markers are rewritten to "#cite-N" links upstream. The sanitizer may prefix the fragment.
const CITE_HREF = /#(?:user-content-)?cite-\d+$/;

const components: Components = {
  a({ href, children }) {
    if (href && CITE_HREF.test(href)) {
      return <sup className="cite">{children}</sup>;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    );
  },
};

/** Model output is untrusted: raw HTML is dropped, the tree is sanitized, and images are removed. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="chat-md">
      <ReactMarkdown
        skipHtml
        rehypePlugins={[rehypeSanitize]}
        disallowedElements={["img"]}
        unwrapDisallowed
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
