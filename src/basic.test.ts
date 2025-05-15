// Copyright 2025 Takin Profit. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import { test } from "node:test"
import assert from "node:assert/strict"
import Fastify from "fastify"
import type { AddressInfo } from "node:net"
import fastifySeaStatic, { type SeaAssetProvider } from "./fastify-sea-static"

// Sample test content
const TEST_CONTENT = {
	index: "<html>Test</html>",
	css: "body { color: red; }",
	image: Buffer.from("fake-image-data"),
	deep: "<html>Deep path test file</html>",
	dirIndex: "<html>Directory Index</html>",
	json: '{"test": true}',
	foo: "<html>Foo</html>",
}

// Create a mock asset provider that implements the required methods
// and has optional methods defined as well
const mockAssetProvider: SeaAssetProvider = {
	isSea: () => true,

	// Implementation for getAsset with proper handling of overloads
	getAsset: (key: string, encoding?: string) => {
		console.log(`getAsset called with key: "${key}", encoding: ${encoding}`)

		// Define the asset content based on the path
		let content: Buffer

		// Handle trailing slashes and special paths
		const cleanKey = key.replace(/\/$/, "")

		// Match patterns for all test cases
		if (cleanKey === "client/index.html")
			content = Buffer.from(TEST_CONTENT.index)
		else if (cleanKey === "client/style.css")
			content = Buffer.from(TEST_CONTENT.css)
		else if (cleanKey === "client/images/logo.png") content = TEST_CONTENT.image
		else if (cleanKey === "client/deep/path/for/test/file.html")
			content = Buffer.from(TEST_CONTENT.deep)
		else if (cleanKey === "client/deep/path/for/test/index.html")
			content = Buffer.from(TEST_CONTENT.dirIndex)
		else if (cleanKey === "client/sample.json")
			content = Buffer.from(TEST_CONTENT.json)
		else if (cleanKey === "client/foo.html")
			content = Buffer.from(TEST_CONTENT.foo)
		// Special case for root directory
		else if (cleanKey === "client") content = Buffer.from(TEST_CONTENT.foo)
		else {
			console.log(`No match found for key: "${key}"`)
			throw new Error(`No matching asset found for ${key}`)
		}

		console.log(`Found content for "${key}", length: ${content.length}`)

		// Return string or ArrayBuffer based on encoding
		if (encoding) {
			return content.toString(encoding as BufferEncoding)
		}

		// Return as ArrayBuffer
		return content.buffer.slice(
			content.byteOffset,
			content.byteOffset + content.byteLength
		) as ArrayBuffer
	},

	// Optional methods
	getAssetAsBlob: (key: string, options?: { type: string }): Blob => {
		try {
			// Get the content
			const content = mockAssetProvider.getAsset(key)

			// Create a Blob from the content
			return new Blob([content], {
				type: options?.type ?? getMimeType(key),
			})
		} catch (err) {
			console.error(`Error getting asset as blob for key: "${key}"`, err)
			throw err // Re-throw the error if asset not found
		}
	},

	getRawAsset: (key: string): ArrayBuffer => {
		try {
			// Similar to getAsset but for "raw" access
			return mockAssetProvider.getAsset(key) as ArrayBuffer
		} catch (err) {
			console.error(`Error getting raw asset for key: "${key}"`, err)
			throw err // Re-throw the error if asset not found
		}
	},
}

// Helper function to determine MIME type based on file extension
function getMimeType(path: string): string {
	const ext = path.split(".").pop()?.toLowerCase()

	switch (ext) {
		case "html":
			return "text/html"
		case "css":
			return "text/css"
		case "js":
			return "application/javascript"
		case "json":
			return "application/json"
		case "png":
			return "image/png"
		case "jpg":
		case "jpeg":
			return "image/jpeg"
		case "gif":
			return "image/gif"
		case "svg":
			return "image/svg+xml"
		default:
			return "application/octet-stream"
	}
}

// 1. Basic functionality tests
test("serves static files", async t => {
	// Setup server with mock asset provider
	const fastify = Fastify()

	await fastify.register(fastifySeaStatic, {
		root: "client",
		assetProvider: mockAssetProvider,
	})

	t.after(() => fastify.close())

	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// Tests
	console.log(`Requesting ${address}/index.html`)
	const htmlResponse = await fetch(`${address}/index.html`)
	console.log(`Response status: ${htmlResponse.status}`)
	assert.equal(htmlResponse.status, 200)
	assert.equal(await htmlResponse.text(), TEST_CONTENT.index)
	assert.equal(
		htmlResponse.headers.get("content-type"),
		"text/html; charset=utf-8"
	)

	console.log(`Requesting ${address}/style.css`)
	const cssResponse = await fetch(`${address}/style.css`)
	assert.equal(cssResponse.status, 200)
	assert.equal(
		cssResponse.headers.get("content-type"),
		"text/css; charset=utf-8"
	)

	console.log(`Requesting ${address}/not-found.html`)
	const notFoundResponse = await fetch(`${address}/not-found.html`)
	assert.equal(notFoundResponse.status, 404)

	console.log(`Requesting ${address}/deep/path/for/test/`)
	const dirResponse = await fetch(`${address}/deep/path/for/test/`)
	assert.equal(dirResponse.status, 200)
	assert.equal(await dirResponse.text(), TEST_CONTENT.dirIndex)
})

// 2. Test prefix option
test("supports prefix option", async t => {
	// Setup server with mock asset provider
	const fastify = Fastify()
	await fastify.register(fastifySeaStatic, {
		root: "client",
		prefix: "/static",
		assetProvider: mockAssetProvider,
	})

	t.after(() => fastify.close())
	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// With prefix
	const prefixResponse = await fetch(`${address}/static/index.html`)
	assert.equal(prefixResponse.status, 200)
	assert.equal(await prefixResponse.text(), TEST_CONTENT.index)

	// Outside prefix
	const outsidePrefixResponse = await fetch(`${address}/index.html`)
	assert.equal(outsidePrefixResponse.status, 404)
})

// 3. Test decorators
test("provides reply decorators", async t => {
	// Setup server with mock asset provider
	const fastify = Fastify()
	await fastify.register(fastifySeaStatic, {
		root: "client",
		assetProvider: mockAssetProvider,
	})

	// Add routes using decorators
	fastify.get("/custom", (req, reply) => {
		return reply.sendFile("index.html")
	})

	fastify.get("/download", (req, reply) => {
		return reply.download("sample.json", "renamed.json")
	})

	t.after(() => fastify.close())
	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// Test sendFile
	const sendFileResponse = await fetch(`${address}/custom`)
	assert.equal(sendFileResponse.status, 200)
	assert.equal(await sendFileResponse.text(), TEST_CONTENT.index)

	// Test download
	const downloadResponse = await fetch(`${address}/download`)
	assert.equal(downloadResponse.status, 200)
	assert.equal(await downloadResponse.text(), TEST_CONTENT.json)
	assert.equal(
		downloadResponse.headers.get("content-disposition"),
		'attachment; filename="renamed.json"'
	)
})

// 4. Test caching options
test("supports caching options", async t => {
	// Setup server with cache options
	const fastify = Fastify()
	await fastify.register(fastifySeaStatic, {
		root: "client",
		maxAge: 3600,
		assetProvider: mockAssetProvider,
	})

	t.after(() => fastify.close())
	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// Check cache headers
	const response = await fetch(`${address}/index.html`)
	assert.equal(response.status, 200)
	assert.equal(response.headers.get("cache-control"), "public, max-age=3600")
})

// 5. Test disabling decorators
test("allows disabling decorators", async t => {
	// Setup server with decorateReply: false
	const fastify = Fastify()
	await fastify.register(fastifySeaStatic, {
		root: "client",
		decorateReply: false,
		assetProvider: mockAssetProvider,
	})

	// Add a route to verify decorators don't exist
	fastify.get("/test-decorate", (req, reply) => {
		// Type assertion to check for decorator presence
		type ReplyWithOptional = typeof reply & {
			sendFile?: unknown
			download?: unknown
		}

		const extendedReply = reply as ReplyWithOptional
		assert.equal(extendedReply.sendFile, undefined)
		assert.equal(extendedReply.download, undefined)

		return reply.send({ success: true })
	})

	t.after(() => fastify.close())
	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// Test that route works and decorators aren't present
	const response = await fetch(`${address}/test-decorate`)
	assert.equal(response.status, 200)
	const data = (await response.json()) as { success: boolean }
	assert.deepEqual(data, { success: true })
})

// 6. Test disable serving
test("allows disabling serving", async t => {
	// Setup server with serve: false
	const fastify = Fastify()
	await fastify.register(fastifySeaStatic, {
		root: "client",
		serve: false,
		assetProvider: mockAssetProvider,
	})

	// Add a route using sendFile
	fastify.get("/custom", (req, reply) => {
		return reply.sendFile("index.html")
	})

	t.after(() => fastify.close())
	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// Static path should return 404
	const notServedResponse = await fetch(`${address}/index.html`)
	assert.equal(notServedResponse.status, 404)

	// Custom route should still work
	const customResponse = await fetch(`${address}/custom`)
	assert.equal(customResponse.status, 200)
	assert.equal(await customResponse.text(), TEST_CONTENT.index)
})



// 8. Test redirect option
test("supports redirect option", async t => {
	// Setup server with redirect option
	const fastify = Fastify()
	await fastify.register(fastifySeaStatic, {
		root: "client",
		redirect: true,
		assetProvider: mockAssetProvider,
	})

	t.after(() => fastify.close())
	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// Test redirect for directory without trailing slash
	const response = await fetch(`${address}/deep/path/for/test`, {
		redirect: "manual", // Don't follow redirects automatically
	})

	assert.equal(response.status, 302) // or 301 depending on your implementation
	assert.equal(response.headers.get("location"), "/deep/path/for/test/")
})

// 9. Test custom index files
test("supports custom index files", async t => {
	// Setup server with custom index
	const fastify = Fastify()

	await fastify.register(fastifySeaStatic, {
		root: "client",
		index: ["foo.html", "index.html"],
		assetProvider: mockAssetProvider,
	})

	t.after(() => fastify.close())
	await fastify.listen({ port: 0 })
	const address = `http://localhost:${(fastify.server.address() as AddressInfo).port}`

	// Root should serve first available index (foo.html)
	console.log(`Requesting ${address}/`)
	const response = await fetch(`${address}/`)
	console.log(`Response status: ${response.status}`)

	// If it fails, check the HTML response for clues
	const text = await response.text()
	console.log(
		`Response body length: ${text.length}, expected: ${TEST_CONTENT.foo.length}`
	)

	assert.equal(response.status, 200)
	assert.equal(text, TEST_CONTENT.foo)
})
