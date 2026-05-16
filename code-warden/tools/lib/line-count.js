#!/usr/bin/env node
'use strict';

/**
 * line-count.js
 * Shared line-counting helper for warden-lint and hook consumers.
 *
 * Problem with the naive split('\n').length:
 *   "a\nb\n".split('\n') === ['a', 'b', '']  → length 3, not 2
 * A trailing newline (standard in well-formed files) would push a file
 * that is exactly at the limit over it, producing false positives.
 *
 * This helper normalises CRLF, strips the trailing newline before
 * splitting, and treats an empty string as 0 lines.
 */

/**
 * Count logical lines in a file's content string.
 *
 * @param {string} content - Raw file content (may include CRLF or trailing newline)
 * @returns {number} Line count (0 for empty content)
 */
function countLines(content) {
  if (typeof content !== 'string' || content.length === 0) return 0;
  return content.replace(/\r\n/g, '\n').trimEnd().split('\n').length;
}

module.exports = { countLines };
