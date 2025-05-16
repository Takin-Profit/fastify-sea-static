// Copyright 2025 Takin Profit. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// edge-cases.test.ts
import { test, type TestContext } from "node:test"
import Fastify from "fastify"
import type { AddressInfo } from "node:net"
import fastifySeaStatic, { type SeaAssetProvider } from "./fastify-sea-static"

// Mock asset provider
const mockAssetProvider: SeaAssetProvider = {
	isSea: () => true,

	getAsset: (key: string, encoding?: string) => {
		console.log(`getAsset called with key: "${key}"`)

		// Test files
		if (key === "client/file.html") {
			const content = Buffer.from("<html>File</html>")
			if (encoding) {
				return content.toString(encoding as BufferEncoding)
			}
			return content.buffer.slice(
				content.byteOffset,
				content.byteOffset + content.byteLength
			) as ArrayBuffer
		}
		if (key === "client/index.html") {
			const content = Buffer.from("<html>Index</html>")
			if (encoding) {
				return content.toString(encoding as BufferEncoding)
			}
			return content.buffer.slice(
				content.byteOffset,
				content.byteOffset + content.byteLength
			) as ArrayBuffer
		}
		if (key === "client/special chars & spaces.html") {
			const content = Buffer.from("<html>Special Characters</html>")
			if (encoding) {
				return content.toString(encoding as BufferEncoding)
			}
			return content.buffer.slice(
				content.byteOffset,
				content.byteOffset + content.byteLength
			) as ArrayBuffer
		}
		if (key === "client/empty") {
			const content = Buffer.from("")
			if (encoding) {
				return content.toString(encoding as BufferEncoding)
			}
			return content.buffer.slice(
				content.byteOffset,
				content.byteOffset + content.byteLength
			) as ArrayBuffer
		}
		if (key === "client/.dotfile") {
			const content = Buffer.from("dot file content")
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
				type: options?.type ?? "text/html",
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

test("error handling", async t => {
	t.plan(3)

	await t.test("404 handling", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/not-found.html`)
		t.assert.deepStrictEqual(response.status, 404)
		t.assert.deepStrictEqual(
			response.headers.get("content-type"),
			"application/json; charset=utf-8"
		)
	})

    await t.test("custom error handler", async (t: TestContext) => {
        t.plan(3)

        const fastify = Fastify()

        // Custom error handler
        fastify.setErrorHandler((err, request, reply) => {
          reply
            .code(500)
            .type("text/plain")
            .send(`Custom Error: ${err.message}`)
        })

        fastify.register(fastifySeaStatic, {
          root: "client",
          assetProvider: mockAssetProvider,
          useErrorHandler: true // Enable this option to use the custom error handler
        })

        t.after(() => fastify.close())
        await fastify.listen({ port: 0 })
        const port = (fastify.server.address() as AddressInfo).port

        const response = await fetch(`http://localhost:${port}/not-found.html`)
        t.assert.deepStrictEqual(response.status, 500)
        t.assert.deepStrictEqual(response.headers.get("content-type"), "text/plain")
        t.assert.ok((await response.text()).includes("Custom Error"))
      })

	await t.test("empty file", async (t: TestContext) => {
		t.plan(3)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/empty`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.status, 200)
		t.assert.deepStrictEqual(await response.text(), "")
	})
})

test("special paths and filenames", async t => {
	t.plan(3)

	await t.test("paths with special characters", async (t: TestContext) => {
		t.plan(3)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(
			`http://localhost:${port}/special%20chars%20%26%20spaces.html`
		)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.status, 200)
		t.assert.deepStrictEqual(
			await response.text(),
			"<html>Special Characters</html>"
		)
	})

	await t.test("dotfiles handling - default", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/.dotfile`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.status, 200)
	})

	await t.test("dotfiles handling - deny", async (t: TestContext) => {
		t.plan(1)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			dotfiles: "deny", // Add this option to your plugin
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/.dotfile`)
		t.assert.deepStrictEqual(response.status, 403)
	})
})

test("index files behavior", async t => {
	t.plan(4)

	await t.test("default index.html", async (t: TestContext) => {
		t.plan(3)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.status, 200)
		t.assert.deepStrictEqual(await response.text(), "<html>Index</html>")
	})

	await t.test("custom index file", async (t: TestContext) => {
		t.plan(3)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			index: "file.html",
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.status, 200)
		t.assert.deepStrictEqual(await response.text(), "<html>File</html>")
	})

	await t.test("multiple index files (fallback)", async (t: TestContext) => {
		t.plan(3)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			index: ["nonexistent.html", "file.html"],
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/`)
		t.assert.ok(response.ok)
		t.assert.deepStrictEqual(response.status, 200)
		t.assert.deepStrictEqual(await response.text(), "<html>File</html>")
	})

	await t.test("disable index files", async (t: TestContext) => {
		t.plan(2)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			index: false,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		const response = await fetch(`http://localhost:${port}/`)
		t.assert.deepStrictEqual(response.status, 404)
		t.assert.ok(!response.ok)
	})
})
