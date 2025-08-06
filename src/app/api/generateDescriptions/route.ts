"use server";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const prompt = `You are an expert website SEO consultant. Your task is to analyze the following website content and generate a concise, SEO-optimized description that highlights the key features and offerings of the given website.
Follow these rules:
1. **Length**: The description should be between 300 and 400 words.
2. The Organization's name should be the "keyword" and should be mentioned at least 3 times in the description.
3. Use an h3 tag for the title.
4. The passive voice should be used less than 10% of the time.
5. Transition words should be used at least 30% of the time.
6. The description should be engaging and informative, providing a clear overview of the website's purpose and offerings.
7. Paragraphs should be less than 150 words. Use multiple paragraphs if necessary.
8. Wrap the first mention of the organization in an anchor with the URL of the organization.
9. Use semantic HTML, such as <section> <h3> <p> and <a rel="noopener">, to structure the description.
10. End the description with "Learn more at <Organization URL> and explore other vision-focused resources at the <a href=\"https://eyespy.org/resources/\">Eye Spy directory</a>."
11. Focus on the mission, vision, and key offerings of the organization towards the visually impaired community. Give a broad overview, do not describe specific programs or events in detail.

IMPORTANT: DO NOT USE BACKTICKS OR CODE BLOCKS IN YOUR RESPONSE. DO NOT USE MARKDOWN FORMATTING. 
DO NOT BEGIN YOUR RESPONSE WITH \`\`\` OR END WITH \`\`\`.
PROVIDE ONLY THE RAW HTML CONTENT WITHOUT ANY CODE FORMATTING OR MARKDOWN SYNTAX.`;

export async function POST(request: NextRequest) {
  const { pageBodies, organizationName, websiteURL } = await request.json();

  const client = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY || "",
  });

  type PageBody = {
    bodyText?: string;
    href?: string;
  }

  let entirePrompt =
    prompt +
    `\n\nHere is the information about the website and organization:\n\nName: ${organizationName}\nURL: ${websiteURL}\n\nBody Texts:\n${pageBodies
      .map(
        (text: PageBody) =>
          (text.href || "Unknown URL") +
          "\n" +
          (text.bodyText || "No content available")
      )
      .join("\n\n")}`;

  try {
    let bodyTextsLength = pageBodies.length;
    while (true) {
      try {
        const tokenResponse = await client.models.countTokens({
          model: "gemini-2.5-flash",
          contents: [{ parts: [{ text: entirePrompt }] }],
        });

        if (!tokenResponse || !tokenResponse.totalTokens) {
          console.warn(
            `Failed to get token count for ${organizationName}, reducing content`
          );
          bodyTextsLength--;
          break;
        }

        if (tokenResponse.totalTokens <= 1048576) {
          break;
        }
        console.log(tokenResponse);
      } catch (error) {
        console.warn(
          `Error counting tokens: ${error}, reducing content`
        );
        bodyTextsLength--;
      }

      bodyTextsLength--;

      // Prevent infinite loop if we run out of body texts
      if (bodyTextsLength <= 0) {
        console.warn(
          `Token limit exceeded even with minimal content for ${organizationName}`
        );
        return NextResponse.json(
          { error: "Token limit exceeded, unable to generate description" },
          { status: 400 }
        );
      }

      entirePrompt =
        prompt +
        `\n\nHere is the information about the website and organization:\n\nName: ${organizationName}\nURL: ${websiteURL}\nBody Texts:\n${pageBodies
          .slice(0, bodyTextsLength)
          .map(
            (text: PageBody) =>
              (text.href || "Unknown URL") +
              "\n" +
              (text.bodyText || "No content available")
          )
          .join("\n\n")}`;

      console.log(entirePrompt);

      console.log(
        `Reduced to ${bodyTextsLength} body texts, prompt length: ${entirePrompt.length} characters`
      );
    }
  } catch (tokenCountError) {
    console.error(
      `Error counting tokens for ${organizationName}:`,
      tokenCountError
    );
    // Use a minimal prompt if token counting fails
    entirePrompt =
      prompt +
      `\n\nHere is the information about the website and organization:\n\nName: ${organizationName}\nURL: ${websiteURL}\nBody Texts: Unable to process content due to technical limitations.`;
  }
  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
        //   role: "user",
          text: entirePrompt,
        },
      ],
    });

    const content = response.text;

    return NextResponse.json({ content });
  } catch (error) {
    console.error(`Error generating content for ${organizationName}:`, error);
    return NextResponse.json(
      { error: "Failed to generate content" },
      { status: 500 }
    );
  }
}
