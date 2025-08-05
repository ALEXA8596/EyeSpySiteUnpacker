import { parse } from "node-html-parser";
import * as https from 'https';
import * as http from 'http';
import fetch from 'node-fetch';

async function getAnchorHrefs(url: string): Promise<string[]> {
  try {
    if(!url) {
        return [];
    }
    
    // Ensure URL has a protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    if(url.startsWith("http://")) {
      url = url.replace("http://", "https://"); // Convert http to https for consistency
    }
    
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });

    const httpAgent = new http.Agent();
    
    const response = await fetch(url, { agent: url.startsWith('https://') ? httpsAgent : httpAgent });
    const html = await response.text();
    const root = parse(html);
    const anchors = root.querySelectorAll("a");
    const pageUrl = new URL(url);
    return Array.from(anchors)
      .map((anchor) => anchor.getAttribute("href"))
      .filter((href): href is string => href !== null && href !== undefined)
      .filter((href) => {
        try {
          const linkUrl = new URL(href, pageUrl);
          // Exclude links that point to the same page (ignoring hash)
          return (
            linkUrl.origin + linkUrl.pathname !==
            pageUrl.origin + pageUrl.pathname
          );
        } catch {
          return false;
        }
      });
  } catch (e) {
    console.error(`Error fetching anchors from ${url}:`, e);
    throw new Error(`Failed to fetch or parse the URL: ${url}`);
  }
}

export default getAnchorHrefs;