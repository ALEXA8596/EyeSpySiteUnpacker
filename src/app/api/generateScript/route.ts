"use server";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { v1beta1 as textToSpeech } from "@google-cloud/text-to-speech";

export async function POST(request: NextRequest) {
  const {
    pageBodies,
    organizationName,
    websiteURL,
    email,
    address,
    phoneNumber,
  } = await request.json();

  const basePrompt =
    `Generate a podcast-style audio overview script based on the provided content for "${organizationName}". The output should be a conversational script between two AI hosts discussing the main points, insights, and implications of the input material. Do not include a separate title line; begin directly with the script content. Do not give the podcast a name. Just start talking about the subject.\n\n` +
    `Context and contact details (use where helpful, but do not read lists verbatim):\nWebsite: ${websiteURL}\nEmail: ${email}\nPhone: ${phoneNumber}\nAddress: ${address}\n\n` +
    `INSERTBODIESHERE\n\n` +
    `Podcast Format:\n` +
    `- Duration: Aim for a 5-7 minute discussion (approximately 750-1,000 words). You may go over this range if necessary to cover important points; use judgment and prioritize clarity and usefulness.\n` +
    `- Style: Informative yet casual, resembling a professional podcast.\n` +
    `- Listener: Busy professionals who want efficient, high-value information.\n\n` +
    `Host Personas (make these voices clear in tone, but DO NOT label lines):\n` +
    `- Host 1: The “Explainer” — knowledgeable, articulate, breaks down complex concepts.\n` +
    `- Host 2: The “Questioner” — curious, insightful, asks thought-provoking questions.\n` +
    `Maintain a collegial, respectful dynamic with light, friendly banter.\n\n` +
    `Podcast Structure (follow this structure but feel free to adjust lengths as needed):\n` +
    `1) Outline: Begin with a concise outline of the topics you will cover (a short bullet-style plan).\n` +
    `2) Introduction (~80-100 words): Introduce hosts and the topic; provide a clear hook.\n` +
    `3) Overview (~150-200 words): Summarize the key points and context from the source material.\n` +
    `4) Main Discussion (~500-700 words): Analyze, debate, and discuss details and implications; use examples and practical takeaways. If needed, expand this section to fully explore complex or important points.\n` +
    `5) Conclusion (~60-100 words): Recap key takeaways and end with a thought-provoking comment or question.\n\n` +
    `Additional directions:\n` +
    `- Identify core concepts, arguments, and significant details from the provided content.\n` +
    `- Organize the discussion logically (outline -> intro -> overview -> deep dive -> conclusion).\n` +
    `- Use clear, accessible language and natural speech patterns; include occasional realistic speech elements ("um", "you know", short laughs or light banter) for authenticity.\n` +
    `- Present controversial topics with neutrality and show multiple sides where appropriate.\n` +
    `- Avoid sounding like an advertisement. If the source lists events, mention only regularly held events, not one-off occurrences.\n` +
    `- Refine the output: begin with an outline, develop a coherent draft, then add small speech-level edits so the script reads naturally when spoken.\n\n` +
    `The script will be read by two alternating speakers. Structure the script so that each paragraph represents a block of text to be read by one speaker before switching to the other. Ensure paragraphs are separated by a double newline (\\n\\n). Do not prefix paragraphs with explicit labels such as "Host 1:" or "Host 2:" — the alternation will be inferred by paragraph order. Do not introduce the script with any meta commentary or explanation, directly go into the podcast dialogue.`;

  const client = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "",
  });

  type PageBody = {
    bodyText?: string;
    href?: string;
  };

  let entirePrompt = basePrompt.replace(
    "INSERTBODIESHERE",
    `Website Body Texts: \n${pageBodies
      .map((text: PageBody) => text.href + "\n" + text.bodyText)
      .join("\n\n")}`
  );

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
        console.warn(`Error counting tokens: ${error}, reducing content`);
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
          { error: "Token limit exceeded, unable to generate script" },
          { status: 400 }
        );
      }

      entirePrompt = basePrompt.replace(
        "INSERTBODIESHERE",
        `Website Body Texts: \n${pageBodies
          .slice(0, bodyTextsLength)
          .map((text: PageBody) => text.href + "\n" + text.bodyText)
          .join("\n\n")}`
      );

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
    entirePrompt = basePrompt.replace(
      "INSERTBODIESHERE",
      `Website Body Texts: Unable to process content due to technical limitations.`
    );
  }

  let script = "";

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

    if (!response || !response.text) {
      console.error("Failed to generate script:", response);
      return NextResponse.json(
        { error: "Failed to generate script" },
        { status: 500 }
      );
    }

    script = response.text;

    const scriptArray = script.split("\n\n").map((el, index) => {
      return { speaker: index % 2 === 0 ? "speaker1" : "speaker2", text: el };
    });

    return NextResponse.json({
      script: response.text,
      scriptArray: scriptArray,
    });
  } catch (error) {
    console.error(`Error generating script for ${organizationName}:`, error);
    return NextResponse.json(
      { error: "Failed to generate script" },
      { status: 500 }
    );
  }
}
