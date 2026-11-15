import fs from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/**
 * Receives files dropped in the app so they land in this project's samples/
 * folder, where they can be inspected from the workspace. Development only:
 * the static build has no server to write to.
 */
function analysisInbox(): Plugin {
  const inbox = path.resolve(process.cwd(), "samples");

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const respond = (status: number, payload: unknown) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
    };

    if (req.method !== "POST") {
      respond(405, { ok: false, error: "POST only" });
      return;
    }

    const requestUrl = new URL(req.url ?? "/", "http://localhost");
    const requested = requestUrl.searchParams.get("name") ?? "upload.cd";
    const safeName =
      path.basename(requested).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "upload.cd";

    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (tooLarge) {
        respond(413, { ok: false, error: "File exceeds 64 MB" });
        return;
      }
      try {
        fs.mkdirSync(inbox, { recursive: true });
        fs.writeFileSync(path.join(inbox, safeName), Buffer.concat(chunks));
        respond(200, { ok: true, path: `samples/${safeName}`, bytes: total });
      } catch {
        respond(500, { ok: false, error: "Could not write to samples/" });
      }
    });

    req.on("error", () => respond(500, { ok: false, error: "Upload failed" }));
  };

  return {
    name: "cd-analysis-inbox",
    configureServer(server) {
      server.middlewares.use("/api/samples", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/samples", handler);
    },
  };
}

export default defineConfig({
  plugins: [react(), analysisInbox()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
});
