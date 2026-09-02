import assert from "node:assert/strict";
import { test } from "node:test";
import { sitePattern } from "./site-access.ts";

test("builds exact per-origin match patterns", () => {
  assert.equal(sitePattern("https://docs.example.test/path?q=1"), "https://docs.example.test/*");
  assert.equal(sitePattern("http://localhost:8080/page"), "http://localhost:8080/*");
});

test("rejects internal, file, malformed, and credential-bearing pages", () => {
  for (const value of ["chrome://extensions", "file:///tmp/test", "about:blank", "not a url", "https://user:pass@example.test/"]) assert.equal(sitePattern(value), null);
});
