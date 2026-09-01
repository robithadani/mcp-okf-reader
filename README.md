# MCP OKF Reader

MCP server untuk membaca bundle [Open Knowledge Format (OKF v0.1)](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) dari satu atau banyak situs — pasangan konsumen dari plugin [okf-publisher](https://github.com/robithadani/okf-publisher). Karena OKF adalah standar, server ini bekerja untuk situs WordPress maupun non-WordPress selama menyajikan bundle di URL.

## Instalasi

```bash
npm install
```

## Menjalankan

Argumen = daftar root URL bundle. API key (bila bundle terproteksi) ditulis setelah `::`.

```bash
node server.js https://sitespirit.co/okf
node server.js https://sitespirit.co/okf https://klien.com/okf::API_KEY_RAHASIA
```

Self-check cepat (tanpa MCP client):

```bash
node server.js --check https://sitespirit.co/okf
```

## Tools

| Tool | Fungsi |
|---|---|
| `okf_sites` | Daftar situs terdaftar |
| `okf_read` | Baca satu dokumen (`path`, default `index.md`); agent menelusuri bundle dengan mengikuti link antar-dokumen |
| `okf_search` | Cari judul/deskripsi dokumen di seluruh index, kembalikan link untuk dibaca dengan `okf_read` |

## Menghubungkan ke Claude

**Claude Code:**

```bash
claude mcp add okf-reader -- node /path/ke/mcp-okf-reader/server.js https://sitespirit.co/okf
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "okf-reader": {
      "command": "node",
      "args": ["/path/ke/mcp-okf-reader/server.js", "https://sitespirit.co/okf"]
    }
  }
}
```

Untuk aplikasi AI internal klien yang bukan berbasis MCP, logika intinya cuma dua fungsi di `server.js` (`fetchDoc` + `search`, ±40 baris) — mudah diport ke stack apa pun.

## Catatan

- Pencarian mencakup judul + deskripsi dokumen (isi file index), bukan full-text seluruh dokumen. Cukup untuk navigasi agent; full-text crawler bisa ditambahkan bila terbukti perlu.
- Server stateless — tidak ada cache; bundle selalu dibaca segar dari situs.
