import type {
  DetectorType,
  StuckDetectionConfig,
} from "./stuck-config.ts";

export interface LineRegion {
  startLine: number;
  endLine: number;
}

export interface DetectorSignal {
  type: DetectorType;
  count: number;
  observedAt: number;
  windowMs: number;
  region: LineRegion;
  score: number;
  signature?: string;
}

export interface StuckMetadata {
  detectorTypes: DetectorType[];
  signals: DetectorSignal[];
  score: number;
  threshold: number;
  detectedAt: number;
}

export interface EditObservation extends LineRegion {
  removedTextLength: number;
  insertedText: string;
  timestamp: number;
}

export interface MarkerObservation extends LineRegion {
  message: string;
  severity: number;
}

interface TimedRegion extends LineRegion {
  timestamp: number;
}

function regionsNear(a: LineRegion, b: LineRegion, span: number) {
  return a.startLine <= b.endLine + span && b.startLine <= a.endLine + span;
}

function mergedRegion(regions: LineRegion[]): LineRegion {
  return {
    startLine: Math.min(...regions.map((region) => region.startLine)),
    endLine: Math.max(...regions.map((region) => region.endLine)),
  };
}

export class RepeatedEditDetector {
  private pendingDeletes: TimedRegion[] = [];
  private repetitions: TimedRegion[] = [];

  constructor(private readonly config: StuckDetectionConfig["repeatedEdit"]) {}

  observe(edit: EditObservation): DetectorSignal | null {
    const cutoff = edit.timestamp - this.config.windowMs;
    this.pendingDeletes = this.pendingDeletes.filter((item) => item.timestamp >= cutoff);
    this.repetitions = this.repetitions.filter((item) => item.timestamp >= cutoff);

    const region = {
      startLine: edit.startLine,
      endLine: Math.max(edit.startLine, edit.endLine),
      timestamp: edit.timestamp,
    };
    const isDelete = edit.removedTextLength > 0;
    const isInsert = edit.insertedText.length > 0;

    if (isDelete && isInsert) {
      this.repetitions.push(region);
    } else if (isDelete) {
      this.pendingDeletes.push(region);
    } else if (isInsert) {
      const index = this.pendingDeletes.findLastIndex((candidate) =>
        regionsNear(candidate, region, this.config.regionLineSpan)
      );
      if (index >= 0) {
        this.pendingDeletes.splice(index, 1);
        this.repetitions.push(region);
      }
    }

    const nearby = this.repetitions.filter((item) =>
      regionsNear(item, region, this.config.regionLineSpan)
    );
    if (nearby.length < this.config.repetitionThreshold) return null;

    return {
      type: "repeated_edit",
      count: nearby.length,
      observedAt: edit.timestamp,
      windowMs: this.config.windowMs,
      region: mergedRegion(nearby),
      score: this.config.score,
    };
  }
}

interface ErrorState {
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
  marker: MarkerObservation;
}

export class RepeatedErrorDetector {
  private errors = new Map<string, ErrorState>();

  constructor(private readonly config: StuckDetectionConfig["repeatedError"]) {}

  observe(markers: MarkerObservation[], timestamp: number): DetectorSignal | null {
    const current = new Set<string>();
    let strongest: { signature: string; state: ErrorState } | null = null;

    for (const marker of markers) {
      const signature = `${marker.message.trim()}|${marker.startLine}:${marker.endLine}`;
      current.add(signature);
      const previous = this.errors.get(signature);
      const state =
        previous && timestamp - previous.firstSeenAt <= this.config.observationWindowMs
          ? { ...previous, count: previous.count + 1, lastSeenAt: timestamp, marker }
          : { count: 1, firstSeenAt: timestamp, lastSeenAt: timestamp, marker };
      this.errors.set(signature, state);
      if (!strongest || state.count > strongest.state.count) {
        strongest = { signature, state };
      }
    }

    for (const signature of this.errors.keys()) {
      if (!current.has(signature)) this.errors.delete(signature);
    }

    if (!strongest || strongest.state.count < this.config.occurrenceThreshold) {
      return null;
    }

    return {
      type: "repeated_error",
      count: strongest.state.count,
      observedAt: timestamp,
      windowMs: this.config.observationWindowMs,
      region: {
        startLine: strongest.state.marker.startLine,
        endLine: strongest.state.marker.endLine,
      },
      score: this.config.score,
      signature: strongest.signature,
    };
  }
}

interface CursorObservation {
  line: number;
  timestamp: number;
}

export class CursorThrashingDetector {
  private movements: CursorObservation[] = [];

  constructor(
    private readonly config: StuckDetectionConfig["cursorThrashing"]
  ) {}

  observe(line: number, timestamp: number): DetectorSignal | null {
    const previous = this.movements.at(-1);
    if (previous?.line === line) return null;

    this.movements.push({ line, timestamp });
    this.movements = this.movements.slice(-this.config.movementCount);
    if (this.movements.length < this.config.movementCount) return null;

    const first = this.movements[0];
    const duration = timestamp - first.timestamp;
    const lines = this.movements.map((movement) => movement.line);
    const minLine = Math.min(...lines);
    const maxLine = Math.max(...lines);
    const forwardProgress = line - first.line;
    if (
      duration < this.config.durationMs ||
      maxLine - minLine > this.config.lineBand ||
      forwardProgress >= this.config.meaningfulForwardProgress
    ) {
      return null;
    }

    return {
      type: "cursor_thrashing",
      count: this.movements.length,
      observedAt: timestamp,
      windowMs: duration,
      region: { startLine: minLine, endLine: maxLine },
      score: this.config.score,
    };
  }
}

export class StuckDetectorEngine {
  readonly repeatedEdit: RepeatedEditDetector;
  readonly repeatedError: RepeatedErrorDetector;
  readonly cursorThrashing: CursorThrashingDetector;
  private activeSignals = new Map<DetectorType, DetectorSignal>();
  private lastSuggestionAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly config: StuckDetectionConfig) {
    this.repeatedEdit = new RepeatedEditDetector(config.repeatedEdit);
    this.repeatedError = new RepeatedErrorDetector(config.repeatedError);
    this.cursorThrashing = new CursorThrashingDetector(config.cursorThrashing);
  }

  recordEdit(edit: EditObservation) {
    return this.combine(this.repeatedEdit.observe(edit), edit.timestamp);
  }

  recordMarkers(markers: MarkerObservation[], timestamp: number) {
    const signal = this.repeatedError.observe(markers, timestamp);
    if (!signal) this.activeSignals.delete("repeated_error");
    return this.combine(signal, timestamp);
  }

  recordCursor(line: number, timestamp: number) {
    return this.combine(this.cursorThrashing.observe(line, timestamp), timestamp);
  }

  private combine(signal: DetectorSignal | null, timestamp: number): StuckMetadata | null {
    if (signal) this.activeSignals.set(signal.type, signal);
    for (const [type, active] of this.activeSignals) {
      if (timestamp - active.observedAt > this.config.combinationWindowMs) {
        this.activeSignals.delete(type);
      }
    }

    const signals = [...this.activeSignals.values()];
    const score = signals.reduce((total, active) => total + active.score, 0);
    if (
      signals.length < 2 ||
      score < this.config.scoreThreshold ||
      timestamp - this.lastSuggestionAt < this.config.suggestionCooldownMs
    ) {
      return null;
    }

    this.lastSuggestionAt = timestamp;
    return {
      detectorTypes: signals.map((active) => active.type),
      signals,
      score: Number(score.toFixed(2)),
      threshold: this.config.scoreThreshold,
      detectedAt: timestamp,
    };
  }
}
