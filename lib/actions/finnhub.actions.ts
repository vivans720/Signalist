"use server";

import { validateArticle, formatArticle, getDateRange } from "@/lib/utils";

const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";
const NEXT_PUBLIC_FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

/**
 * Fetch JSON data from Finnhub API with optional caching
 * @param url - Full API endpoint URL
 * @param revalidateSeconds - Optional cache revalidation time in seconds
 * @returns Parsed JSON response
 */
async function fetchJSON<T>(
  url: string,
  revalidateSeconds?: number
): Promise<T> {
  const options: RequestInit = revalidateSeconds
    ? {
        cache: "force-cache" as RequestCache,
        next: { revalidate: revalidateSeconds },
      }
    : { cache: "no-store" as RequestCache };

  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}, url: ${url}`);
  }

  return response.json();
}

/**
 * Get news articles for user's watchlist symbols or general market news
 * @param symbols - Optional array of stock symbols to fetch news for
 * @returns Array of formatted news articles (max 6)
 */
export async function getNews(
  symbols?: string[]
): Promise<MarketNewsArticle[]> {
  try {
    const { from, to } = getDateRange(5); // Last 5 days

    // If symbols are provided, fetch company news with round-robin
    if (symbols && symbols.length > 0) {
      // Clean and uppercase symbols
      const cleanSymbols = symbols
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);

      if (cleanSymbols.length === 0) {
        return getGeneralMarketNews(from, to);
      }

      const allArticles: MarketNewsArticle[] = [];
      const maxRounds = 6; // Max 6 rounds of collecting news

      // Round-robin: fetch one article per symbol per round
      for (let round = 0; round < maxRounds; round++) {
        for (const symbol of cleanSymbols) {
          if (allArticles.length >= 6) break;

          try {
            const url = `${FINNHUB_BASE_URL}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${NEXT_PUBLIC_FINNHUB_API_KEY}`;
            const data = await fetchJSON<RawNewsArticle[]>(url);

            // Find a valid article that hasn't been used yet
            const validArticle = data.find((article) =>
              validateArticle(article)
            );

            if (validArticle) {
              const formatted = formatArticle(
                validArticle,
                true,
                symbol,
                allArticles.length
              );
              allArticles.push(formatted);
            }
          } catch (error) {
            console.error(`Error fetching news for symbol ${symbol}:`, error);
            // Continue to next symbol
          }
        }

        if (allArticles.length >= 6) break;
      }

      // Sort by datetime descending (most recent first)
      allArticles.sort((a, b) => b.datetime - a.datetime);

      return allArticles;
    }

    // No symbols provided, fetch general market news
    return getGeneralMarketNews(from, to);
  } catch (error) {
    console.error("Failed to fetch news:", error);
    throw new Error("Failed to fetch news");
  }
}

/**
 * Fetch general market news when no symbols are provided
 * @param from - Start date (YYYY-MM-DD)
 * @param to - End date (YYYY-MM-DD)
 * @returns Array of formatted news articles (max 6)
 */
async function getGeneralMarketNews(
  from: string,
  to: string
): Promise<MarketNewsArticle[]> {
  try {
    const url = `${FINNHUB_BASE_URL}/news?category=general&token=${NEXT_PUBLIC_FINNHUB_API_KEY}`;
    const data = await fetchJSON<RawNewsArticle[]>(url);

    // Filter valid articles
    const validArticles = data.filter((article) => validateArticle(article));

    // Deduplicate by id, url, and headline
    const seen = new Set<string>();
    const deduplicated = validArticles.filter((article) => {
      const key = `${article.id}-${article.url}-${article.headline}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Take top 6 most recent articles
    const topArticles = deduplicated.slice(0, 6);

    // Format articles
    return topArticles.map((article, index) =>
      formatArticle(article, false, undefined, index)
    );
  } catch (error) {
    console.error("Error fetching general market news:", error);
    throw error;
  }
}
