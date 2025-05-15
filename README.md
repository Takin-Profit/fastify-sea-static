fastify-sea-static
A Fastify plugin for serving static files from Node.js SEA (Single Executable Applications) assets.
Features

Serves static files from SEA assets with proper MIME types and headers
API compatible with @fastify/static for easy migration
TypeScript support with full type definitions
Support for index files and directory redirection
ETag and cache control headers for optimal performance
Customizable options for flexibility

Installation
bashnpm install fastify-sea-static
Usage
typescriptimport Fastify from 'fastify'
import { isSea } from 'node:sea'
import fastifyStatic from '@fastify/static'
import fastifySeaStatic from 'fastify-sea-static'
import path from 'node:path'

const fastify = Fastify({ logger: true })

// Conditionally use the appropriate static file plugin
if (isSea()) {
  // In SEA mode, use fastify-sea-static
  fastify.register(fastifySeaStatic, {
    prefix: '/',
    root: 'client', // The prefix used in your sea-config.json
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
Using the Reply Decorators
The plugin adds sendFile and download decorators to the reply object:
typescript// Send a specific file from the SEA assets
fastify.get('/custom-route', (req, reply) => {
  return reply.sendFile('index.html')
})

// Download a file with custom filename
fastify.get('/download', (req, reply) => {
  return reply.download('assets/document.pdf', 'custom-name.pdf')
})
SPA Support
For Single Page Applications (SPAs), you can use a catch-all route:
typescriptfastify.setNotFoundHandler((request, reply) => {
  // For API routes, return 404 as usual
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' })
  }

  // For all other routes, serve the SPA index.html
  return reply.sendFile('index.html')
})
Options
OptionTypeDefaultDescriptionrootstring'client'Root directory in the SEA assetsprefixstring'/'URL path prefixprefixAvoidTrailingSlashbooleanfalseIf true, no trailing "/" is added to the prefixschemaHidebooleantrueHide the route schema in documentationlogLevelstring-Log level for the pluginconstraintsobject-Route constraintsdecorateReplybooleantrueIf false, don't decorate reply with sendFileservebooleantrueIf false, don't set up routes, just add decoratorssetHeadersfunction-Function to set custom headers on the responsecacheControlbooleantrueEnable or disable Cache-Control headermaxAgenumber31536000Max age for Cache-Control header in seconds (1 year)etagbooleantrueEnable or disable ETag headerlastModifiedbooleantrueEnable or disable Last-Modified headerindexstring|string[]|false['index.html']Index filenames to try when accessing a directoryredirectbooleanfalseIf true, redirect to directory with trailing slash
Creating a Node.js SEA with Static Assets

1. Create a SEA configuration file
You'll need to generate a sea-config.json file that includes all your static assets:
typescriptimport fs from 'node:fs/promises'
import path from 'node:path'

const CLIENT_DIR = './dist/client'
const CONFIG_PATH = './sea-config.json'

async function scanDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  let files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const subFiles = await scanDirectory(fullPath)
      files = [...files, ...subFiles]
    } else {
      files.push(fullPath)
    }
  }

  return files
}

async function generateSeaConfig() {
  // Scan all files in the client directory
  const files = await scanDirectory(CLIENT_DIR)

  // Create assets object mapping
  const assets = {}
  for (const file of files) {
    const relativePath = path.relative(CLIENT_DIR, file)
    const key = `client/${relativePath}`
    const value = path.resolve(file)
    assets[key] = value
  }

  // Create the SEA config
  const seaConfig = {
    main: './dist/server.js',
    output: './app.blob',
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: true,
    assets,
  }

  // Write the config file
  await fs.writeFile(CONFIG_PATH, JSON.stringify(seaConfig, null, 2))
  console.log(`Generated sea-config.json with ${Object.keys(assets).length} assets`)
}

generateSeaConfig()
2. Build the SEA preparation blob
bashnode --experimental-sea-config sea-config.json
3. Create the SEA executable
Follow the Node.js SEA documentation to create your executable.
For example, on Linux:
bash# Copy the node executable
cp $(which node) app

# Inject the blob

npx postject app NODE_SEA_BLOB app.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
License
MIT
