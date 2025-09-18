
interface VolcanoCredentials {
    apiKey: string;
}
  
/**
 * Generates a summary from the Volcano Engine API by making a real API call.
 * The API is OpenAI-compatible, using Bearer token authentication.
 * 
 * @param fullPrompt The complete prompt including PDF text and user instructions.
 * @param creds The Volcano Engine credentials containing the API key.
 * @returns A promise that resolves to the summary text.
 */
export const generateSummaryFromVolcano = async (
    fullPrompt: string,
    creds: VolcanoCredentials,
): Promise<string> => {
    console.log("Making API call to Volcano Engine...");

    if (!creds.apiKey) {
        return "Error: Volcano Engine API Key is required but was not provided.";
    }

    // This is the endpoint for Volcano Engine's Ark API, which is OpenAI-compatible.
    const apiEndpoint = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    
    // This is an example model ID from the documentation. 
    // You may need to replace this with your specific model endpoint ID.
    const modelId = 'ep-20250718110917-jckmt';

    try {
        const response = await fetch(apiEndpoint, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${creds.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: modelId,
                messages: [{ role: 'user', content: fullPrompt }],
            }),
        });

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            const errorMessage = errorBody?.error?.message || `API request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (!data.choices || data.choices.length === 0 || !data.choices[0].message?.content) {
            throw new Error("Received an invalid response structure from the API.");
        }
        
        return data.choices[0].message.content;

    } catch (error) {
        console.error("Error generating summary from Volcano Engine:", error);
        if (error instanceof Error) {
            return `Error during Volcano Engine summary generation: ${error.message}`;
        }
        return "An unknown error occurred during Volcano Engine summary generation.";
    }
};
