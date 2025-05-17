# fastify-sea-static

A Fastify plugin for serving static files from Node.js SEA (Single Executable Applications) assets.

[![npm version](https://img.shields.io/npm/v/fastify-sea-static.svg)](https://www.npmjs.com/package/fastify-sea-static)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-orange)](https://www.fastify.io/)

## Description

This plugin allows you to serve static files that are embedded in a Node.js Single Executable Application ([node:sea](https://nodejs.org/api/single-executable-applications.html)) through Fastify's HTTP server. It provides a seamless integration with Fastify and works similar to `@fastify/static`, but specifically for SEA environments.

## Features

- Serve static files embedded in a Node.js SEA
- TypeScript support with full type definitions
- API compatible with `@fastify/static` for easy migration
- Support for index files and directory redirects
- Proper MIME type detection
- Cache control and ETag support
- Conditional requests (304 Not Modified responses)
- Secure against path traversal attacks

## Installation

```bash
npm install fastify-sea-static
```

## Usage

### Basic Usage

```typescript
import Fastify from 'fastify'
import { isSea } from 'node:sea'
import fastifyStatic from '@fastify/static'
import fastifySeaStatic from 'fastify-sea-static'
import path from 'node:path'

const fastify = Fastify({ logger: true })

// Conditionally use the appropriate static file plugin
if (isSea()) {
  // In SEA mode, use fastify-sea-static
  fastify.register(fastifySeaStatic, {
    // The URL prefix for serving files, e.g., '/static' would serve files at /static/*
    prefix: '/',

    // The root directory in the SEA assets structure (as defined in sea-config.json)
    // For example, if your assets are stored as 'client/images/logo.png',
    // setting root to 'client' would allow accessing at '/images/logo.png'
    root: 'client',

    cacheControl: true,
    maxAge: 86400, // 1 day in seconds
  })
} else {
  // In development mode, use @fastify/static
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'dist/client'),
    prefix: '/'
  })
}

// Start the server
fastify.listen({ port: 3000 }, (err) => {
  if (err) throw err
  console.log(`Server listening on ${fastify.server.address().port}`)
})
```

### Bundle Your Application for SEA

When working with SEA, it's highly recommended to bundle your entire application into a single file before building the executable. This provides several advantages:

1. All dependencies are included in the bundle, avoiding file system access
2. The SEA `require()` within the main script doesn't work like the regular Node.js `require()`
3. Bundling ensures a deterministic dependency graph

You can use tools like [esbuild](https://esbuild.github.io/), [Rollup](https://rollupjs.org/), or [Webpack](https://webpack.js.org/) to create a single JavaScript file.

```bash
# Example using esbuild
esbuild src/index.ts --bundle --platform=node --target=node18 --outfile=dist/bundle.js
```

### Creating a SEA executable with your static files

Here's an example of how to create a SEA application that serves static files:

1. **Create a `sea-config.json` file:**

```json
{
  "main": "dist/bundle.js",
  "output": "sea-prep.blob",
  "assets": {
    "client/index.html": "./dist/client/index.html",
    "client/styles.css": "./dist/client/styles.css",
    "client/script.js": "./dist/client/script.js",
    "client/images/logo.png": "./dist/client/images/logo.png"
  }
}
```

2. **Follow the Node.js SEA build process:**

```bash
# Generate the SEA preparation blob
node --experimental-sea-config sea-config.json

# Create a copy of the node executable
cp $(command -v node) my-app

# For macOS, remove the signature
codesign --remove-signature my-app

# Inject the blob into the executable
npx postject my-app NODE_SEA_BLOB sea-prep.blob \
  --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
  --macho-segment-name NODE_SEA

# For macOS, re-sign the binary
codesign --sign - my-app
```

## Reply Decorators

The plugin adds `sendFile` and `download` decorators to the Fastify reply object:

```typescript
// Send a specific file from the SEA assets
fastify.get('/custom-route', (req, reply) => {
  // This will serve the file from the SEA assets at '[root]/index.html'
  return reply.sendFile('index.html')
})

// Download a file with custom filename
fastify.get('/download', (req, reply) => {
  // This will serve the file with a Content-Disposition header
  return reply.download('assets/document.pdf', 'custom-name.pdf')
})
```

## SPA Support

For Single Page Applications (SPAs), you can use a catch-all route:

```typescript
fastify.setNotFoundHandler((request, reply) => {
  // For API routes, return 404 as usual
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' })
  }

  // For all other routes, serve the SPA index.html
  return reply.sendFile('index.html')
})
```

## Plugin Options

| Option                       | Type                      | Default            | Description                                           |
| ---------------------------- | ------------------------- | ------------------ | ----------------------------------------------------- |
| `root`                     | `string`                | `'client'`       | The root directory within your SEA assets structure   |
| `prefix`                   | `string`                | `'/'`            | URL path prefix where the static files will be served |
| `prefixAvoidTrailingSlash` | `boolean`               | `false`          | If true, no trailing "/" is added to the prefix       |
| `schemaHide`               | `boolean`               | `true`           | Hide the route schema in documentation                |
| `logLevel`                 | `LogLevel`              | -                  | Log level for the plugin                              |
| `constraints`              | `object`                | -                  | Route constraints                                     |
| `decorateReply`            | `boolean`               | `true`           | If false, don't decorate reply with sendFile          |
| `serve`                    | `boolean`               | `true`           | If false, don't set up routes, just add decorators    |
| `setHeaders`               | `function`              | -                  | Function to set custom headers on the response        |
| `cacheControl`             | `boolean`               | `true`           | Enable or disable Cache-Control header                |
| `maxAge`                   | `number`                | `31536000`       | Max age for Cache-Control header in seconds (1 year)  |
| `etag`                     | `boolean`               | `true`           | Enable or disable ETag header                         |
| `lastModified`             | `boolean`               | `true`           | Enable or disable Last-Modified header                |
| `index`                    | `string\|string[]\|false` | `['index.html']` | Index filenames to try when accessing a directory     |
| `redirect`                 | `boolean`               | `false`          | If true, redirect to directory with trailing slash    |
| `dotfiles`                 | `string`                | `'allow'`        | How to handle dotfiles: "allow", "deny", or "ignore"  |
| `useErrorHandler`          | `boolean`               | `false`          | Whether to use Fastify's error handler for errors     |
| `allowedPath`              | `function`              | -                  | Function to determine if a file should be served      |
| `assetProvider`            | `SeaAssetProvider`      | -                  | Custom implementation of the SEA asset API            |

## Reply Decorator Options

### `reply.sendFile(filepath, options)`

Sends a file from the SEA assets.

- `filepath`: Path to the file relative to the root
- `options`: Additional options (same as plugin options)

You can also use `reply.sendFile(filepath, root, options)` to specify a different root directory.

### `reply.download(filepath, filename, options)`

Sends a file with Content-Disposition header for download.

- `filepath`: Path to the file relative to the root
- `filename`: Filename to use in the Content-Disposition header (optional)
- `options`: Additional options (same as plugin options)

## Security Considerations

The plugin includes several security features:

- Path traversal protection (prevents access to files outside the assets)
- Null byte injection prevention
- Support for allowed path verification
- Proper handling of dotfiles (configurable)

## Advanced Usage

### Custom Asset Provider

You can provide a custom implementation of the SEA asset API:

```typescript
import fastifySeaStatic, { type SeaAssetProvider } from 'fastify-sea-static'

// Custom provider (e.g., for testing or non-SEA environments)
const customProvider: SeaAssetProvider = {
  isSea: () => true,
  getAsset: (key, encoding) => {
    // Your implementation
  },
  getAssetAsBlob: (key, options) => {
    // Your implementation
  },
  getRawAsset: (key) => {
    // Your implementation
  }
}

fastify.register(fastifySeaStatic, {
  root: 'client',
  assetProvider: customProvider
})
```

### Custom Header Function

```typescript
fastify.register(fastifySeaStatic, {
  root: 'client',
  setHeaders: (reply, filepath, stat) => {
    // Add custom headers based on filepath or stat
    if (filepath.endsWith('.html')) {
      reply.header('X-Content-Type-Options', 'nosniff')
    }

    // Add a custom header with the file size
    reply.header('X-File-Size', stat.size.toString())
  }
})
```

### Advanced Access Control

```typescript
fastify.register(fastifySeaStatic, {
  root: 'client',
  allowedPath: (pathName, root, request) => {
    // Only allow authenticated users to access certain files
    if (pathName.startsWith('restricted/')) {
      return request.user?.isAuthenticated === true
    }
    return true
  }
})
```

## Notes on SEA Assets Structure

When using this plugin with a Node.js Single Executable Application (SEA), it's important to understand how assets are structured within the SEA:

1. In your `sea-config.json`, assets are defined with a key/path structure
2. The plugin's `root` option corresponds to the base directory in your asset keys
3. For example, if your assets are structured as:

   ```json
   {
     "assets": {
       "client/index.html": "/path/to/index.html",
       "client/css/style.css": "/path/to/style.css"
     }
   }
   ```

   Setting `root: 'client'` would allow accessing `index.html` at `/` and `style.css` at `/css/style.css`.

## Development vs. Production

For a seamless development experience, it's recommended to use `@fastify/static` during development and switch to `fastify-sea-static` in production:

```typescript
import Fastify from 'fastify'
import path from 'node:path'

const fastify = Fastify()
const isProduction = process.env.NODE_ENV === 'production'

async function setupServer() {
  if (isProduction) {
    try {
      // In production, attempt to use SEA
      const { isSea } = await import('node:sea')
      const { default: fastifySeaStatic } = await import('fastify-sea-static')

      if (isSea()) {
        fastify.register(fastifySeaStatic, {
          root: 'client',
          prefix: '/'
        })
      } else {
        throw new Error('Not running in SEA environment')
      }
    } catch (err) {
      console.warn('Falling back to @fastify/static:', err)
      const { default: fastifyStatic } = await import('@fastify/static')
      fastify.register(fastifyStatic, {
        root: path.join(__dirname, 'dist/client'),
        prefix: '/'
      })
    }
  } else {
    // In development, use @fastify/static
    const { default: fastifyStatic } = await import('@fastify/static')
    fastify.register(fastifyStatic, {
      root: path.join(__dirname, 'dist/client'),
      prefix: '/'
    })
  }

  // Start the server
  await fastify.listen({ port: 3000 })
  console.log(`Server listening on ${fastify.server.address().port}`)
}

setupServer().catch(console.error)
```

## License

MIT
