interface VerseDisplayProps {
  reference: string;
  text: string;
}

export function VerseDisplay({ reference, text }: VerseDisplayProps) {
  return (
    <div className="verse-display">
      <div className="verse-display-icon" aria-hidden="true">
        &#128214;
      </div>
      <blockquote className="verse-display-text">&ldquo;{text}&rdquo;</blockquote>
      <cite className="verse-display-reference">&mdash; {reference}</cite>
    </div>
  );
}
