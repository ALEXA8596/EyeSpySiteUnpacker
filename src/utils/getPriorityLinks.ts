// const { GoogleGenAI } = require("@google/genai");
import { GoogleGenAI } from "@google/genai";
// import fetch from "node-fetch";

async function getPriorityLinks(
  originalUrl: string,
  urls: string[]
): Promise<string[]> {
  try {
    if (!originalUrl || !urls || urls.length === 0) {
      return [];
    }
    console.log("Using Google GenAI to prioritize links...");
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || "",
    });

    const response = await client.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: [
        {
          // role: "user",
          text: `You will be provided URLs from the main page of a website for an organization. Determine which links may contain important information related to the organization. Examples include "/about", "/events", "/blog", "/programs", and "/services". Try to limit the number of links to around 5 links. You do not need to fill 5 links if there are not that many relevant links. Return the links in the following format: ["Link1", "Link2", "Link3"]. Do not return anything else other than the JSON array. \n Here are the links: \n ${urls.join(
            ", "
          )}`,
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    // console.log(
    //   "Google GenAI response:",
    //   await JSON.stringify(response, null, 2)
    // );

    if(typeof response.text !== "string") {
      console.error("Unexpected response format:", response);
      return [];
    }

    const prioritizedLinks = await JSON.parse(response.text);
    // The AI might return relative paths, so we need to resolve them against the original URL.

    if (
      !originalUrl.startsWith("http://") &&
      !originalUrl.startsWith("https://")
    ) {
      originalUrl = "https://" + originalUrl;
    }
    const pageUrl = new URL(originalUrl); // Assuming the first URL is the base
    return prioritizedLinks.map(
      (link: string) => new URL(link, pageUrl.origin).href
    );
  } catch (error) {
    console.error("Error prioritizing links:", error);
    return [];
  }
}

export default getPriorityLinks;