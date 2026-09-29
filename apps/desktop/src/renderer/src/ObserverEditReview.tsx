import { FixMarkdown } from "./FixCodeCard";
import { useEffect, useRef } from "react";
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
  const disposeModels = useRef<(() => void) | null>(null);
  // Monaco cancels the detached diff model on the next task; release text models after that.
  useEffect(() => () => disposeModels.current?.(), []);
  const edit = review.suggestion.edit;
  return <section className="observer-edit-review" aria-label="Observer edit review">
    <header>
      <div><strong>Review Observer Change</strong><span>{edit?.targetRelativePath}</span></div>
      <div className="observer-review-actions">
        <button onClick={onCopy}>Copy Proposed Code</button>
        <button onClick={onRegenerate}>{review.request.improveCode ? "New Improve Code review" : review.request.fixCode ? "New Fix Code review" : "Regenerate"}</button>
        <button onClick={onReject}>Reject Change</button>
        <button className="primary" disabled={applying || Boolean(review.staleMessage)} onClick={onAccept}>{applying ? "Creating checkpoint…" : "Accept Change"}</button>
      </div>
    </header>
    <div className="observer-review-meta">
      {review.suggestion.historyWarning && <p role="status">{review.suggestion.historyWarning}</p>}
      {(review.request.fixCode || review.request.improveCode) ? <><FixMarkdown>{review.suggestion.explanation}</FixMarkdown>{review.request.improveCode && <><strong>Trade-offs and assumptions</strong><FixMarkdown>{review.suggestion.tradeoffs ?? ""}</FixMarkdown></>}<strong>How to verify (not executed)</strong><FixMarkdown>{review.suggestion.verification ?? ""}</FixMarkdown></> : <><p>{review.suggestion.explanation}</p><p>{review.suggestion.reason}</p></>}
      <span>{review.contextSummary}</span>
      {review.request.editBase?.basedOnUnsavedContent && <strong>Based on unsaved editor content — accepting will keep this tab dirty.</strong>}
      {edit?.warnings?.map((warning) => <em key={warning}>{warning}</em>)}
      {review.staleMessage && <strong className="stale" role="alert">{review.staleMessage}</strong>}
    </div>
    <div className="observer-review-labels"><span>Original</span><span>Proposed (not applied)</span></div>
    <DiffEditor
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      onMount={(editor) => {
        const models = editor.getModel();
        disposeModels.current = () => {
          editor.setModel(null);
          window.setTimeout(() => { models?.original.dispose(); models?.modified.dispose(); }, 0);
        };
      }}
      original={review.originalContent}
      modified={review.proposedContent}
      language={review.request.language}
      theme={theme}
      options={{ readOnly: true, originalEditable: false, automaticLayout: true, renderSideBySide: true,
        fontSize: settings.fontSize, wordWrap: settings.wordWrap ? "on" : "off", minimap: { enabled: false } }}
    />
  </section>;
}
