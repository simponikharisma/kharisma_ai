import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./Markdown";

const render = (content: string) => renderToStaticMarkup(<Markdown content={content} />);

describe("Markdown", () => {
  it("tidak merender HTML mentah atau memuat gambar otomatis", () => {
    const html = render(
      '<script>alert("x")</script><img src="https://example.com/lacak.png" onerror="alert(1)">\n\n![Foto](https://example.com/foto.png)'
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('onerror="');
  });

  it("merender penekanan dan tabel GFM", () => {
    const html = render("**Tebal**\n\n| Kitab | Bab |\n| --- | --- |\n| Fathul Mu'in | Nikah |");
    expect(html).toContain("<strong>Tebal</strong>");
    expect(html).toContain("<table>");
    expect(html).toContain("Fathul Mu&#x27;in");
  });

  it("memberi kelas highlight pada blok kode", () => {
    const html = render("```ts\nconst nilai: number = 1;\n```");
    expect(html).toContain("hljs language-ts");
    expect(html).toContain("hljs-keyword");
  });

  it("menandai tautan eksternal sebagai aman", () => {
    const html = render("[Sumber](https://example.com/dalil)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("mengarahkan paragraf Arab ke kanan", () => {
    const html = render("قال الإمام النووي رحمه الله");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("md-arabic");
  });
});
