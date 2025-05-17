// Copyright 2025 Takin Profit. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import type { AddressInfo } from "node:net"
import { type TestContext, test } from "node:test"
import Fastify, { type FastifyReply } from "fastify"
import fastifySeaStatic, { type SeaAssetProvider } from "./fastify-sea-static"

// Sample test content with various file types
const TEST_CONTENT = {
	html: "<html>Test</html>",
	css: "body { color: red; }",
	javascript: "console.log('test');",
	json: '{"test": true}',
	text: "plain text file",
	binary: Buffer.from("binary-data"),
}

// Create a mock asset provider with various file types
const mockAssetProvider: SeaAssetProvider = {
	isSea: () => true,

	getAsset: (key: string, encoding?: string) => {
		console.log(`getAsset called with key: "${key}", encoding: ${encoding}`)

		// Define the asset content based on the path
		let content: Buffer

		if (key === "client/index.html") content = Buffer.from(TEST_CONTENT.html)
		else if (key === "client/styles.css")
			content = Buffer.from(TEST_CONTENT.css)
		else if (key === "client/script.js")
			content = Buffer.from(TEST_CONTENT.javascript)
		else if (key === "client/data.json")
			content = Buffer.from(TEST_CONTENT.json)
		else if (key === "client/file.txt") content = Buffer.from(TEST_CONTENT.text)
		else if (key === "client/image.bin")
			content = Buffer.from(TEST_CONTENT.binary)
		else {
			console.log(`No match found for key: "${key}"`)
			throw new Error(`No matching asset found for ${key}`)
		}

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

	getAssetAsBlob: (key: string, options?: { type: string }): Blob => {
		try {
			const content = mockAssetProvider.getAsset(key)
			return new Blob([content], { type: options?.type ?? getMimeType(key) })
		} catch (err) {
			console.log(`Error in getAssetAsBlob: ${err}`)
			throw err
		}
	},

	getRawAsset: (key: string): ArrayBuffer => {
		try {
			return mockAssetProvider.getAsset(key) as ArrayBuffer
		} catch (err) {
			console.error(`Error in getRawAsset: ${err}`)
			throw err
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
		case "txt":
			return "text/plain"
		default:
			return "application/octet-stream"
	}
}

test("register /content-type", async t => {
	t.plan(6)

	const pluginOptions = {
		root: "client",
		prefix: "/content-type",
		assetProvider: mockAssetProvider,
	}

	const fastify = Fastify()
	fastify.register(fastifySeaStatic, pluginOptions)

	t.after(() => fastify.close())

	await fastify.listen({ port: 0 })
	const port = (fastify.server.address() as AddressInfo).port

	await t.test("/content-type/index.html", async (t: TestContext) => {
		t.plan(2)

		const response = await fetch(
			`http://localhost:${port}/content-type/index.html`
		)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("content-type"),
			"text/html; charset=utf-8"
		)
	})

	await t.test("/content-type/styles.css", async (t: TestContext) => {
		t.plan(2)

		const response = await fetch(
			`http://localhost:${port}/content-type/styles.css`
		)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("content-type"),
			"text/css; charset=utf-8"
		)
	})

	await t.test("/content-type/script.js", async (t: TestContext) => {
		t.plan(2)

		const response = await fetch(
			`http://localhost:${port}/content-type/script.js`
		)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("content-type"),
			"application/javascript; charset=utf-8"
		)
	})

	await t.test("/content-type/data.json", async (t: TestContext) => {
		t.plan(2)

		const response = await fetch(
			`http://localhost:${port}/content-type/data.json`
		)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("content-type"),
			"application/json; charset=utf-8"
		)
	})

	await t.test("/content-type/file.txt", async (t: TestContext) => {
		t.plan(2)

		const response = await fetch(
			`http://localhost:${port}/content-type/file.txt`
		)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("content-type"),
			"text/plain; charset=utf-8"
		)
	})

	await t.test("/content-type/image.bin", async (t: TestContext) => {
		t.plan(2)

		const response = await fetch(
			`http://localhost:${port}/content-type/image.bin`
		)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("content-type"),
			"application/octet-stream"
		)
	})
})

test("basic setHeaders functionality", async t => {
	t.plan(1)

	const pluginOptions = {
		root: "client",
		prefix: "/simple",
		assetProvider: mockAssetProvider,
		// Extremely simple header setting
		setHeaders: (reply: unknown) => {
			;(reply as FastifyReply)?.header("x-test", "test-value")
		},
	}

	const fastify = Fastify()
	fastify.register(fastifySeaStatic, pluginOptions)

	t.after(() => fastify.close())

	await fastify.listen({ port: 0 })
	const port = (fastify.server.address() as AddressInfo).port

	await t.test("simple header test", async (t: TestContext) => {
		t.plan(3)

		// Add debugging to see exactly what we're requesting and what comes back
		console.log(`Requesting http://localhost:${port}/simple/index.html`)
		const response = await fetch(`http://localhost:${port}/simple/index.html`)
		console.log(`Response status: ${response.status}`)
		console.log(
			`Response headers: ${JSON.stringify(Object.fromEntries([...response.headers.entries()]))}`
		)

		t.assert.equal(response.status, 200, "Response should have status 200")
		t.assert.ok(response.ok, "Response should be ok")
		t.assert.equal(
			response.headers.get("x-test"),
			"test-value",
			"Custom header should be present"
		)
	})
})
