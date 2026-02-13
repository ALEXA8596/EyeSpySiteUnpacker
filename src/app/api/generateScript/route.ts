"use server";

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export async function POST(request: NextRequest) {
  const {
    pageBodies,
    organizationName,
    websiteURL,
    email,
    address,
    phoneNumber,
    promptType, // 0 - legacy, 1 - new, 2 - accessible
    customPrompt, // User-edited prompt (optional)
  } = await request.json();
  console.log(
    JSON.stringify({
      organizationName,
      websiteURL,
      email,
      address,
      phoneNumber,
      promptType,
      customPromptProvided: !!customPrompt,
    }),
  );
  let basePrompt: string;

  // If user provided a custom prompt, use it directly (with variable substitution)
  if (
    customPrompt &&
    typeof customPrompt === "string" &&
    customPrompt.trim().length > 0
  ) {
    basePrompt = customPrompt
      .replace(/{organizationName}/g, organizationName || "")
      .replace(/{websiteURL}/g, websiteURL || "")
      .replace(/{email}/g, email || "")
      .replace(/{phoneNumber}/g, phoneNumber || "")
      .replace(/{address}/g, address || "");
  } else if (promptType === 0) {
    // Legacy prompt
    basePrompt =
      `You are an expert script writer. Create a script for an audio overview of the organization "${organizationName}". The script should be informative and conversational. Do not introduce the script with a title. The audience is primarily low vision or blind people. Appropriately use the following details:\n\n` +
      `Website: ${websiteURL}\n` +
      `Email: ${email}\n` +
      `Phone: ${phoneNumber}\n` +
      `Address: ${address}\n` +
      `INSERTBODIESHERE\n` +
      "If applicable, give a list and description of the services and the events that the organization offers. Do not sound like an advertisement, and do not mention one off events. Only mention regularly held events (i.e. Book Clubs or Meetings). If there are no events or meetings, do not mention them and skip over them.\n" +
      `The script should be approximately 5 minutes long when read aloud. You may go up to 7 minutes.` +
      `Do not use any offensive terms, such as 'blind' or 'visually impaired'. Instead, use terms like 'low vision' or 'people with low vision' or 'people who are blind'.\n` +
      `\n\nThe script will be read by 2 alternating speakers. Structure the script so that each paragraph represents a block of text to be read by one speaker before switching to the other. Ensure paragraphs are separated by a double newline (\\n\\n). Do not label the speakers (e.g., "Host 1:", "Speaker 2:"). Do not introduce the script with any meta commentary, explanation, or an outline of what will be covered. Instead, directly go into the podcast dialogue. Do not say something along the lines of "Welcome to the show."`;
  } else if (promptType === 2) {
    // Accessible Audio prompt
    basePrompt =
      `You are an expert content creator specializing in accessible audio resources for the low vision and blind community. Your goal is to convert written information about "${organizationName}" into a natural, engaging podcast script.\n\n` +
      `STRICT FORMATTING RULES (CRITICAL):\n` +
      `1. The output must contain ONLY the spoken dialogue.\n` +
      `2. Do NOT use speaker labels (e.g., "Host 1:" or "Speaker A:").\n` +
      `3. Do NOT include titles, scene descriptions, sound effects, or an outline.\n` +
      `4. SEPARATOR: Separate each speaker's turn with a double line break (two empty lines of whitespace). Do NOT write the literal characters "\\n\\n" or any visible separator tags. Just use blank space.\n` +
      `5. Ensure the script starts immediately with the first speaker's voice.\n\n` +
      `INPUT CONTEXT:\n` +
      `Organization: ${organizationName}\n` +
      `Website: ${websiteURL}\n` +
      `Email: ${email}\n` +
      `Phone: ${phoneNumber}\n` +
      `Address: ${address}\n\n` +
      `SOURCE MATERIAL:\n` +
      `"""\n` +
      `INSERTBODIESHERE\n` +
      `"""\n\n` +
      `HOST PERSONAS (Alternating speakers):\n` +
      `- Speaker A (The Guide): Warm, descriptive, and articulate. Focuses on the "what" and "where."\n` +
      `- Speaker B (The Advocate): Curious and practical. Focuses on the "how" and "why it matters."\n\n` +
      `CONTENT GUIDELINES:\n` +
      `- ZERO FLUFF START: The very first sentence of the script must explicitly name "${organizationName}" and immediately define what it is. Do NOT use phrases like "Welcome back," "Hello listeners," or "Today we are looking at."\n` +
      `- LANGUAGE & TERMINOLOGY: STRICTLY AVOID the term "visually impaired." Instead, use "low vision," "people with low vision," "the low vision community," or "blind" (only where specifically accurate).\n` +
      `- Tone: Informative, encouraging, and conversational. Avoid overly corporate jargon.\n` +
      `- Accessibility Focus: If the content mentions physical locations or visual elements, describe them clearly. If reading a phone number, group the digits naturally for a listener to memorize (e.g. "five-five-five...").\n\n` +
      `STRUCTURE:\n` +
      `   1. Immediate Hook: Start directly with the organization name and its core value proposition.\n` +
      `   2. Overview: Summarize what the organization does.\n` +
      `   3. Deep Dive: Discuss specific programs, events, or resources found in the source text. Discuss why this is useful for the low vision community.\n` +
      `   4. Contact Info: Weave the website or phone number naturally into the end of the conversation.\n` +
      `   5. Sign-off: A brief, warm closing.\n\n` +
      `Generate the script now.`;
  } else {
    // New prompt (default for promptType 1, undefined, null, etc.)
    basePrompt =
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
      `The script will be read by two alternating speakers. Structure the script so that each paragraph represents a block of text to be read by one speaker before switching to the other. Ensure paragraphs are separated by a double newline (\\n\\n). Do not prefix paragraphs with explicit labels such as "Host 1:" or "Host 2:" — the alternation will be inferred by paragraph order. Do not introduce the script with any meta commentary, explanation, or an outline of what will be covered. Instead, directly go into the podcast dialogue. Do not say something along the lines of "Welcome to the show."`;
  }

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
      .join("\n\n")}`,
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
            `Failed to get token count for ${organizationName}, reducing content`,
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
          `Token limit exceeded even with minimal content for ${organizationName}`,
        );
        return NextResponse.json(
          { error: "Token limit exceeded, unable to generate script" },
          { status: 400 },
        );
      }

      entirePrompt = basePrompt.replace(
        "INSERTBODIESHERE",
        `Website Body Texts: \n${pageBodies
          .slice(0, bodyTextsLength)
          .map((text: PageBody) => text.href + "\n" + text.bodyText)
          .join("\n\n")}`,
      );

      console.log(
        `Reduced to ${bodyTextsLength} body texts, prompt length: ${entirePrompt.length} characters`,
      );
    }
  } catch (tokenCountError) {
    console.error(
      `Error counting tokens for ${organizationName}:`,
      tokenCountError,
    );
    // Use a minimal prompt if token counting fails
    entirePrompt = basePrompt.replace(
      "INSERTBODIESHERE",
      `Website Body Texts: Unable to process content due to technical limitations.`,
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
        { status: 500 },
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
      { status: 500 },
    );
  }
}
