// Copyright 2025 Takin Profit. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import type { AddressInfo } from "node:net"
import { type TestContext, test } from "node:test"
import Fastify from "fastify"
import fastifySeaStatic, { type SeaAssetProvider } from "./fastify-sea-static"

// Track requested paths for testing path traversal
const requestedPaths: string[] = []

// Mock asset provider with path tracking
const mockAssetProvider: SeaAssetProvider = {
	isSea: () => true,

	getAsset: (key: string, encoding?: string) => {
		// Record requested path for later inspection
		requestedPaths.push(key)

		// Standard test file
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

		// Handle any requested path to see what gets through
		console.log(`Attempted access to: ${key}`)
		throw new Error(`No matching asset found for ${key}`)
	},

	getAssetAsBlob: (key: string, options?: { type: string }): Blob => {
		try {
			const content = mockAssetProvider.getAsset(key)
			return new Blob([content], {
				type: options?.type ?? "text/html",
			})
		} catch (err) {
			console.error(`Error getting asset as blob: ${err}`)
			throw err
		}
	},

	getRawAsset: (key: string): ArrayBuffer => {
		try {
			return mockAssetProvider.getAsset(key) as ArrayBuffer
		} catch (err) {
			console.error(`Error getting raw asset: ${err}`)
			throw err
		}
	},
}

test("path traversal prevention", async t => {
	t.plan(3)

	await t.test(
		"prevents direct parent directory traversal",
		async (t: TestContext) => {
			t.plan(2)

			// Reset tracked paths
			requestedPaths.length = 0

			const fastify = Fastify()
			fastify.register(fastifySeaStatic, {
				root: "client",
				assetProvider: mockAssetProvider,
			})

			t.after(() => fastify.close())
			await fastify.listen({ port: 0 })
			const port = (fastify.server.address() as AddressInfo).port

			await fetch(`http://localhost:${port}/../secret.html`)

			// Check what path was actually requested from the asset provider
			// It should be sanitized to not contain ../ traversal
			t.assert.ok(!requestedPaths.some(p => p.includes("../")))
			t.assert.ok(!requestedPaths.some(p => p.includes("..\\")))
		}
	)

	await t.test(
		"prevents encoded parent directory traversal",
		async (t: TestContext) => {
			t.plan(2)

			// Reset tracked paths
			requestedPaths.length = 0

			const fastify = Fastify()
			fastify.register(fastifySeaStatic, {
				root: "client",
				assetProvider: mockAssetProvider,
			})

			t.after(() => fastify.close())
			await fastify.listen({ port: 0 })
			const port = (fastify.server.address() as AddressInfo).port

			await fetch(`http://localhost:${port}/%2e%2e%2fsecret.html`)

			// Check what path was actually requested from the asset provider
			t.assert.ok(!requestedPaths.some(p => p.includes("../")))
			t.assert.ok(!requestedPaths.some(p => p.includes("..\\")))
		}
	)

	await t.test(
		"prevents traversal with multiple techniques",
		async (t: TestContext) => {
			t.plan(2)

			// Reset tracked paths
			requestedPaths.length = 0

			const fastify = Fastify()
			fastify.register(fastifySeaStatic, {
				root: "client",
				assetProvider: mockAssetProvider,
			})

			t.after(() => fastify.close())
			await fastify.listen({ port: 0 })
			const port = (fastify.server.address() as AddressInfo).port

			await fetch(`http://localhost:${port}/foo/../../bar/../../../secret.html`)

			// Check what path was actually requested from the asset provider
			t.assert.ok(!requestedPaths.some(p => p.includes("../")))
			t.assert.ok(!requestedPaths.some(p => p.includes("..\\")))
		}
	)
})

test("handlers for allowed paths", async t => {
	t.plan(3)

	await t.test("allowedPath option - basic", async (t: TestContext) => {
		t.plan(4)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			allowedPath: pathName => !pathName.includes("forbidden"),
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		// This should be allowed
		const goodResponse = await fetch(`http://localhost:${port}/test.html`)
		t.assert.deepStrictEqual(goodResponse.status, 200)
		t.assert.ok(goodResponse.ok)

		// This should be denied
		const badResponse = await fetch(
			`http://localhost:${port}/forbidden-file.html`
		)
		t.assert.deepStrictEqual(badResponse.status, 404)
		t.assert.ok(!badResponse.ok)
	})

	await t.test("allowedPath with request context", async (t: TestContext) => {
		t.plan(4)

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			allowedPath: (_pathName, _root, request) => {
				if (!request.query) {
					return false
				}
				return (
					(request.query as Record<string, string>).key === "valid-access-token"
				)
			},
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		// Request with valid access token
		const authorizedResponse = await fetch(
			`http://localhost:${port}/test.html?key=valid-access-token`
		)
		t.assert.deepStrictEqual(authorizedResponse.status, 200)
		t.assert.ok(authorizedResponse.ok)

		// Request without access token
		const unauthorizedResponse = await fetch(
			`http://localhost:${port}/test.html`
		)
		t.assert.deepStrictEqual(unauthorizedResponse.status, 404)
		t.assert.ok(!unauthorizedResponse.ok)
	})

	await t.test("allowedPath with complex logic", async (t: TestContext) => {
		t.plan(6)

		const fastify = Fastify()

		// Mock user database for authorization check
		const authorizedPaths = new Map<string, string[]>([
			["admin", ["test.html", "admin-dashboard.html"]],
			["user", ["test.html"]],
		])

		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
			allowedPath: (pathName, _root, request) => {
				// Get user role from query parameter (in a real app, this would be from auth)
				// biome-ignore lint/suspicious/noExplicitAny: <explanation>
				const role = (request.query as any)?.role
				if (!role) return false

				// Get allowed paths for this role
				const allowedFiles = authorizedPaths.get(role)
				if (!allowedFiles) return false

				// Check if the requested file is allowed for this role
				const requestedFile = pathName.split("/").pop() ?? ""
				return allowedFiles.includes(requestedFile)
			},
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		// Admin can access test.html
		const adminTestResponse = await fetch(
			`http://localhost:${port}/test.html?role=admin`
		)
		t.assert.deepStrictEqual(adminTestResponse.status, 200)
		t.assert.ok(adminTestResponse.ok)

		// Regular user can access test.html
		const userTestResponse = await fetch(
			`http://localhost:${port}/test.html?role=user`
		)
		t.assert.deepStrictEqual(userTestResponse.status, 200)
		t.assert.ok(userTestResponse.ok)

		// Regular user cannot access admin-dashboard.html
		const userAdminResponse = await fetch(
			`http://localhost:${port}/admin-dashboard.html?role=user`
		)
		t.assert.deepStrictEqual(userAdminResponse.status, 404)
		t.assert.ok(!userAdminResponse.ok)
	})
})

test("handling malicious requests", async t => {
	t.plan(2)

	await t.test("prevents null byte injection", async (t: TestContext) => {
		t.plan(2)

		// Reset tracked paths
		requestedPaths.length = 0

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		// Use a more explicit cleanup approach
		const server = fastify.server

		try {
			await fastify.listen({ port: 0 })
			const port = (fastify.server.address() as AddressInfo).port

			// Try a null byte injection attack - use explicit error handling
			try {
				const response = await fetch(`http://localhost:${port}/test.html%00.js`)
				// Explicitly consume the response body
				await response.text()
			} catch (error) {
				console.error("Fetch error:", error)
				// Continue with the test even if the fetch fails
			}

			// Check that the null byte was properly sanitized
			t.assert.ok(!requestedPaths.some(p => p.includes("\0")))
			t.assert.ok(!requestedPaths.some(p => p.includes("%00")))
		} finally {
			// Ensure server is closed in a fail-safe way
			await new Promise<void>(resolve => {
				server.close(() => resolve())
			})
		}
	})

	await t.test("prevents double encoding attacks", async (t: TestContext) => {
		t.plan(2)

		// Reset tracked paths
		requestedPaths.length = 0

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			assetProvider: mockAssetProvider,
		})

		// Use a more explicit cleanup approach
		const server = fastify.server

		try {
			await fastify.listen({ port: 0 })
			const port = (fastify.server.address() as AddressInfo).port

			// Try a double encoding attack - use explicit error handling
			try {
				const response = await fetch(
					`http://localhost:${port}/%252e%252e/secret.html`
				)
				// Explicitly consume the response body
				await response.text()
			} catch (error) {
				console.error("Fetch error:", error)
				// Continue with the test even if the fetch fails
			}

			// Check that the double encoding was properly handled
			t.assert.ok(!requestedPaths.some(p => p.includes("../")))
			t.assert.ok(!requestedPaths.some(p => p.includes("..\\")))
		} finally {
			// Ensure server is closed in a fail-safe way
			await new Promise<void>(resolve => {
				server.close(() => resolve())
			})
		}
	})
})

test("security with prefix options", async t => {
	t.plan(1)

	await t.test("ensures security with prefix", async (t: TestContext) => {
		t.plan(2)

		// Reset tracked paths
		requestedPaths.length = 0

		const fastify = Fastify()
		fastify.register(fastifySeaStatic, {
			root: "client",
			prefix: "/static",
			assetProvider: mockAssetProvider,
		})

		t.after(() => fastify.close())
		await fastify.listen({ port: 0 })
		const port = (fastify.server.address() as AddressInfo).port

		// Try path traversal with prefix
		await fetch(`http://localhost:${port}/static/../server-files/secret.html`)

		// Check that this was properly sanitized
		t.assert.ok(!requestedPaths.some(p => p.includes("../server-files")))
		t.assert.ok(!requestedPaths.some(p => p.includes("..\\server-files")))
	})
})
