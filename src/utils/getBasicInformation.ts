import { GoogleGenAI } from "@google/genai";

type PageBody = {
  bodyText?: string;
  href?: string;
};

type responseTypes = {
  organizationName?: string;
  address?: string;
  phoneNumber?: string;
  email?: string;
  ein?: string;
};

async function getBasicInformation(
  pageBodies: PageBody[]
): Promise<responseTypes> {
  try {
    if (!pageBodies || pageBodies.length === 0) {
      return {};
    }
    console.log("Using Google GenAI to extract basic information...");
    const client = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY || "",
    });

    const response = await client.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: [
        {
          //   role: "user",
          text:
            "You will be provided the contents from pages of an organization. Extract the following information: Organization Name, Address, Phone Number, Email, and EIN. Make sure that the phone number is NOT a fax. If any of these are not available, return a blank string.\n" +
            "Here is the information: \n" +
            pageBodies
              .map((body) => body.href + "\n" + body.bodyText)
              .join("\n\n"),
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: "object",
          properties: {
            organizationName: { type: "string" },
            address: { type: "string" },
            phoneNumber: { type: "string" },
            email: { type: "string" },
            ein: { type: "string" },
          },
          required: [
            "organizationName",
            "address",
            "phoneNumber",
            "email",
            "ein",
          ],
        },
      },
    });
    if (typeof response.text !== "string") {
      console.error("Unexpected response format:", response);
      return {};
    }
    const json = await JSON.parse(response.text);

    return json;
  } catch (error) {
    console.error("Error fetching basic information:", error);
    return {};
  }
}

export default getBasicInformation;
