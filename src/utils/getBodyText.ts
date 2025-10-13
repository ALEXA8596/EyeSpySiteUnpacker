import { parse } from "node-html-parser";
import * as https from 'https';
import * as http from 'http';
import fetch from 'node-fetch';

async function getBodyText(url: string): Promise<string> {
  if (url.startsWith("mailto:") || url.startsWith("tel:")) {
    return ""; // Skip mailto and tel links
  }

  if (!url.startsWith("https://") && !url.startsWith("http://")) {
    url = "https://" + url; // Ensure URL has a protocol
  }

  const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
  });

  const httpAgent = new http.Agent();

  const response = await fetch(url, {
    agent: url.startsWith("https://") ? httpsAgent : httpAgent,
  });
  
  const html = await response.text();
  const root = parse(html);
  // Remove scripts and styles from the body text
  root.querySelectorAll("script, style").forEach(element => element.remove());
  const bodyText = root.querySelector("body")?.text || "";
  // Remove excessive whitespace
  return bodyText.replace(/\s+/g, " ").trim();
}

export default getBodyText;