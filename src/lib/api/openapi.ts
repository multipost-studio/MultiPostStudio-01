import { API_SCOPES } from "@/lib/constants";

/**
 * OpenAPI 3.1 description of the public API (/api/v1), for tools that import one: ChatGPT custom GPT actions, Zapier, Make, Postman,
 * code generators. It documents only what the routes really do (see app/api/v1/**); keep it in step with them. A test checks the paths
 * and scopes named here against the routes and the scope list.
 */

const envelope = (data: object) => ({
  type: "object",
  required: ["success", "data", "error"],
  properties: { success: { type: "boolean" }, data, error: { type: ["string", "null"] }, meta: { $ref: "#/components/schemas/Meta" } },
});

const errorResponses = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "401": { $ref: "#/components/responses/Unauthorized" },
  "403": { $ref: "#/components/responses/Forbidden" },
  "429": { $ref: "#/components/responses/RateLimited" },
};

const ok = (description: string, schemaRef: string, array = false) => ({
  description,
  content: { "application/json": { schema: envelope(array ? { type: "array", items: { $ref: schemaRef } } : { $ref: schemaRef }) } },
});

const workspaceId = { name: "workspaceId", in: "query", required: false, schema: { type: "string" }, description: "Limit to one workspace of the organisation." };
const page = { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } };
const limit = { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } };
const postId = { name: "id", in: "path", required: true, schema: { type: "string" } };

export function buildOpenApi(serverUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "MultiPost Studio API",
      version: "1.0.0",
      description:
        "Read channels, posts and analytics, and create, reschedule or delete drafts and scheduled posts. Keys belong to an organisation and carry scopes. " +
        "Posts are saved as drafts or scheduled for a future time; the API does not publish immediately. The same capabilities are available to AI assistants over MCP at /api/mcp.",
    },
    servers: [{ url: serverUrl }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/me": {
        get: {
          operationId: "getMe",
          summary: "Identify the key and its organisation",
          description: "Needs no scope.",
          responses: { "200": ok("The key and organisation", "#/components/schemas/Me"), ...errorResponses },
        },
      },
      "/api/v1/channels": {
        get: {
          operationId: "listChannels",
          summary: "List connected social channels",
          description: "Scope: channels:read",
          parameters: [workspaceId, page, limit],
          responses: { "200": ok("Channels", "#/components/schemas/Channel", true), ...errorResponses },
        },
      },
      "/api/v1/posts": {
        get: {
          operationId: "listPosts",
          summary: "List posts, newest first",
          description: "Scope: posts:read. Send `cursor` (a post id) for stable keyset paging; otherwise `page` and `limit` are used.",
          parameters: [
            workspaceId,
            { name: "status", in: "query", required: false, schema: { type: "string", enum: ["draft", "scheduled", "published", "failed", "awaiting_approval", "approved", "archived"] } },
            page,
            limit,
            { name: "cursor", in: "query", required: false, schema: { type: "string" } },
          ],
          responses: { "200": ok("Posts", "#/components/schemas/PostSummary", true), ...errorResponses },
        },
        post: {
          operationId: "createPost",
          summary: "Create a draft, or schedule a post",
          description:
            "Scope: posts:write. Leave out scheduledAt for a draft. A workspace that requires approval accepts drafts only. Send an Idempotency-Key header so a retry can't create the post twice.",
          parameters: [{ name: "Idempotency-Key", in: "header", required: false, schema: { type: "string", maxLength: 100 } }],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreatePost" } } } },
          responses: { "201": ok("The new post", "#/components/schemas/PostSummary"), "409": { description: "Needs approval, or a duplicate Idempotency-Key" }, ...errorResponses },
        },
      },
      "/api/v1/posts/{id}": {
        get: {
          operationId: "getPost",
          summary: "One post with its channels and metrics",
          description: "Scope: posts:read",
          parameters: [postId],
          responses: { "200": ok("The post", "#/components/schemas/PostDetail"), "404": { description: "Not found" }, ...errorResponses },
        },
        patch: {
          operationId: "updatePost",
          summary: "Rename or reschedule a draft or scheduled post",
          description: "Scope: posts:write. scheduledAt: null moves it back to draft. Published posts can't be edited.",
          parameters: [postId],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdatePost" } } } },
          responses: { "200": ok("The updated post", "#/components/schemas/PostSummary"), "404": { description: "Not found" }, "409": { description: "Published, or needs approval" }, ...errorResponses },
        },
        delete: {
          operationId: "deletePost",
          summary: "Delete a draft or scheduled post",
          description: "Scope: posts:write. This cannot be undone. Published posts can't be deleted.",
          parameters: [postId],
          responses: { "200": { description: "Deleted" }, "404": { description: "Not found" }, "409": { description: "Published" }, ...errorResponses },
        },
      },
      "/api/v1/analytics": {
        get: {
          operationId: "getAnalytics",
          summary: "Aggregate post metrics",
          description: "Scope: analytics:read. `since` defaults to 30 days ago and can be at most 400 days back.",
          parameters: [workspaceId, { name: "since", in: "query", required: false, schema: { type: "string", format: "date-time" } }],
          responses: { "200": ok("Totals", "#/components/schemas/Analytics"), ...errorResponses },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "mps_live_…", description: `Create a key in Settings → API Keys. Scopes: ${API_SCOPES.join(", ")}.` },
      },
      schemas: {
        Meta: { type: "object", properties: { total: { type: "integer" }, page: { type: "integer" }, limit: { type: "integer" }, nextCursor: { type: ["string", "null"] } } },
        Me: {
          type: "object",
          properties: {
            key: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, scopes: { type: "array", items: { type: "string" } } } },
            org: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, slug: { type: "string" }, type: { type: "string" } } },
          },
        },
        Channel: {
          type: "object",
          properties: {
            id: { type: "string" },
            workspaceId: { type: "string" },
            platform: { type: "string" },
            name: { type: "string" },
            handle: { type: "string" },
            followerCount: { type: "integer" },
            queuePaused: { type: "boolean" },
            connectionStatus: { type: "string" },
          },
        },
        PostChannel: { type: "object", properties: { platform: { type: "string" }, body: { type: "string" }, status: { type: "string" }, publishedUrl: { type: ["string", "null"] } } },
        PostSummary: {
          type: "object",
          properties: {
            id: { type: "string" },
            workspaceId: { type: "string" },
            title: { type: "string" },
            status: { type: "string" },
            scheduledAt: { type: ["string", "null"], format: "date-time" },
            publishedAt: { type: ["string", "null"], format: "date-time" },
            channels: { type: "array", items: { $ref: "#/components/schemas/PostChannel" } },
          },
        },
        PostDetail: {
          allOf: [
            { $ref: "#/components/schemas/PostSummary" },
            { type: "object", properties: { firstComment: { type: ["string", "null"] }, metrics: { type: "array", items: { type: "object" } } } },
          ],
        },
        CreatePost: {
          type: "object",
          required: ["workspaceId", "channels"],
          properties: {
            workspaceId: { type: "string" },
            title: { type: "string", maxLength: 200 },
            scheduledAt: { type: "string", format: "date-time", description: "UTC, ending in Z. Must be in the future." },
            channels: {
              type: "array",
              minItems: 1,
              maxItems: 10,
              items: {
                type: "object",
                required: ["channelId", "body"],
                properties: { channelId: { type: "string" }, body: { type: "string", minLength: 1 }, firstComment: { type: "string", maxLength: 2000 } },
              },
            },
          },
        },
        UpdatePost: {
          type: "object",
          properties: { title: { type: "string", maxLength: 200 }, scheduledAt: { type: ["string", "null"], format: "date-time" } },
        },
        Analytics: {
          type: "object",
          properties: {
            since: { type: "string", format: "date-time" },
            postsWithMetrics: { type: "integer" },
            totals: {
              type: "object",
              properties: {
                impressions: { type: "integer" },
                reach: { type: "integer" },
                likes: { type: "integer" },
                comments: { type: "integer" },
                shares: { type: "integer" },
                saves: { type: "integer" },
                clicks: { type: "integer" },
              },
            },
            avgEngagementRate: { type: "number" },
          },
        },
        Error: { type: "object", properties: { success: { const: false }, data: { type: "null" }, error: { type: "string" } } },
      },
      responses: {
        BadRequest: { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Unauthorized: { description: "Missing, invalid or revoked key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Forbidden: { description: "Missing scope, or the plan doesn't include API access", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        RateLimited: { description: "Too many requests; see the Retry-After header", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };
}
