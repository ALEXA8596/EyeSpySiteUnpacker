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
    `You are an expert script writer. Create a script for an audio overview of the organization "${organizationName}". The script should be informative and conversational. Do not introduce the script with a title. The audience is primarily low vision or blind people. Appropriately use the following details:\n\n` +
    `Website: ${websiteURL}\n` +
    `Email: ${email}\n` +
    `Phone: ${phoneNumber}\n` +
    `Address: ${address}\n` +
    `INSERTBODIESHERE\n` +
    "If applicable, give a list and description of the services and the events that the organization offers. Do not sound like an advertisement, and do not mention one off events. Only mention regularly held events (i.e. Book Clubs or Meetings). If there are no events or meetings, do not mention them and skip over them.\n" +
    `The script should be approximately 5 minutes long when read aloud. You may go up to 7 minutes.` +
    `Do not use any offensive terms, such as 'blind' or 'visually impaired'. Instead, use terms like 'low vision' or 'people with low vision' or 'people who are blind'.\n` +
    `\n\nThe script will be read by 2 alternating speakers. Structure the script so that each paragraph represents a block of text to be read by one speaker before switching to the other. Ensure paragraphs are separated by a double newline (\\n\\n). Do not label the speakers (e.g., "Host 1:", "Speaker 2:").`;

  const client = new GoogleGenAI({
    apiKey: process.env.GOOGLE_API_KEY || "",
  });

  type PageBody = {
    bodyText?: string;
    href?: string;
  }

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
        console.warn(
          `Error counting tokens: ${error}, reducing content`
        );
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

    // return NextResponse.json({ script: response.text });
  } catch (error) {
    console.error(`Error generating script for ${organizationName}:`, error);
    return NextResponse.json(
      { error: "Failed to generate script" },
      { status: 500 }
    );
  }

  // generate podcast using google tts

  const paragraphs = script.split("\n\n").filter((p) => p.trim().length > 0);
  const speaker1Parts = [];
  const speaker2Parts = [];

  paragraphs.forEach((paragraph, index) => {
    const escapedParagraph = paragraph.replaceAll("\n", " ");
    if (index % 2 === 0) {
      speaker1Parts.push(escapedParagraph.replace(".", "...")); // Add a pause at the end of each paragraph
    } else {
      speaker2Parts.push(escapedParagraph.replace(".", "...")); // Add a pause at the end of each paragraph
    }
  });

  const voices = ["en-US-Chirp3-HD-Sulafat", "en-US-Chirp3-HD-Algenib"]
    .sort(() => 0.5 - Math.random())
    .slice(0, 2);

  const savedFiles = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const escapedParagraph = paragraphs[i];
    const voice = voices[i % 2]; // Alternate between two voices
    const request = {
      input: { text: escapedParagraph },
      voice: { languageCode: "en-US", name: voice },
      audioConfig: { audioEncoding: "MP3" as const },
    };

    // Creates a client
    const ttsClient = new textToSpeech.TextToSpeechClient({
      apiKey: process.env.GOOGLE_API_KEY || "",
    });

    try {
      // Perform the text-to-speech request
      const [response] = await ttsClient.synthesizeSpeech(request);

      if (!response || !response.audioContent) {
        console.error(
          `Failed to synthesize speech for paragraph ${i + 1} of ${organizationName}`
        );
        continue;
      }

      // Convert Uint8Array to base64 for frontend consumption
      const base64Audio = Buffer.from(response.audioContent as Uint8Array).toString('base64');
      savedFiles.push({
        index: i,
        audioData: base64Audio,
        paragraph: escapedParagraph.substring(0, 50) + '...' // Preview text
      });
    } catch (error) {
      console.error(
        `Error synthesizing speech for paragraph ${i + 1} of ${organizationName}:`,
        error
      );
      continue;
    }
  }

  return NextResponse.json(
    {
        script: script,
        savedFiles: savedFiles,
        audioFiles: savedFiles.length,
        message: `Generated ${savedFiles.length} audio segments for ${organizationName}`
    },
    { status: 200 }
    );

}
