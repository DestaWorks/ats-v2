# Third-party licenses

> **Generated — do not edit by hand.** `pnpm license:sbom` regenerates this from
> `pnpm licenses list --json --prod`, i.e. pnpm's own resolution of the committed lockfile.
> `pnpm license:check` fails CI when a dependency arrives under a licence nobody has reviewed.

This is the record of third-party components required by **PROJECT-CONTEXT.md / NDA §5b**,
which also binds the project to permissive licences only — no GPL, LGPL or AGPL without the
Owner's prior written consent.

**762 production packages across 20 licences.**

## By licence

### (AFL-2.1 OR BSD-3-Clause) — 1

`json-schema`

### (MIT AND Zlib) — 1

`pako`

### (MIT OR CC0-1.0) — 1

`type-fest`

### (MIT OR GPL-3.0-or-later) — 1

`jszip`

### 0BSD — 1

`tslib`

### Apache-2.0 — 93

`@ai-sdk/anthropic` · `@ai-sdk/gateway` · `@ai-sdk/google` · `@ai-sdk/openai` · `@ai-sdk/provider-utils` · `@ai-sdk/provider` · `@apm-js-collab/code-transformer` · `@apm-js-collab/tracing-hooks` · `@aws-sdk/checksums` · `@aws-sdk/client-s3` · `@aws-sdk/core` · `@aws-sdk/credential-provider-env` · `@aws-sdk/credential-provider-http` · `@aws-sdk/credential-provider-ini` · `@aws-sdk/credential-provider-login` · `@aws-sdk/credential-provider-node` · `@aws-sdk/credential-provider-process` · `@aws-sdk/credential-provider-sso` · `@aws-sdk/credential-provider-web-identity` · `@aws-sdk/middleware-sdk-s3` · `@aws-sdk/nested-clients` · `@aws-sdk/s3-request-presigner` · `@aws-sdk/signature-v4-multi-region` · `@aws-sdk/token-providers` · `@aws-sdk/types` · `@aws-sdk/xml-builder` · `@aws/lambda-invoke-store` · `@e965/xlsx` · `@electric-sql/pglite-socket` · `@electric-sql/pglite-tools` · `@electric-sql/pglite` · `@eslint/config-array` · `@eslint/config-helpers` · `@eslint/core` · `@eslint/object-schema` · `@eslint/plugin-kit` · `@humanfs/core` · `@humanfs/node` · `@humanfs/types` · `@humanwhocodes/module-importer` · `@humanwhocodes/retry` · `@img/sharp-darwin-arm64` · `@opentelemetry/api-logs` · `@opentelemetry/api` · `@opentelemetry/core` · `@opentelemetry/instrumentation` · `@opentelemetry/resources` · `@opentelemetry/sdk-trace-base` · `@opentelemetry/sdk-trace` · `@opentelemetry/semantic-conventions` · `@prisma/adapter-pg` · `@prisma/client-runtime-utils` · `@prisma/client` · `@prisma/config` · `@prisma/debug` · `@prisma/driver-adapter-utils` · `@prisma/engines-version` · `@prisma/engines` · `@prisma/fetch-engine` · `@prisma/get-platform` · `@prisma/query-plan-executor` · `@prisma/streams-local` · `@prisma/studio-core` · `@smithy/core` · `@smithy/credential-provider-imds` · `@smithy/fetch-http-handler` · `@smithy/node-http-handler` · `@smithy/signature-v4` · `@smithy/types` · `@swc/helpers` · `@vercel/oidc` · `@webassemblyjs/leb128` · `@workflow/serde` · `@xtuc/long` · `ai` · `aria-query` · `axobject-query` · `baseline-browser-mapping` · `cluster-key-slot` · `denque` · `detect-libc` · `doctrine` · `eslint-visitor-keys` · `expect-type` · `import-in-the-middle` · `long` · `pdfjs-dist` · `prisma` · `reflect-metadata` · `rxjs` · `semifies` · `sharp` · `typescript`

### BSD-2-Clause — 10

`damerau-levenshtein` · `dotenv` · `eslint-scope` · `espree` · `esrecurse` · `estraverse` · `esutils` · `terser` · `uri-js` · `webidl-conversions`

### BSD-3-Clause — 9

`@xtuc/ieee754` · `d3-ease` · `deepmerge-ts` · `esquery` · `fast-uri` · `ieee754` · `qs` · `source-map-js` · `source-map`

### BlueOak-1.0.0 — 5

`glob` · `lru-cache` · `minimatch` · `minipass` · `path-scurry`

### CC-BY-4.0 *(reviewed)* — 1

> `caniuse-lite` — a browser-support DATA set, not code. Attribution only.

`caniuse-lite`

### CC0-1.0 — 1

`language-subtag-registry`

### FSL-1.1-MIT *(reviewed)* — 2

> `@sentry/cli`, a build-time tool that ships in no runtime image. The Functional Source License forbids building a competing product with it and converts to MIT after two years; neither restriction touches this app.

`@sentry/cli-darwin` · `@sentry/cli`

### ISC — 36

`@prisma/dev` · `d3-array` · `d3-color` · `d3-format` · `d3-interpolate` · `d3-path` · `d3-scale` · `d3-shape` · `d3-time-format` · `d3-time` · `d3-timer` · `electron-to-chromium` · `eslint-import-resolver-typescript` · `fastq` · `flatted` · `foreground-child` · `glob-parent` · `graceful-fs` · `inherits` · `internmap` · `isexe` · `iterare` · `lru-cache` · `meriyah` · `minimatch` · `once` · `pg-int8` · `picocolors` · `semver` · `setprototypeof` · `siginfo` · `signal-exit` · `split2` · `which` · `wrappy` · `yallist`

### LGPL-3.0-or-later *(reviewed)* — 1

> libvips, reached through `sharp`, which Next.js installs for image optimisation. NDA §5b names LGPL as needing the Owner's prior written consent — and the obligations it is worried about attach to DISTRIBUTION. This app distributes it nowhere: `next/image` is used in no screen, and a search of all five container images for `sharp`/`libvips` returns nothing. It is present only in the build workspace, unmodified, and never shipped. Re-check this if `next/image` is ever adopted, since that would put libvips into the web image.

`@img/sharp-libvips-darwin-arm64`

### MIT — 592

`@apm-js-collab/code-transformer-bundler-plugins` · `@babel/code-frame` · `@babel/compat-data` · `@babel/core` · `@babel/generator` · `@babel/helper-compilation-targets` · `@babel/helper-globals` · `@babel/helper-module-imports` · `@babel/helper-module-transforms` · `@babel/helper-string-parser` · `@babel/helper-validator-identifier` · `@babel/helper-validator-option` · `@babel/helpers` · `@babel/parser` · `@babel/template` · `@babel/traverse` · `@babel/types` · `@better-auth/core` · `@better-auth/drizzle-adapter` · `@better-auth/kysely-adapter` · `@better-auth/memory-adapter` · `@better-auth/mongo-adapter` · `@better-auth/prisma-adapter` · `@better-auth/telemetry` · `@better-auth/utils` · `@better-fetch/fetch` · `@borewit/text-codec` · `@dnd-kit/accessibility` · `@dnd-kit/core` · `@dnd-kit/sortable` · `@dnd-kit/utilities` · `@esbuild/darwin-arm64` · `@eslint-community/eslint-utils` · `@eslint-community/regexpp` · `@eslint/eslintrc` · `@eslint/js` · `@heroicons/react` · `@hono/node-server` · `@hookform/resolvers` · `@img/colour` · `@jridgewell/gen-mapping` · `@jridgewell/remapping` · `@jridgewell/resolve-uri` · `@jridgewell/source-map` · `@jridgewell/sourcemap-codec` · `@jridgewell/trace-mapping` · `@kurkle/color` · `@lukeed/csprng` · `@napi-rs/canvas-darwin-arm64` · `@napi-rs/canvas` · `@nestjs/common` · `@nestjs/core` · `@nestjs/platform-express` · `@next/env` · `@next/eslint-plugin-next` · `@next/swc-darwin-arm64` · `@noble/ciphers` · `@noble/hashes` · `@nodelib/fs.scandir` · `@nodelib/fs.stat` · `@nodelib/fs.walk` · `@nolyfill/is-core-module` · `@pinojs/redact` · `@radix-ui/primitive` · `@radix-ui/react-compose-refs` · `@radix-ui/react-primitive` · `@radix-ui/react-slot` · `@radix-ui/react-toggle` · `@radix-ui/react-use-controllable-state` · `@radix-ui/react-use-effect-event` · `@radix-ui/react-use-layout-effect` · `@redis/bloom` · `@redis/client` · `@redis/json` · `@redis/search` · `@redis/time-series` · `@reduxjs/toolkit` · `@rollup/plugin-commonjs` · `@rollup/pluginutils` · `@rollup/rollup-darwin-arm64` · `@rtsao/scc` · `@rushstack/eslint-patch` · `@sentry/babel-plugin-component-annotate` · `@sentry/browser-utils` · `@sentry/browser` · `@sentry/bundler-plugin-core` · `@sentry/bundler-plugins` · `@sentry/conventions` · `@sentry/core` · `@sentry/feedback` · `@sentry/nextjs` · `@sentry/node-core` · `@sentry/node` · `@sentry/opentelemetry` · `@sentry/react` · `@sentry/replay-canvas` · `@sentry/replay` · `@sentry/server-utils` · `@sentry/vercel-edge` · `@sentry/webpack-plugin` · `@standard-schema/spec` · `@standard-schema/utils` · `@tokenizer/inflate` · `@tokenizer/token` · `@types/d3-array` · `@types/d3-color` · `@types/d3-ease` · `@types/d3-interpolate` · `@types/d3-path` · `@types/d3-scale` · `@types/d3-shape` · `@types/d3-time` · `@types/d3-timer` · `@types/estree` · `@types/json-schema` · `@types/json5` · `@types/node` · `@types/pg` · `@types/react-dom` · `@types/react` · `@types/use-sync-external-store` · `@typescript-eslint/eslint-plugin` · `@typescript-eslint/parser` · `@typescript-eslint/project-service` · `@typescript-eslint/scope-manager` · `@typescript-eslint/tsconfig-utils` · `@typescript-eslint/type-utils` · `@typescript-eslint/types` · `@typescript-eslint/typescript-estree` · `@typescript-eslint/utils` · `@typescript-eslint/visitor-keys` · `@unrs/resolver-binding-darwin-arm64` · `@vitest/expect` · `@vitest/mocker` · `@vitest/pretty-format` · `@vitest/runner` · `@vitest/snapshot` · `@vitest/spy` · `@vitest/utils` · `@webassemblyjs/ast` · `@webassemblyjs/floating-point-hex-parser` · `@webassemblyjs/helper-api-error` · `@webassemblyjs/helper-buffer` · `@webassemblyjs/helper-numbers` · `@webassemblyjs/helper-wasm-bytecode` · `@webassemblyjs/helper-wasm-section` · `@webassemblyjs/ieee754` · `@webassemblyjs/utf8` · `@webassemblyjs/wasm-edit` · `@webassemblyjs/wasm-gen` · `@webassemblyjs/wasm-opt` · `@webassemblyjs/wasm-parser` · `@webassemblyjs/wast-printer` · `accepts` · `acorn-jsx` · `acorn` · `agent-base` · `ajv-formats` · `ajv-keywords` · `ajv` · `ansi-styles` · `append-field` · `array-buffer-byte-length` · `array-includes` · `array.prototype.findlast` · `array.prototype.findlastindex` · `array.prototype.flat` · `array.prototype.flatmap` · `array.prototype.tosorted` · `arraybuffer.prototype.slice` · `assertion-error` · `ast-types-flow` · `astring` · `async-function` · `atomic-sleep` · `available-typed-arrays` · `aws-ssl-profiles` · `balanced-match` · `better-auth` · `better-call` · `better-result` · `body-parser` · `bowser` · `brace-expansion` · `braces` · `browserslist` · `buffer-from` · `busboy` · `bytes` · `c12` · `cac` · `call-bind-apply-helpers` · `call-bind` · `call-bound` · `callsites` · `chai` · `chalk` · `chart.js` · `check-error` · `chokidar` · `chrome-trace-event` · `cjs-module-lexer` · `client-only` · `clsx` · `color-convert` · `color-name` · `commander` · `commondir` · `concat-map` · `concat-stream` · `confbox` · `content-disposition` · `content-type` · `convert-source-map` · `cookie-signature` · `cookie` · `core-util-is` · `cors` · `cron-parser` · `cross-spawn` · `csstype` · `data-view-buffer` · `data-view-byte-length` · `data-view-byte-offset` · `debug` · `decimal.js-light` · `deep-eql` · `deep-is` · `define-data-property` · `define-properties` · `defu` · `depd` · `destr` · `dunder-proto` · `ee-first` · `effect` · `emoji-regex` · `empathic` · `encodeurl` · `enhanced-resolve` · `env-paths` · `es-abstract-get` · `es-abstract` · `es-define-property` · `es-errors` · `es-iterator-helpers` · `es-module-lexer` · `es-object-atoms` · `es-set-tostringtag` · `es-shim-unscopables` · `es-to-primitive` · `es-toolkit` · `esbuild` · `escalade` · `escape-html` · `escape-string-regexp` · `eslint-config-next` · `eslint-import-resolver-node` · `eslint-module-utils` · `eslint-plugin-eslint-comments` · `eslint-plugin-import` · `eslint-plugin-jsx-a11y` · `eslint-plugin-react-hooks` · `eslint-plugin-react` · `eslint` · `estree-walker` · `etag` · `eventemitter3` · `events` · `eventsource-parser` · `express` · `exsolve` · `fast-check` · `fast-deep-equal` · `fast-glob` · `fast-json-stable-stringify` · `fast-levenshtein` · `fast-safe-stringify` · `fdir` · `file-entry-cache` · `file-type` · `fill-range` · `finalhandler` · `find-up` · `flat-cache` · `for-each` · `forwarded` · `fresh` · `fsevents` · `function-bind` · `function.prototype.name` · `functions-have-names` · `generate-function` · `generator-function` · `gensync` · `get-intrinsic` · `get-port-please` · `get-proto` · `get-symbol-description` · `get-tsconfig` · `giget` · `globals` · `globalthis` · `gopd` · `grammex` · `graphmatch` · `has-bigints` · `has-flag` · `has-property-descriptors` · `has-proto` · `has-symbols` · `has-tostringtag` · `hasown` · `hono` · `http-errors` · `http-status-codes` · `https-proxy-agent` · `iconv-lite` · `ignore` · `immediate` · `immer` · `import-fresh` · `imurmurhash` · `internal-slot` · `ipaddr.js` · `is-array-buffer` · `is-async-function` · `is-bigint` · `is-boolean-object` · `is-bun-module` · `is-callable` · `is-core-module` · `is-data-view` · `is-date-object` · `is-document.all` · `is-extglob` · `is-finalizationregistry` · `is-generator-function` · `is-glob` · `is-map` · `is-negative-zero` · `is-number-object` · `is-number` · `is-promise` · `is-property` · `is-reference` · `is-regex` · `is-set` · `is-shared-array-buffer` · `is-string` · `is-symbol` · `is-typed-array` · `is-weakmap` · `is-weakref` · `is-weakset` · `isarray` · `iterator.prototype` · `jest-worker` · `jiti` · `jose` · `js-tokens` · `js-yaml` · `jsesc` · `json-buffer` · `json-schema-traverse` · `json-stable-stringify-without-jsonify` · `json5` · `jsx-ast-utils` · `keyv` · `kysely` · `language-tags` · `levn` · `lie` · `load-esm` · `locate-path` · `lodash.merge` · `loose-envify` · `loupe` · `lru.min` · `luxon` · `magic-string` · `math-intrinsics` · `media-typer` · `merge-descriptors` · `merge-stream` · `merge2` · `micromatch` · `mime-db` · `mime-types` · `minimist` · `minimizer-webpack-plugin` · `module-details-from-path` · `ms` · `multer` · `mysql2` · `named-placeholders` · `nanoid` · `nanostores` · `napi-postinstall` · `natural-compare` · `negotiator` · `neo-async` · `next` · `node-exports-info` · `node-fetch` · `node-releases` · `non-error` · `object-assign` · `object-inspect` · `object-keys` · `object.assign` · `object.entries` · `object.fromentries` · `object.groupby` · `object.values` · `ohash` · `on-exit-leak-free` · `on-finished` · `optionator` · `own-keys` · `p-limit` · `p-locate` · `papaparse` · `parent-module` · `parseurl` · `path-exists` · `path-key` · `path-parse` · `path-to-regexp` · `pathe` · `pathval` · `perfect-debounce` · `pg-boss` · `pg-cloudflare` · `pg-connection-string` · `pg-pool` · `pg-protocol` · `pg-types` · `pg` · `pgpass` · `picomatch` · `pino-abstract-transport` · `pino-std-serializers` · `pino` · `pkg-types` · `possible-typed-array-names` · `postcss` · `postgres-array` · `postgres-bytea` · `postgres-date` · `postgres-interval` · `prelude-ls` · `process-nextick-args` · `process-warning` · `progress` · `prop-types` · `proper-lockfile` · `proxy-addr` · `proxy-from-env` · `punycode` · `pure-rand` · `queue-microtask` · `quick-format-unescaped` · `range-parser` · `raw-body` · `rc9` · `react-dom` · `react-hook-form` · `react-is` · `react-redux` · `react` · `readable-stream` · `readdirp` · `real-require` · `recharts` · `redis` · `redux-thunk` · `redux` · `reflect.getprototypeof` · `regexp.prototype.flags` · `remeda` · `require-from-string` · `require-in-the-middle` · `reselect` · `resolve-from` · `resolve-pkg-maps` · `resolve` · `retry` · `reusify` · `rollup` · `rou3` · `router` · `run-parallel` · `safe-array-concat` · `safe-buffer` · `safe-push-apply` · `safe-regex-test` · `safe-stable-stringify` · `safer-buffer` · `scheduler` · `schema-utils` · `send` · `seq-queue` · `serialize-error` · `serve-static` · `server-only` · `set-cookie-parser` · `set-function-length` · `set-function-name` · `set-proto` · `setimmediate` · `shebang-command` · `shebang-regex` · `side-channel-list` · `side-channel-map` · `side-channel-weakmap` · `side-channel` · `sonic-boom` · `sonner` · `source-map-support` · `sqlstring` · `stable-hash` · `stackback` · `stacktrace-parser` · `statuses` · `std-env` · `stop-iteration-iterator` · `streamsearch` · `string.prototype.includes` · `string.prototype.matchall` · `string.prototype.repeat` · `string.prototype.trim` · `string.prototype.trimend` · `string.prototype.trimstart` · `string_decoder` · `strip-bom` · `strip-json-comments` · `strtok3` · `styled-jsx` · `supports-color` · `supports-preserve-symlinks-flag` · `tagged-tag` · `tapable` · `thread-stream` · `tiny-invariant` · `tinybench` · `tinyexec` · `tinyglobby` · `tinypool` · `tinyrainbow` · `tinyspy` · `to-regex-range` · `toidentifier` · `token-types` · `tr46` · `ts-api-utils` · `tsconfig-paths` · `type-check` · `type-is` · `typed-array-buffer` · `typed-array-byte-length` · `typed-array-byte-offset` · `typed-array-length` · `typedarray` · `uid` · `uint8array-extras` · `unbox-primitive` · `undici-types` · `unpipe` · `unrs-resolver` · `update-browserslist-db` · `use-sync-external-store` · `util-deprecate` · `valibot` · `vary` · `vite-node` · `vite` · `vitest` · `watchpack` · `webpack-sources` · `webpack` · `whatwg-url` · `which-boxed-primitive` · `which-builtin-type` · `which-collection` · `which-typed-array` · `why-is-node-running` · `word-wrap` · `xtend` · `yocto-queue` · `zeptomatch` · `zod`

### MIT AND ISC — 1

`victory-vendor`

### MIT-0 — 1

`nodemailer`

### MPL-2.0 *(reviewed)* — 3

> File-level copyleft: it reaches modified MPL files only, never the code that imports them. `lightningcss` and `axe-core` are used unmodified, so nothing of ours is affected.

`axe-core` · `lightningcss-darwin-arm64` · `lightningcss`

### Python-2.0 — 1

`argparse`

### Unlicense — 1

`postgres`

