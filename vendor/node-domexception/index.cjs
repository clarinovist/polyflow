'use strict';

// This application requires Node 26; use its standard implementation.
if (typeof globalThis.DOMException !== 'function') {
    throw new Error('Polyflow requires a runtime with native DOMException (Node 26+).');
}

module.exports = globalThis.DOMException;
