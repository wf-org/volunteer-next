import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './styles.module.css';

interface Props {
  content: string;
  className?: string;
}

export default function Markdown({ content, className }: Props) {
  return (
    <div className={[styles.content, className].filter(Boolean).join(' ')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
