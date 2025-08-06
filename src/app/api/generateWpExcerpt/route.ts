"use server";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const prompt = `You are an expert website SEO consultant for an organization that organizes many organizations relating to low vision and blindness. Your task is to analyze the following website content and generate a concise, SEO-optimized wordpress excerpt that highlights the key features and offerings of the given organization.
Follow these rules:
1. **Length**: The excerpt should be less than 55 words.
2. Mention the Organization's name at least once.
3. The excerpt should be engaging and informative, providing a clear overview of the website's purpose and offerings.
4. Focus on the mission, vision, and key offerings of the organization towards the low vision community. Give a broad overview, do not describe specific programs or events in detail.
5. Use only plain text without any HTML formatting.
6. Do not use any potentially offensive words such as "the blind" or "the visually impaired". Use more positive and inclusive terms like "people with low vision" or "those who are blind".

IMPORTANT: DO NOT USE BACKTICKS OR CODE BLOCKS IN YOUR RESPONSE. DO NOT USE MARKDOWN FORMATTING. 
DO NOT BEGIN YOUR RESPONSE WITH \`\`\` OR END WITH \`\`\`.`;

export async function POST(request: NextRequest) {
  const { pageBodies, organizationName, websiteURL } = await request.json();

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
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
        // log the stack
        console.error(error);
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
          // role: "user",
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
