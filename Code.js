/**
 * Tutorial: Automate Gmail with Google Apps Script & Gemini AI 
 */
function processInbox() {
  
  const threads = GmailApp.search('is:unread -label:Processed', 0, 5);

  for (const thread of threads) {
    try {
      
      const message = thread.getMessages()[0];
      const analysis = getEmailAnalysis(message);

      if (analysis) {
        applyGmailLabels(thread, analysis);
      }
    } catch (e) {
      console.error(`Failed to process thread ${thread.getId()}: ${e.toString()}`);
    }
  }
}

/**
 * Analyzes an email message using Gemini AI API to determine if a response is required.
 * @param {GmailApp.GmailMessage} message The email message object to analyze.
 * @returns {Object|null} Object like { "requiresResponse": true }
 */
function getEmailAnalysis(message) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const model = 'gemini-3-flash-preview'; // Or your preferred model
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const prompt = `
    Analyze the following email and determine if it requires a direct response from me. Your output must be a single JSON object with one key:
- "requiresResponse": a boolean (true or false).

Set "requiresResponse" to true ONLY if the email meets one of the following criteria:
1. It is a direct, personal message specifically addressed to me that asks a question.
2. It is a direct request for a specific deliverable or a task that I am personally responsible for.
3. It explicitly needs my review, approval, or a decision from me.
4. It is a message I initiated and is now pending my next response.

Set "requiresResponse" to false in all other cases, including but not limited to:
1. Automated notifications, system-generated emails, or transactional messages (e.g., file access requests, comment threads, purchase receipts).
2. All Google Calendar updates, meeting invitations, and confirmations.
3. Broad announcements, mass newsletters, marketing, promotional emails, or general invitations to events.
4. Informational notes that do not ask for a reply, such as "thank you" messages or "for your information" updates.
5. Emails with a general call to action that is not a direct request to me (e.g., "register now," "sign up here," "view our latest blog post").
6. Messages where I am CC'd for informational purposes and my action is not required.

    Email Subject: "${message.getSubject()}"
    Email Body:
    ---
    ${message.getPlainBody()}
    ---
  `;

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      response_mime_type: "application/json",
      response_schema: {
        type: "OBJECT",
        properties: {
          requiresResponse: { type: "BOOLEAN" }
        },
        required: ["requiresResponse"]
      }
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (statusCode === 200) {
      const jsonResponse = JSON.parse(responseText);
      
      // Extract the inner JSON string returned by Gemini
      let rawText = jsonResponse.candidates[0].content.parts[0].text;
      rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Returns { requiresResponse: boolean }
      return JSON.parse(rawText);
    } else if (statusCode === 404) {
      Logger.log(`404 Not Found: Check model endpoint or URL structure. Response: ${responseText}`);
      return null;
    } else {
      Logger.log(`API Error ${statusCode}: ${responseText}`);
      return null;
    }
  } catch (e) {
    Logger.log(`Network or Script Exception: ${e.toString()}`);
    return null;
  }
}

function applyGmailLabels(thread, analysis) {
  const subject = thread.getFirstMessageSubject();
  console.log('Analysis result:', analysis);

  if (analysis.requiresResponse === true) {
    const toRespondLabel = GmailApp.getUserLabelByName('To Respond');
    thread.addLabel(toRespondLabel);
    console.log(`Email "${subject}" labeled as 'To Respond'.`);
  }

  const processedLabel = GmailApp.getUserLabelByName('Processed');
  thread.addLabel(processedLabel);
  console.log(`Email "${subject}" labeled as 'Processed'.`);
}
