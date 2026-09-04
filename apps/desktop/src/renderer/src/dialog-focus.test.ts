import assert from "node:assert/strict";
import test from "node:test";
import { wrappedFocusIndex } from "./dialog-focus.ts";

test("dialog focus wraps forward and backward at modal boundaries", () => {
  assert.equal(wrappedFocusIndex(2, 3, false), 0);
  assert.equal(wrappedFocusIndex(0, 3, true), 2);
  assert.equal(wrappedFocusIndex(1, 3, false), 2);
  assert.equal(wrappedFocusIndex(1, 3, true), 0);
});

test("dialog focus enters predictably and handles an empty dialog", () => {
  assert.equal(wrappedFocusIndex(-1, 3, false), 0);
  assert.equal(wrappedFocusIndex(-1, 3, true), 2);
  assert.equal(wrappedFocusIndex(-1, 0, false), -1);
});
