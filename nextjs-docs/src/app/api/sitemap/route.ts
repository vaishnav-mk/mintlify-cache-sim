import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

function collectDocPaths(): string[] {
  const contentRoot = path.join(process.cwd(), "src", "content");
  const paths = new Set<string>();

  function walk(dir: string, base: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.name.startsWith("_")) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, base + "/" + entry.name);
      } else if (entry.isFile() && entry.name.endsWith(".mdx")) {
        const slug = entry.name.replace(/\.mdx$/, "");
        if (slug === "index") {
          paths.add(base);
        } else {
          paths.add(base + "/" + slug);
        }
      }
    }
  }

  walk(contentRoot, "/docs");

  return Array.from(paths).sort();
}

export async function GET(_req: NextRequest) {
  const paths = collectDocPaths();

  return NextResponse.json({ baseUrl: BASE_URL, paths });
}
