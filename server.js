#!/usr/bin/env node
/**
 * MCP server "OKF Reader" — membaca bundle Open Knowledge Format (OKF v0.1)
 * dari satu atau banyak situs. Bundle = direktori markdown + YAML frontmatter;
 * server ini hanya melakukan fetch + navigasi, tanpa state.
 *
 * Pemakaian:
 *   node server.js <okf-root-url[::api-key]> [url2 ...]
 *   node server.js --check <okf-root-url>        # self-check tanpa MCP
 *
 * Contoh: node server.js https://sitespirit.co/okf https://klien.com/okf::RAHASIA
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

/* ---------- Konfigurasi situs dari argumen CLI ---------- */

function parseSites(args) {
  return args.map((arg) => {
    const [url, key] = arg.split("::");
    const root = url.replace(/\/+$/, "");
    return { name: new URL(root).hostname, root, key };
  });
}

/* ---------- Inti: fetch dokumen & pencarian ---------- */

async function fetchDoc(site, path = "index.md") {
  path = path.replace(/^\/+/, "") || "index.md";
  const res = await fetch(`${site.root}/${path}`, {
    headers: site.key ? { "X-OKF-Key": site.key } : {},
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} untuk ${site.root}/${path}`);
  }
  return res.text();
}

/**
 * Cari lintas index: baca root index.md, ikuti link ke tiap section index,
 * lalu cocokkan baris (judul + deskripsi dokumen) dengan query.
 * ponytail: pencarian hanya pada file index (judul/deskripsi), bukan full-text
 * seluruh dokumen; tambahkan crawler + cache bila full-text dibutuhkan.
 */
async function search(site, query) {
  const root = await fetchDoc(site, "index.md");
  const sectionPaths = [
    ...new Set([...root.matchAll(/\]\(\/?([\w\-/]*index\.md)\)/g)].map((m) => m[1])),
  ];
  const q = query.toLowerCase();
  const hits = [];
  for (const sec of sectionPaths) {
    let text;
    try {
      text = await fetchDoc(site, sec);
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (line.startsWith("- ") && line.toLowerCase().includes(q)) {
        hits.push(`[${site.name}] ${line.slice(2).trim()}`);
        if (hits.length >= 50) return hits;
      }
    }
  }
  return hits;
}

function pickSite(sites, name) {
  if (!name) {
    if (sites.length === 1) return sites[0];
    throw new Error(
      `Ada ${sites.length} situs terdaftar — sebutkan parameter site: ${sites.map((s) => s.name).join(", ")}`
    );
  }
  const site = sites.find((s) => s.name === name || s.root === name);
  if (!site) throw new Error(`Situs "${name}" tidak terdaftar.`);
  return site;
}

/* ---------- Mode --check: self-check tanpa MCP ---------- */

const argv = process.argv.slice(2);
if (argv[0] === "--check") {
  const site = parseSites([argv[1]])[0];
  const index = await fetchDoc(site);
  if (!/^---\n[\s\S]*?\btype:/.test(index)) {
    console.error("GAGAL: index.md tidak berawalan frontmatter YAML dengan field type.");
    process.exit(1);
  }
  const word = (index.match(/\]\(\/([\w-]+)\/index\.md\)/) || [])[1];
  const hits = word ? await search(site, word) : [];
  console.log(`OK: index.md valid (${index.length} bytes), search("${word}") -> ${hits.length} hasil.`);
  process.exit(0);
}

/* ---------- Server MCP ---------- */

const sites = parseSites(argv);
if (!sites.length) {
  console.error("Pemakaian: mcp-okf-reader <okf-root-url[::api-key]> [url2 ...]");
  process.exit(1);
}

const server = new McpServer({ name: "okf-reader", version: "0.1.0" });

const siteParam = z
  .string()
  .optional()
  .describe("Hostname situs (wajib bila lebih dari satu situs terdaftar)");

server.registerTool(
  "okf_sites",
  { description: "Daftar situs OKF yang terdaftar di server ini beserta root URL-nya." },
  async () => ({
    content: [
      { type: "text", text: sites.map((s) => `${s.name} — ${s.root}/index.md`).join("\n") },
    ],
  })
);

server.registerTool(
  "okf_read",
  {
    description:
      "Baca satu dokumen dari bundle OKF (markdown + YAML frontmatter). Mulai dari path 'index.md', lalu ikuti link markdown antar-dokumen, mis. 'posts/cara-optimasi-seo.md'.",
    inputSchema: {
      site: siteParam,
      path: z.string().optional().describe("Path dokumen relatif terhadap root bundle, default index.md"),
    },
  },
  async ({ site, path }) => ({
    content: [{ type: "text", text: await fetchDoc(pickSite(sites, site), path) }],
  })
);

server.registerTool(
  "okf_search",
  {
    description:
      "Cari dokumen berdasarkan judul/deskripsi di seluruh index bundle OKF. Mengembalikan daftar link dokumen yang cocok — baca detailnya dengan okf_read.",
    inputSchema: {
      query: z.string().describe("Kata kunci pencarian"),
      site: siteParam,
    },
  },
  async ({ query, site }) => {
    const targets = site ? [pickSite(sites, site)] : sites;
    const results = (await Promise.all(targets.map((s) => search(s, query)))).flat();
    return {
      content: [
        { type: "text", text: results.length ? results.join("\n") : "Tidak ada hasil." },
      ],
    };
  }
);

await server.connect(new StdioServerTransport());
