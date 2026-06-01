/**
 * News section — NewsAPI.org.
 * Fetches tech/industry headlines + local Dacula/Gwinnett County news.
 * Requires NEWS_API_KEY secret.
 */

export interface NewsArticle {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  description: string | null;
}

export interface NewsSection {
  industry: NewsArticle[];
  local: NewsArticle[];
}

interface NewsApiArticle {
  title: string;
  source: { name: string };
  url: string;
  publishedAt: string;
  description: string | null;
}

interface NewsApiResponse {
  status: string;
  articles: NewsApiArticle[];
}

function mapArticle(a: NewsApiArticle): NewsArticle {
  return {
    title: a.title,
    source: a.source.name,
    url: a.url,
    publishedAt: a.publishedAt,
    description: a.description,
  };
}

export async function fetchNewsSection(apiKey: string): Promise<NewsSection> {
  const headers = { 'X-Api-Key': apiKey };

  const industryParams = new URLSearchParams({
    category: 'technology',
    language: 'en',
    country: 'us',
    pageSize: '6',
  });

  // Local news: Gwinnett County / Dacula GA — "everything" endpoint with geographic query
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const localParams = new URLSearchParams({
    q: '"Gwinnett County" OR "Dacula Georgia" OR "Lawrenceville GA" OR "Buford GA"',
    language: 'en',
    sortBy: 'publishedAt',
    from: yesterday,
    pageSize: '5',
  });

  const [industryRes, localRes] = await Promise.allSettled([
    fetch(`https://newsapi.org/v2/top-headlines?${industryParams.toString()}`, { headers, signal: AbortSignal.timeout(8_000) }),
    fetch(`https://newsapi.org/v2/everything?${localParams.toString()}`, { headers, signal: AbortSignal.timeout(8_000) }),
  ]);

  const industryArticles: NewsArticle[] = [];
  if (industryRes.status === 'fulfilled' && industryRes.value.ok) {
    const data = (await industryRes.value.json()) as NewsApiResponse;
    industryArticles.push(
      ...data.articles
        .filter((a) => a.title && !a.title.includes('[Removed]'))
        .slice(0, 5)
        .map(mapArticle),
    );
  }

  const localArticles: NewsArticle[] = [];
  if (localRes.status === 'fulfilled' && localRes.value.ok) {
    const data = (await localRes.value.json()) as NewsApiResponse;
    localArticles.push(
      ...data.articles
        .filter((a) => a.title && !a.title.includes('[Removed]'))
        .slice(0, 4)
        .map(mapArticle),
    );
  }

  return { industry: industryArticles, local: localArticles };
}
