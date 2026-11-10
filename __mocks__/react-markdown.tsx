// react-markdown is ESM-only, which Jest doesn't transform from node_modules.
// Tests only need the raw text, so render it as-is.
import type { ReactNode } from 'react';

const Markdown = ({ children }: { children?: ReactNode }) => <div>{children}</div>;

export default Markdown;
