import { NextResponse } from 'next/server';
import { serverLog } from '@/lib/serverLogs';

type NewsItem = {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
};

type NewsPayload = {
  success: true;
  timestamp: string;
  geopolitics: NewsItem[];
  technology: NewsItem[];
  headlines: NewsItem[];
};

type ErrorPayload = {
  success: false;
  error: string;
};

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function gdeltUrl(query: string, maxrecords: number) {
  const q = encodeURIComponent(query);
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=${maxrecords}&sort=datedesc`;
}

function mapGdelt(json: unknown): NewsItem[] {
  if (!json || typeof json !== 'object') return [];
  const j = json as Record<string, unknown>;
  const articles = Array.isArray(j.articles) ? (j.articles as unknown[]) : [];
  return articles
    .map((a) => {
      if (!a || typeof a !== 'object') return null;
      const o = a as Record<string, unknown>;
      const title = typeof o.title === 'string' ? o.title : null;
      const url = typeof o.url === 'string' ? o.url : null;
      const source = typeof o.domain === 'string' ? o.domain : typeof o.sourceCountry === 'string' ? o.sourceCountry : 'GDELT';
      const publishedAt = typeof o.seendate === 'string' ? o.seendate : undefined;
      if (!title || !url) return null;
      const base = { title, url, source } satisfies NewsItem;
      return publishedAt ? ({ ...base, publishedAt } satisfies NewsItem) : base;
    })
    .filter((x): x is NewsItem => x !== null);
}

function mapHn(json: unknown): NewsItem[] {
  if (!json || typeof json !== 'object') return [];
  const j = json as Record<string, unknown>;
  const hits = Array.isArray(j.hits) ? (j.hits as unknown[]) : [];
  return hits
    .map((h) => {
      if (!h || typeof h !== 'object') return null;
      const o = h as Record<string, unknown>;
      const title = typeof o.title === 'string' ? o.title : typeof o.story_title === 'string' ? o.story_title : null;
      const storyUrl = typeof o.url === 'string' ? o.url : typeof o.story_url === 'string' ? o.story_url : null;
      const objectId = typeof o.objectID === 'string' ? o.objectID : null;
      const url = storyUrl || (objectId ? `https://news.ycombinator.com/item?id=${objectId}` : null);
      const publishedAt = typeof o.created_at === 'string' ? o.created_at : undefined;
      if (!title || !url) return null;
      const base = { title, url, source: 'HackerNews' } satisfies NewsItem;
      return publishedAt ? ({ ...base, publishedAt } satisfies NewsItem) : base;
    })
    .filter((x): x is NewsItem => x !== null);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get('limit');
  const limit = Math.max(3, Math.min(20, Number(limitRaw) || 10));

  const start = Date.now();

  try {
    const [geoJson, headlinesJson, techJson] = await Promise.all([
      fetchJson(
        gdeltUrl(
          '(ukraine OR russia OR israel OR gaza OR iran OR china OR taiwan OR red sea OR nato OR sanctions OR missile OR drone)',
          limit
        ),
        8000
      ).catch(() => null),
      fetchJson(gdeltUrl('(inflation OR fed OR central bank OR gdp OR jobs OR recession OR oil OR rates OR bond)', limit), 8000).catch(
        () => null
      ),
      fetchJson('https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=20', 8000).catch(() => null),
    ]);

    const geopolitics = mapGdelt(geoJson).slice(0, limit);
    const headlines = mapGdelt(headlinesJson).slice(0, limit);
    const technology = mapHn(techJson).slice(0, limit);

    const degraded = !geoJson || !headlinesJson || !techJson;
    serverLog(
      degraded ? 'warn' : 'info',
      'news_snapshot',
      {
        limit,
        ms: Date.now() - start,
        degraded,
        counts: {
          geopolitics: geopolitics.length,
          headlines: headlines.length,
          technology: technology.length,
        },
      },
      'api/news'
    );

    const payload: NewsPayload = {
      success: true,
      timestamp: new Date().toISOString(),
      geopolitics,
      technology,
      headlines,
    };

    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    serverLog('error', 'news_error', msg, 'api/news');
    const payload: ErrorPayload = { success: false, error: msg };
    return NextResponse.json(payload, { status: 500 });
  }
}
