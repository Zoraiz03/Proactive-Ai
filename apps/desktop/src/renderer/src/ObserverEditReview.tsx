import { DiffEditor } from "@monaco-editor/react";
import type { ObserverRequest, ObserverSuggestion } from "../../shared/observer";
import type { LocalSettings } from "../../shared/settings";

export interface ObserverEditReviewState {
  request: ObserverRequest;
  suggestion: ObserverSuggestion;
  originalContent: string;
  proposedContent: string;
  contextSummary: string;
  staleMessage?: string;
}

interface Props {
  review: ObserverEditReviewState;
  settings: LocalSettings["editor"];
  theme: string;
  applying: boolean;
  onAccept: () => void;
  onReject: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
}

export default function ObserverEditReview({ review, settings, theme, applying, onAccept, onReject, onRegenerate, onCopy }: Props) {
  const edit = review.suggestion.edit;
  return <section className="observer-edit-review" aria-label="Observer edit review">
    <header>
      <div><strong>Review Observer Change</strong><span>{edit?.targetRelativePath}</span></div>
      <div className="observer-review-actions">
        <button onClick={onCopy}>Copy Proposed Code</button>
        <button onClick={onRegenerate}>Regenerate</button>
        <button onClick={onReject}>Reject Change</button>
        <button className="primary" disabled={applying || Boolean(review.staleMessage)} onClick={onAccept}>{applying ? "Creating checkpoint…" : "Accept Change"}</button>
      </div>
    </header>
    <div className="observer-review-meta">
      <p>{review.suggestion.explanation}</p><p>{review.suggestion.reason}</p>
      <span>{review.contextSummary}</span>
      {review.request.editBase?.basedOnUnsavedContent && <strong>Based on unsaved editor content — accepting will keep this tab dirty.</strong>}
      {edit?.warnings?.map((warning) => <em key={warning}>{warning}</em>)}
      {review.staleMessage && <strong className="stale" role="alert">{review.staleMessage}</strong>}
    </div>
    <div className="observer-review-labels"><span>Original</span><span>Proposed (not applied)</span></div>
    <DiffEditor
      original={review.originalContent}
      modified={review.proposedContent}
      language={review.request.language}
      theme={theme}
      options={{ readOnly: true, originalEditable: false, automaticLayout: true, renderSideBySide: true,
        fontSize: settings.fontSize, wordWrap: settings.wordWrap ? "on" : "off", minimap: { enabled: false } }}
    />
  </section>;
}
