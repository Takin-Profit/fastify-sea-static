// Copyright 2025 Takin Profit. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import type {
	FastifyInstance,
	FastifyPluginAsync,
	FastifyReply,
	FastifyRequest,
	LogLevel,
} from "fastify"
import { Readable } from "node:stream"
import path from "node:path"
import fp from "fastify-plugin"
import send from "@fastify/send"
import contentDisposition from "content-disposition"

// Complete Sea API interface matching the Node.js type definitions
export interface SeaAssetProvider {
	/**
	 * @return Whether this script is running inside a single-executable application.
	 */
	isSea(): boolean

	/**
	 * This method can be used to retrieve the assets configured to be bundled into the
	 * single-executable application at build time.
	 * An error is thrown when no matching asset can be found.
	 */
	getAsset(key: string, encoding?: string): ArrayBuffer | string

	/**
	 * Similar to `sea.getAsset()`, but returns the result in a `Blob`.
	 * An error is thrown when no matching asset can be found.
	 */
	getAssetAsBlob?: (
		key: string,
		options?: {
			type: string
		}
	) => Blob

	/**
	 * This method can be used to retrieve the assets configured to be bundled into the
	 * single-executable application at build time.
	 * An error is thrown when no matching asset can be found.
	 *
	 * Unlike `sea.getAsset()` or `sea.getAssetAsBlob()`, this method does not
	 * return a copy. Instead, it returns the raw asset bundled inside the executable.
	 */
	getRawAsset?: (key: string) => ArrayBuffer
}

/**
 * Options for the fastify-sea-static plugin
 */
export interface FastifySeaStaticOptions {
	/** How to handle dotfiles: "allow", "deny", or "ignore" (default: "allow") */
	dotfiles?: "allow" | "deny" | "ignore"
	assetProvider?: SeaAssetProvider
	/** Root directory in the SEA assets (default: 'client') */
	root?: string
	/** URL path prefix (default: '/') */
	prefix?: string
	/** If true, no trailing "/" is added to the prefix */
	prefixAvoidTrailingSlash?: boolean
	/** Hide the route schema in documentation (default: true) */
	schemaHide?: boolean
	/** Log level for the plugin */
	logLevel?: LogLevel
	/** Route constraints */
	constraints?: Record<string, unknown>
	/** If false, don't decorate reply with sendFile */
	decorateReply?: boolean
	/** If false, don't set up routes, just add decorators */
	serve?: boolean
	/** Function to set custom headers on the response */
	setHeaders?: (
		reply: unknown,
		filepath: string,
		stat: { size: number }
	) => void
	/** Enable or disable Cache-Control header (default: true) */
	cacheControl?: boolean
	/** Max age for Cache-Control header in seconds (default: 31536000 - 1 year) */
	maxAge?: number
	/** Enable or disable ETag header (default: true) */
	etag?: boolean
	/** Enable or disable Last-Modified header (default: true) */
	lastModified?: boolean
	/** Index filenames to try when accessing a directory (default: ['index.html']) */
	index?: string | string[] | false
	/** If true, redirect to directory with trailing slash (default: false) */
	redirect?: boolean
	  /** Whether to throw errors to be caught by Fastify's error handler */
	  useErrorHandler?: boolean;
}

/**
 * Options for sendFile and download methods
 */
export interface StaticFileOptions {
	/** Root directory to use instead of the plugin's root */
	root?: string
	/** Enable or disable Cache-Control header */
	cacheControl?: boolean
	/** Max age for Cache-Control header in seconds */
	maxAge?: number
	/** Enable or disable ETag header */
	etag?: boolean
	/** Enable or disable Last-Modified header */
	lastModified?: boolean
	/** How to handle dotfiles: "allow", "deny", or "ignore" */
	dotfiles?: "allow" | "deny" | "ignore"
	  /** Whether to throw errors to be caught by Fastify's error handler */
	  useErrorHandler?: boolean;
}

// Extend FastifyReply interface to include our custom methods
declare module "fastify" {
	interface FastifyReply {
		/** Send a file from SEA assets */
		sendFile(filepath: string, options?: StaticFileOptions): FastifyReply
		sendFile(
			filepath: string,
			root?: string,
			options?: StaticFileOptions
		): FastifyReply
		/** Send a file with Content-Disposition header for download */
		download(
			filepath: string,
			filename: string,
			options?: StaticFileOptions
		): FastifyReply
		download(filepath: string, options?: StaticFileOptions): FastifyReply
	}
}

/**
 * Get the SEA module or a fallback if not in a SEA environment
 * This is a function to delay the require until runtime
 */
/**
 * Get the SEA module or a fallback if not in a SEA environment
 * This is a function to delay the require until runtime
 */
function getSeaModule(): SeaAssetProvider {
	try {
		// Only try to require node:sea in a dynamic context
		return require("node:sea")
	} catch (e) {
		// Create a mock provider that matches the interface
		const mockProvider = {
			isSea: () => false,

			// Implementation for both overloads
			getAsset(key: string, encoding?: string): ArrayBuffer | string {
				if (encoding) {
					return "" // String version when encoding is provided
				}
				return new ArrayBuffer(0) // ArrayBuffer when no encoding
			},

			getAssetAsBlob: (key: string, options?: { type: string }): Blob => {
				return new Blob([], { type: options?.type })
			},

			getRawAsset: (key: string): ArrayBuffer => {
				return new ArrayBuffer(0)
			},
		}

		// Cast to the correct interface
		return mockProvider as SeaAssetProvider
	}
}
// Cache for MIME types to avoid repeated lookups
const mimeTypeCache = new Map<string, string>()

/**
 * A Fastify plugin to serve static files from SEA assets
 */
const fastifySeaStatic: FastifyPluginAsync<FastifySeaStaticOptions> = async (
	fastify: FastifyInstance,
	opts: FastifySeaStaticOptions
): Promise<void> => {
	// Use the provided asset provider or get the default one
	const { isSea, getAsset } = opts.assetProvider || getSeaModule()
	// Validate if we're running in a SEA environment
	if (!isSea()) {
		fastify.log.warn(
			"fastify-sea-static is being used but we are not running in a SEA environment"
		)
	}

	// Set default options
	const prefix = opts.prefix ?? "/"
	const root = opts.root ?? "client"
	const indexFiles =
		opts.index === false
			? []
			: opts.index === undefined
				? ["index.html"]
				: Array.isArray(opts.index)
					? opts.index
					: [opts.index]

	// Normalize the root path (remove leading/trailing slashes)
	const normalizedRoot = root
		.replace(/^\/+/, "") // Remove leading slashes
		.replace(/\/+$/, "") // Remove trailing slashes

	// Set the final prefix with or without trailing slash
	const finalPrefix = opts.prefixAvoidTrailingSlash
		? prefix
		: prefix.endsWith("/")
			? prefix
			: `${prefix}/`

	// Decorating reply with sendFile and download methods
	if (opts.decorateReply !== false) {
		// Define sendFile decorator
		fastify.decorateReply(
			"sendFile",
			function (
				this: FastifyReply,
				filepath: string,
				rootOrOpts?: string | StaticFileOptions,
				options?: StaticFileOptions
			): FastifyReply {
				let fileOptions: StaticFileOptions = {}
				let fileRoot = normalizedRoot

				if (typeof rootOrOpts === "string") {
					fileRoot = rootOrOpts
					if (options) {
						fileOptions = options
					}
				} else if (rootOrOpts && typeof rootOrOpts === "object") {
					fileOptions = rootOrOpts
					if (rootOrOpts.root) {
						fileRoot = rootOrOpts.root
					}
				}

				// Start sending the file - this must be synchronous
				void sendSeaAsset(this.request, this, filepath, fileRoot, fileOptions)
				return this
			}
		)

		// Define download decorator
		fastify.decorateReply(
			"download",
			function (
				this: FastifyReply,
				filepath: string,
				filenameOrOpts?: string | StaticFileOptions,
				options?: StaticFileOptions
			): FastifyReply {
				let fileOptions: StaticFileOptions = {}
				let filename = filepath

				if (typeof filenameOrOpts === "string") {
					filename = filenameOrOpts
					if (options) {
						fileOptions = options
					}
				} else if (filenameOrOpts && typeof filenameOrOpts === "object") {
					fileOptions = filenameOrOpts
				}

				// Set content disposition header for downloads
				this.header("content-disposition", contentDisposition(filename))

				// Start sending the file - this must be synchronous
				void sendSeaAsset(
					this.request,
					this,
					filepath,
					fileOptions.root ?? normalizedRoot,
					fileOptions
				)
				return this
			}
		)
	}

	// Set up routes to serve static files
	if (opts.serve !== false) {
		// Register the wildcard route
		fastify.route({
			method: ["HEAD", "GET"],
			url: finalPrefix === "/" ? "/*" : `${finalPrefix}*`,
			config: {
				// Set schemaHide in the route config
				...(opts.schemaHide !== undefined && { hide: opts.schemaHide }),
			},
			// Use empty FastifySchema object to match the expected type
			schema: {},
			logLevel: opts.logLevel as LogLevel | undefined,
			constraints: opts.constraints,
			handler: (req, reply) => {
				const params = req.params as Record<string, string> | null
				const requestPath = params?.["*"] ?? ""

				// Handle trailing slash redirect if enabled
				if (opts.redirect && requestPath && !requestPath.endsWith("/")) {
					try {
						const testPath = path.posix.join(normalizedRoot, requestPath)

						// Check if any index file exists
						let indexFound = false

						for (const index of indexFiles) {
							try {
								const indexPath = path.posix.join(testPath, index)
								getAsset(indexPath)
								indexFound = true
								break
							} catch {
								// Index not found, continue checking
							}
						}

						if (indexFound) {
							const redirectUrl = `${req.url}/`
							return reply.redirect(redirectUrl)
						}
					} catch {
						// Ignore errors during redirect check
					}
				}

				return sendSeaAsset(req, reply, requestPath, normalizedRoot)
			},
		})
	}

/**
 * Send a SEA asset to the client
 */
async function sendSeaAsset(
    request: FastifyRequest,
    reply: FastifyReply,
    filepath: string,
    root: string,
    options: StaticFileOptions = {}
): Promise<FastifyReply> {
    // Clean the filepath (remove leading slash and normalize path)
    const cleanFilepath = filepath.replace(/^\/+/, "")

    // Get the useErrorHandler option (default to false for backward compatibility)
    const useErrorHandler = options.useErrorHandler ?? opts.useErrorHandler ?? false;

    // Check if this is a dotfile request
    const isDotfile = cleanFilepath.split('/').some(part => part.startsWith('.') && part !== '.' && part !== '..');

    // Handle dotfiles according to the option
    if (isDotfile) {
        const dotfilesOption = options.dotfiles ?? opts.dotfiles ?? 'allow';

        if (dotfilesOption === 'deny') {
            // Return 403 Forbidden for dotfiles
            reply.code(403).send({ error: 'Forbidden' });
            return reply;
        // biome-ignore lint/style/noUselessElse: <explanation>
        } else if (dotfilesOption === 'ignore') {
            // Handle not found based on useErrorHandler option
            if (useErrorHandler) {
                const error = new Error(`File not found: ${filepath}`);
				Object.assign(error, {
					statusCode: 404
				});
                throw error;
            // biome-ignore lint/style/noUselessElse: <explanation>
            } else {
                reply.callNotFound();
                return reply;
            }
        }
        // If 'allow', continue processing as normal
    }

    // Build the full asset path
    let assetPath = path.posix.join(root, cleanFilepath)

    try {
        try {
            // First try to get the asset directly
            getAsset(assetPath)
        } catch (err) {
            // If direct path fails, check if it's a directory request
            if (cleanFilepath === "" || cleanFilepath.endsWith("/")) {
                let foundIndex = false

                // Try to find an index file
                for (const index of indexFiles) {
                    try {
                        const indexPath = path.posix.join(assetPath, index)
                        getAsset(indexPath)
                        assetPath = indexPath
                        foundIndex = true
                        break
                    } catch {
                        // Continue trying other index files
                    }
                }

                // If no index file found, handle not found
                if (!foundIndex) {
                    if (useErrorHandler) {
                        const error = new Error(`No index file found in directory: ${assetPath}`);
						Object.assign(error, {
							statusCode: 404
						});
                        throw error;
                    // biome-ignore lint/style/noUselessElse: <explanation>
                    } else {
                        reply.callNotFound();
                        return reply;
                    }
                }
            } else {
                // Check if it's a directory without trailing slash
                let foundIndex = false
                for (const index of indexFiles) {
                    try {
                        const indexPath = path.posix.join(assetPath, index)
                        getAsset(indexPath)

                        // If redirect is enabled, redirect to the path with trailing slash
                        if (opts.redirect) {
                            const redirectUrl = `${request.url}/`
                            reply.redirect(redirectUrl)
                            return reply
                        }

                        // Otherwise serve the index file
                        assetPath = indexPath
                        foundIndex = true
                        break
                    } catch {
                        // Continue trying other index files
                    }
                }

                // If no index file found and not a redirect, throw the error
                if (!foundIndex) {
                    throw err
                }
            }
        }

        // Get the asset content
        const asset = getAsset(assetPath) as ArrayBuffer

        // Set the content type based on the file extension
        const contentType = getContentType(assetPath)
        if (contentType) {
            reply.header("content-type", contentType)
        }

        // Set cache control headers if needed
        if (options.cacheControl !== false && opts.cacheControl !== false) {
            const maxAge = options.maxAge ?? opts.maxAge ?? 31536000
            reply.header("cache-control", `public, max-age=${maxAge}`)
        }

        // Set ETag header if needed
        if (options.etag !== false && opts.etag !== false) {
            // Create a simple ETag based on the first bytes of the content and file size
            const assetSize = asset?.byteLength
            const etag = Buffer.from(asset?.slice(0, Math.min(100, assetSize)))
                .toString("base64")
                .substring(0, 16)
            const etagValue = `"${etag}-${assetSize}"`
            reply.header("etag", etagValue)

            // Check for conditional request (If-None-Match header)
            const ifNoneMatch = request.headers['if-none-match']
            if (ifNoneMatch && ifNoneMatch === etagValue) {
                // If ETag matches, return 304 Not Modified without the body
                reply.code(304).send()
                return reply
            }
        }

        // Set Last-Modified header if needed
        if (options.lastModified !== false && opts.lastModified !== false) {
            reply.header("last-modified", new Date().toUTCString())
        }

        // If custom headers function is provided, call it
        if (opts.setHeaders) {
            try {
                // Pass the reply object directly, with size information
                opts.setHeaders(reply, assetPath, { size: asset?.byteLength || 0 })
            } catch (headerError) {
                // Add error handling to prevent 500s
                console.error(`Error setting headers: ${headerError}`)
                // Continue without custom headers if there's an error
            }
        }

        // Set status code (200 OK) - after all the header logic
        reply.code(200)

        // Create a readable stream from the asset
        const stream = Readable.from(Buffer.from(asset))

        await reply.send(stream)
        return reply
    } catch (err) {
        // If the asset doesn't exist, handle not found based on useErrorHandler option
        const errorMessage = err instanceof Error ? err.message : String(err)

        if (
            errorMessage.includes("No matching asset found") ||
            errorMessage.includes("ENOENT") ||
            errorMessage.includes("not found")
        ) {
            if (useErrorHandler) {
                // Use custom error handler by throwing an error
                const error = new Error(`File not found: ${filepath}`);
				Object.assign(error, {
					statusCode: 404
				});
                throw error;
            // biome-ignore lint/style/noUselessElse: <explanation>
            } else {
                // Use standard not found handler
                reply.callNotFound();
                return reply;
            }
        }

        // For other errors, log and re-throw
        fastify.log.error(`Error serving SEA asset ${assetPath}: ${errorMessage}`)
        throw err
    }
}
	/**
	 * Get the content type based on file extension
	 */
	function getContentType(filepath: string): string {
		const ext = path.extname(filepath).toLowerCase()

		// Use cached MIME type if available
		if (mimeTypeCache.has(ext)) {
			return mimeTypeCache.get(ext) ?? "application/octet-stream"
		}

		// Try to get MIME type from send library
		let mimeType = send.mime.getType(ext.substring(1))

		// Add charset=utf-8 for text-based formats
		if (mimeType && send.isUtf8MimeType(mimeType)) {
			mimeType += "; charset=utf-8"
		}

		// Cache the MIME type for future use
		if (mimeType) {
			mimeTypeCache.set(ext, mimeType)
		}

		return mimeType ?? "application/octet-stream"
	}
}

export default fp(fastifySeaStatic, {
	fastify: "5.x",
	name: "fastify-sea-static",
})

// Also export as named exports for ESM support
export { fastifySeaStatic }
