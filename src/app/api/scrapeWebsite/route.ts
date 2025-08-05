"use server";

import { NextRequest, NextResponse } from "next/server";
import getAnchorHrefs from "@/utils/getAnchorHrefs";
import getBodyText from "@/utils/getBodyText";
import sanitizeFileName from "@/utils/sanitizeFileName";
import getPriorityLinks from "@/utils/getPriorityLinks";
import getBasicInformation from "@/utils/getBasicInformation";

export async function POST(request: NextRequest) {
  try {
    const { websiteURL } = await request.json();

    // Validate input
    if (!websiteURL) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    let originalUrl;

    if (
      !websiteURL.startsWith("http://") &&
      !websiteURL.startsWith("https://")
    ) {
      originalUrl = "https://" + websiteURL;
    } else {
      originalUrl = websiteURL;
    }

    // get all anchor hrefs

    const anchorHrefs = await getAnchorHrefs(websiteURL);

    // get body text

    const bodyText = await getBodyText(websiteURL);

    // get priority links
    const priorityLinks = await getPriorityLinks(originalUrl, anchorHrefs);
    
    const pageBodies = await Promise.all(
      priorityLinks.map(async (href) => {
        href = new URL(href, originalUrl).href;
        const bodyText = await getBodyText(href);
        return { href, bodyText };
      })
    );

    const basicInformation = await getBasicInformation(pageBodies);

    return new NextResponse(
      JSON.stringify({ websiteURL, bodyText, pageBodies, basicInformation }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.log("Error in scrapeWebsite route:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
