import assert from "node:assert/strict";
import { resolveStuckConfig } from "../src/lib/stuck-config.ts";
import {
  CursorThrashingDetector,
  RepeatedEditDetector,
  RepeatedErrorDetector,
  StuckDetectorEngine,
} from "../src/lib/stuck-detectors.ts";

const config = resolveStuckConfig("medium", { suggestionCooldownMs: 0 });

function testRepeatedEdits() {
  const detector = new RepeatedEditDetector(config.repeatedEdit);
  for (let repetition = 0; repetition < 2; repetition += 1) {
    assert.equal(
      detector.observe({
        startLine: 10,
        endLine: 10,
        removedTextLength: 3,
        insertedText: "new",
        timestamp: repetition * 2_000,
      }),
      null
    );
  }
  const signal = detector.observe({
    startLine: 11,
    endLine: 11,
    removedTextLength: 3,
    insertedText: "again",
    timestamp: 4_000,
  });
  assert.equal(signal?.type, "repeated_edit");
  assert.equal(signal?.count, 3);
}

function testErrorsMustRemainUnresolved() {
  const detector = new RepeatedErrorDetector(config.repeatedError);
  const marker = {
    message: "Cannot find name value",
    startLine: 4,
    endLine: 4,
    severity: 8,
  };
  assert.equal(detector.observe([marker], 0), null);
  assert.equal(detector.observe([marker], 1_000)?.type, "repeated_error");
  assert.equal(detector.observe([], 2_000), null);
  assert.equal(detector.observe([marker], 3_000), null);
}

function testCursorThrashing() {
  const detector = new CursorThrashingDetector(config.cursorThrashing);
  let signal = null;
  for (let index = 0; index < config.cursorThrashing.movementCount; index += 1) {
    signal = detector.observe(20 + (index % 2), index * 2_500);
  }
  assert.equal(signal?.type, "cursor_thrashing");
  assert.deepEqual(signal?.region, { startLine: 20, endLine: 21 });
}

function testFastCursorThrashingStillUsesBandDuration() {
  const detector = new CursorThrashingDetector(config.cursorThrashing);
  let signal = null;
  for (let index = 0; index <= 25; index += 1) {
    signal = detector.observe(30 + (index % 2), index * 1_000);
  }
  assert.equal(signal?.type, "cursor_thrashing");
  assert.equal(signal?.windowMs, 25_000);
}

function testWeakSignalDoesNotTrigger() {
  const engine = new StuckDetectorEngine(config);
  for (let repetition = 0; repetition < 3; repetition += 1) {
    const result = engine.recordEdit({
      startLine: 2,
      endLine: 2,
      removedTextLength: 1,
      insertedText: "x",
      timestamp: repetition * 1_000,
    });
    assert.equal(result, null);
  }

  const marker = { message: "Expected token", startLine: 2, endLine: 2, severity: 8 };
  assert.equal(engine.recordMarkers([marker], 3_000), null);
  const stuck = engine.recordMarkers([marker], 4_000);
  assert.deepEqual(stuck?.detectorTypes.sort(), ["repeated_edit", "repeated_error"]);
  assert.equal(stuck?.score, 1.9);
}

testRepeatedEdits();
testErrorsMustRemainUnresolved();
testCursorThrashing();
testFastCursorThrashingStillUsesBandDuration();
testWeakSignalDoesNotTrigger();
console.log("stuck detector harness: all assertions passed");
