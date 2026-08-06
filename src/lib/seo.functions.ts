import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const API_KEY = "bae9fca9-ad44-7839-8418-ad6f18fdc3f7";

class SERankingClient {
  apiKey: string;
  baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.seranking.com';
  }

  async get(path: string) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Authorization': `Token ${this.apiKey}` },
    });
    
    if (!res.ok) throw new Error(`SE Ranking API error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async postForm(path: string, params: URLSearchParams) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${this.apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) throw new Error(`SE Ranking API error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async getKeywordIdeas(keyword: string, region = 'us', limit = 50) {
    return this.get(`/v1/keywords/related?source=${region}&keyword=${encodeURIComponent(keyword)}&limit=${limit}`);
  }

  async getKeywordMetrics(keywords: string[], region = 'us') {
    const params = new URLSearchParams();
    keywords.forEach(kw => params.append('keywords[]', kw));
    return this.postForm(`/v1/keywords/export?source=${region}`, params);
  }

  async getDomainKeywords(domain: string, region = 'us', limit = 100) {
    return this.get(`/v1/domain/keywords?source=${region}&domain=${encodeURIComponent(domain)}&limit=${limit}`);
  }

  async getDomainOverview(domain: string, region = 'us') {
    return this.get(`/v1/domain/overview/db?source=${region}&domain=${encodeURIComponent(domain)}`);
  }

  async getBacklinksSummary(domain: string) {
    return this.get(`/v1/backlinks/summary?target=${encodeURIComponent(domain)}&mode=domain`);
  }

  async getReferringDomains(domain: string, limit = 50) {
    return this.get(`/v1/backlinks/refdomains?target=${encodeURIComponent(domain)}&mode=domain&limit=${limit}`);
  }
}

const client = new SERankingClient(API_KEY);

export const searchKeywords = createServerFn({ method: "POST" })
  .inputValidator(z.object({ keyword: z.string(), region: z.string().optional() }))
  .handler(async ({ data }) => {
    try {
      const ideas = await client.getKeywordIdeas(data.keyword, data.region || 'us', 15);
      return { ok: true, data: ideas };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });

export const analyzeCompetitor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ domain: z.string(), region: z.string().optional() }))
  .handler(async ({ data }) => {
    try {
      const [overview, keywords, backlinks] = await Promise.all([
        client.getDomainOverview(data.domain, data.region || 'us'),
        client.getDomainKeywords(data.domain, data.region || 'us', 20),
        client.getBacklinksSummary(data.domain)
      ]);
      return { ok: true, data: { overview, keywords, backlinks } };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
