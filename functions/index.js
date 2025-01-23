const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');
const { google } = require('googleapis');
const { Storage } = require('@google-cloud/storage');
const cors = require('cors')({ origin: true });
const { Readable } = require('stream');
const serviceAccount = require('./whatsapp.json'); // Import the whatsapp.json file

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const storage = new Storage();
const drive = google.drive('v3');
const db = admin.firestore();
const VERIFY_TOKEN = serviceAccount.verify_token; // Use the token from whatsapp.json
const ACCESS_TOKEN = serviceAccount.access_token; // Use the access token from whatsapp.json
const spreadsheetId = serviceAccount.spreadsheet_id; // Use the spreadsheet ID from whatsapp.json
const folderId = serviceAccount.folder_id; // Use the folder ID from whatsapp.json

// Fetch data from Google Sheets
exports.fetchGoogleSheetData = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const { range } = req.body;

        if (!range) {
            return res.status(400).send({ error: "Missing range parameter in request body." });
        }

        try {
            const authClient = new google.auth.JWT(
                serviceAccount.client_email,
                null,
                serviceAccount.private_key.replace(/\\n/g, "\n"),
                ["https://www.googleapis.com/auth/spreadsheets.readonly"]
            );

            const sheets = google.sheets("v4");
            const response = await sheets.spreadsheets.values.get({
                auth: authClient,
                spreadsheetId: spreadsheetId,
                range: range,
            });

            if (!response.data.values || response.data.values.length === 0) {
                throw new Error("No data found in the specified range.");
            }

            res.status(200).send(response.data.values);
        } catch (error) {
            console.error("Error fetching data from Google Sheets:", error.message, error);
            res.status(500).send({ error: error.message });
        }
    });
});

// Send WhatsApp message
exports.sendWhatsappMessageHttp = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method !== "POST") {
            return res.status(405).send({ error: "Only POST requests are allowed" });
        }

        const { phoneNumber, studentName, dueFees, messageTemplate, dueDate, term } = req.body;

        if (!phoneNumber || !studentName || !dueFees || !messageTemplate || !dueDate) {
            return res.status(400).send({ error: "Missing required fields." });
        }

        const url = "https://graph.facebook.com/v20.0/159339593939407/messages";

        // Build parameters array
        const parameters = [
            { type: "text", text: studentName },
            { type: "text", text: dueFees },
            { type: "text", text: dueDate }
        ];

        // Add term only if the template is not "hostel_fees_due_tamil" or "total_due_fees_tamil"
        if (messageTemplate !== "hostel_fees_due_tamil" && messageTemplate !== "total_due_fees_tamil") {
            parameters.splice(1, 0, { type: "text", text: term });
        }

        const payload = {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phoneNumber,
            type: "template",
            template: {
                name: messageTemplate,
                language: {
                    code: "ta"
                },
                components: [
                    {
                        type: "body",
                        parameters: parameters
                    }
                ]
            }
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });
            res.status(200).send({ message: "Message sent successfully", response: response.data });
        } catch (error) {
            console.error("Error sending message:", error.message);
            res.status(500).send({ error: error.message });
        }
    });
});

// Handle WhatsApp webhook
exports.handleWhatsAppWebhook = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        if (req.method === "GET") {
            handleWebhookVerification(req, res);
        } else if (req.method === "POST") {
            handleWebhookEvent(req, res);

        } else {
            res.status(405).send({ error: "Method not allowed. Use GET or POST." });
        }
    });
});

function sendMessageToGoogleChat(message) {
    // Example URL for Google Chat webhook, replace with actual webhook URL
    const chatWebhookUrl = serviceAccount.chat_webhook_url; // Use the webhook URL from whatsapp.json

    // Send the message to Google Chat
    const payload = {
        text: message
    };

    axios.post(chatWebhookUrl, payload, {
        headers: {
            "Content-Type": "application/json"
        }
    })
        .then(response => {
            console.log("Message sent to Google Chat successfully:", response.data);
        })
        .catch(error => {
            console.error("Error sending message to Google Chat:", error.message);
        });
}

// Handle webhook verification
function handleWebhookVerification(req, res) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook Verified");
        res.status(200).send(challenge);
    } else {
        res.status(403).send({ error: "Invalid token." });
    }
}

// Handle webhook event
async function handleWebhookEvent(req, res) {
    try {
        const payload = req.body;
        sendMessageToGoogleChat(JSON.stringify(payload));

        // Log the entire incoming payload to inspect its structure
        console.log("Incoming payload:", JSON.stringify(payload, null, 2));

        // Check if the necessary parts exist in the payload
        if (
            !payload.entry ||
            payload.entry.length === 0 ||
            !payload.entry[0].changes ||
            payload.entry[0].changes.length === 0 ||
            !payload.entry[0].changes[0].value
        ) {
            const errorMsg = "Invalid payload structure: Missing expected fields.";
            sendMessageToGoogleChat(errorMsg);
            return res.status(400).send({ error: errorMsg });
        }

        const change = payload.entry[0].changes[0].value;

        // Handle text messages
        if (change.messages && change.messages.length > 0) {
            const message = change.messages[0];
            const from = message.from;

            if (message.text) {
                const text = message.text.body;

                // Log the text message to Firestore with more data
                await db.collection("textMessages").add({
                    from,
                    text,
                    timestamp: new Date().toISOString(),
                    messageId: message.id,
                    timestampMs: message.timestamp
                });

                console.log(`Received text message from ${from}: ${text}`);
            }

            // Handle incoming media (documents, images, audio, etc.)
            if (message.document || message.image || message.audio || message.video) {
                const mediaId = message.document?.id || message.image?.id || message.audio?.id || message.video?.id;
                const mediaType = message.document ? "document" : message.image ? "image" : message.audio ? "audio" : "video";
                const mediaUrl = await fetchAndDownloadMedia(mediaId);

                // Log the media message to Firestore with more data
                await db.collection(`documentMessages`).add({
                    from,
                    mediaId,
                    mediaUrl,
                    timestamp: new Date().toISOString(),
                    mediaType,
                    messageId: message.id,
                    timestampMs: message.timestamp
                });

                console.log(`Received ${mediaType} from ${from}: ${mediaUrl}`);
            }
        }

        // Handle read receipts
        if (change.statuses && change.statuses.length > 0) {
            const status = change.statuses[0];
            const wamId = status.id;

            if (!wamId) {
                const errorMsg = "Missing wamId in the payload.";
                sendMessageToGoogleChat(errorMsg);
                return res.status(400).send({ error: errorMsg });
            }

            // Query Firestore to find the document with the matching wamId
            const logsRef = db.collectionGroup("entries").where("wamId", "==", wamId);
            const logsSnapshot = await logsRef.get();

            if (logsSnapshot.empty) {
                const errorMsg = "Log entry not found";
                sendMessageToGoogleChat(errorMsg);
                return res.status(400).send({ error: errorMsg });
            }

            // Check for duplicate receipts
            let isDuplicate = false;
            logsSnapshot.forEach(async (entryDoc) => {
                const logsCollectionRef = entryDoc.ref.collection("logs");
                const logsCollectionSnapshot = await logsCollectionRef.get();
                logsCollectionSnapshot.forEach((logDoc) => {
                    if (logDoc.data().wamId === wamId) {
                        isDuplicate = true;
                    }
                });

                if (!isDuplicate) {
                    // Update the read timestamp for the matching document and add the payload as a sub-collection
                    await logsCollectionRef.add(payload);
                    console.log(`Read receipt logged for wamId: ${wamId}`);
                } else {
                    console.log(`Duplicate read receipt ignored for wamId: ${wamId}`);
                }
            });
        }

        // Log the entire response payload
        await db.collection("webhookResponses").add({
            payload,
            timestamp: new Date().toISOString()
        });

        res.status(200).send({ message: "Webhook event handled successfully" });
    } catch (error) {
        console.error("Error handling WhatsApp webhook:", error.message);
        sendMessageToGoogleChat(`Error handling WhatsApp webhook: ${error.message}`);
        res.status(500).send({ error: `An error occurred: ${error.message}` });
    }
}

// Fetch data from Google Sheets
const sheets = google.sheets("v4");

// Replace these with your credentials and spreadsheet details

async function fetchAndDownloadMedia(mediaId) {
    const auth = new google.auth.GoogleAuth({
        keyFile: './whatsapp.json', // Replace with the path to your service account file
        scopes: ['https://www.googleapis.com/auth/drive']
    });
    const authClient = await auth.getClient();
    google.options({ auth: authClient });

    const url = `https://graph.facebook.com/v20.0/${mediaId}`;
    const headers = {
        "Authorization": `Bearer ${ACCESS_TOKEN}`
    };

    try {
        const response = await axios.get(url, { headers });
        const responseData = response.data;

        // Send the response data to Google Chat for debugging
        sendMessageToGoogleChat(`Response data for Media ID ${mediaId}: ${JSON.stringify(responseData)}`);

        const mediaUrl = responseData.url;
        const mediaType = responseData.mime_type;

        if (mediaUrl && mediaType) {
            let fileExtension = ".jpg"; // Default extension for images
            if (mediaType.startsWith("audio")) {
                fileExtension = ".mp3";
            } else if (mediaType.startsWith("image")) {
                fileExtension = ".jpg";
            } else if (mediaType.startsWith("video")) {
                fileExtension = ".mp4";
            }

            const fileName = `media_${mediaId}${fileExtension}`;

            // Check if file exists
            try {
                const fileResponse = await drive.files.list({
                    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
                    fields: 'files(id, name)',
                    spaces: 'drive'
                });

                if (fileResponse.data.files.length > 0) {
                    const fileId = fileResponse.data.files[0].id;
                    const file = await drive.files.get({
                        fileId: fileId,
                        fields: 'webViewLink'
                    });
                    return file.data.webViewLink; // Return existing URL
                } else {
                    // Download and save media
                    const downloadResponse = await axios.get(mediaUrl, {
                        headers,
                        responseType: 'stream'
                    });

                    const fileMetadata = {
                        name: fileName,
                        parents: [folderId]
                    };

                    const media = {
                        mimeType: mediaType,
                        body: Readable.from(downloadResponse.data)
                    };

                    const file = await drive.files.create({
                        resource: fileMetadata,
                        media: media,
                        fields: 'id, webViewLink'
                    });

                    return file.data.webViewLink; // Return new URL
                }
            } catch (error) {
                const errorMsg = `Error checking or creating file for Media ID ${mediaId}: ${error.message}`;
                console.log(errorMsg);
                sendMessageToGoogleChat(errorMsg);
                return "Error";
            }
        } else {
            const errorMsg = `No URL or media type found for Media ID ${mediaId}`;
            console.log(errorMsg);
            sendMessageToGoogleChat(errorMsg);
            return "No URL found";
        }
    } catch (error) {
        if (error.response) {
            const errorMsg = `Error fetching media URL for Media ID ${mediaId}: ${error.message}`;
            console.log(errorMsg);
            sendMessageToGoogleChat(errorMsg);
            sendMessageToGoogleChat(`Response data: ${JSON.stringify(error.response.data)}`);
            sendMessageToGoogleChat(`Response status: ${error.response.status}`);
            sendMessageToGoogleChat(`Response headers: ${JSON.stringify(error.response.headers)}`);
        } else if (error.request) {
            const errorMsg = `Error fetching media URL for Media ID ${mediaId}: No response received`;
            console.log(errorMsg);
            sendMessageToGoogleChat(errorMsg);
            sendMessageToGoogleChat(`Request data: ${JSON.stringify(error.request)}`);
        } else {
            const errorMsg = `Error fetching media URL for Media ID ${mediaId}: ${error.message}`;
            console.log(errorMsg);
            sendMessageToGoogleChat(errorMsg);
        }
        return "Error";
    }
}

