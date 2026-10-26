# Native DOMException adapter

Local replacement for the deprecated node-domexception polyfill used by fetch-blob.
On the required Node 26 runtime, the original package already exported the native
constructor. This adapter preserves that contract without worker-thread fallback
or global mutation. It fails explicitly on unsupported runtimes.

The root npm file dependency resolves this directory and satisfies fetch-blob's existing ^1.0.0 requirement without an override. Both image dependency layers and
runtimes must include it because npm file dependencies are symlinks. Regression
tests exercise constructor identity and real file-backed Blob errors. Remove this
adapter when the upstream chain stops importing the deprecated package.
