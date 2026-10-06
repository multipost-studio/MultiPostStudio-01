import { ImageResponse } from "next/og";
import { getBlogPost } from "@/lib/cms";
import { coverTheme } from "@/lib/blog-art";

export const revalidate = 3600;

/**
 * Social preview image (1200x630) for a post: category gradient, the title and
 * the brand. Any failure falls back to a plain 404 so a share preview can never
 * take the page down.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const post = await getBlogPost(slug);
    if (!post) return new Response("Not found", { status: 404 });
    const t = coverTheme(post.tag);
    const title = post.title.length > 96 ? `${post.title.slice(0, 93)}…` : post.title;
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "64px 72px",
            background: `linear-gradient(135deg, ${t.from}, ${t.to})`,
            color: "#ffffff",
            fontFamily: "sans-serif",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(255,255,255,0.22)", fontSize: 28, fontWeight: 700 }}>{post.tag}</div>
            <div style={{ display: "flex", fontSize: 28, fontWeight: 700, opacity: 0.95 }}>MultiPost Studio</div>
          </div>
          <div style={{ display: "flex", fontSize: title.length > 60 ? 62 : 74, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 26, opacity: 0.92 }}>{`${post.author} · ${post.readMins} min read`}</div>
        </div>
      ),
      { width: 1200, height: 630 },
    );
  } catch {
    return new Response("Could not render image", { status: 500 });
  }
}
