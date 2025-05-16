// Copyright 2025 Takin Profit. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// performance.test.ts
import { test, type TestContext } from "node:test"
import Fastify from "fastify"
import type { AddressInfo } from "node:net"
import fastifySeaStatic, { type SeaAssetProvider } from "./fastify-sea-static"

// Mock asset provider with simple test content
const mockAssetProvider: SeaAssetProvider = {
	isSea: () => true,

	getAsset: (key: string, encoding?: string) => {
		// Simple mock with one test file
		if (key === "client/test.html") {
			const content = Buffer.from("<html>Test</html>")
			if (encoding) {
				return content.toString(encoding as BufferEncoding)
			}
			return content.buffer.slice(
				content.byteOffset,
				content.byteOffset + content.byteLength
			) as ArrayBuffer
		}
		throw new Error(`No matching asset found for ${key}`)
	},

	getAssetAsBlob: (key: string, options?: { type: string }): Blob => {
		try {
			const content = mockAssetProvider.getAsset(key)
			return new Blob([content], {
				type:
					options?.type ??
					(key.endsWith(".html") ? "text/html" : "application/octet-stream"),
			})
		} catch (err) {
			console.error(`Error in getAssetAsBlob: ${err}`)
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

test("caching options", async t => {
	t.plan(3)

	await t.test("default cache settings", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/test.html`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("cache-control"),
			"public, max-age=31536000"
		)
	})

	await t.test("custom maxAge", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			maxAge: 3600, // 1 hour
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/test.html`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(
			response.headers.get("cache-control"),
			"public, max-age=3600"
		)
	})

	await t.test("ETag and conditional request", async (t: TestContext) => {
		t.plan(3)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			etag: true,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		// First request to get the ETag
		const response1 = await fetch(`http://localhost:${port}/test.html`)
		t.assert.ok(response1.ok)
		const etag = response1.headers.get("etag")
		t.assert.ok(etag !== null)

		// Second request with If-None-Match header
		const response2 = await fetch(`http://localhost:${port}/test.html`, {
			headers: {
				"If-None-Match": etag,
			},
		})
		t.assert.deepStrictEqual(response2.status, 304)
	})
})

test("disabling cache features", async t => {
	t.plan(3)

	await t.test("disable cacheControl", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			cacheControl: false,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/test.html`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.headers.get("cache-control"), null)
	})

	await t.test("disable etag", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			etag: false,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/test.html`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.headers.get("etag"), null)
	})

	await t.test("disable lastModified", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			lastModified: false,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/test.html`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.headers.get("last-modified"), null)
	})
})
