import express from 'express';
import cron from 'node-cron';
import { NHentai } from '@shineiichijo/nhentai-ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const user_agent = 'User Agent';
const cookie_value = 'cf_clearance=abcdefghijklmnopq';
const nhentai = new NHentai({ site: 'nhentai.net', user_agent, cookie_value });
const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let latestData = null;

const oAuth2Client = new OAuth2Client(
    '686857291590-t0b12r65edt55uabsb9d438k32skgft6.apps.googleusercontent.com',
    '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',
    'https://developers.google.com/oauthplayground'
);

oAuth2Client.setCredentials({
    refresh_token: '1//04wWJHGzCVZNaCgYIARAAGAQSNwF-L9IrySSsI-Yww9nfVHo0ZeXalbDdLAGQw4Yapu7o9GyP42fiuq31VRYsRoZNGpaI068wCA4'
});

const drive = google.drive({ version: 'v3', auth: oAuth2Client });

cron.schedule('* * * * *', async () => {
    try {
        const { data } = await nhentai.explore();
        latestData = data;
        console.log('Updated');
    } catch (error) {
        console.error('Error exploring nhentai:', error);
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/doujin', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).send('Query parameter "q" is required');
    }
    try {
        const { data } = await nhentai.search(query, { page: 1 });
        if (data.length === 0) {
            return res.status(404).send('No doujin found for the given query');
        }
        const doujin = data[0];
        const doujinTitle = doujin.title;
        console.log(doujinTitle);
        const { images } = await doujin.getContents();

        // Use /tmp directory for temporary files
        const tempDir = '/tmp';
        const pdfFilename = path.join(tempDir, `${doujinTitle}.pdf`);

        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        await images.PDF(pdfFilename);

        const fileMetadata = {
            name: `${doujinTitle}.pdf`,
            parents: ['1UHbD8eGuMRYSF6Du0ZCftkN0HuVhaLW6']
        };

        const media = {
            mimeType: 'application/pdf',
            body: fs.createReadStream(pdfFilename)
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        const fileId = file.data.id;
        const fileUrl = file.data.webViewLink;
        res.json({ url: fileUrl });

        // Schedule deletion after 60 seconds (1 minute)
        setTimeout(async () => {
            try {
                await drive.files.delete({ fileId: fileId });
                console.log('File deleted from Google Drive:', fileUrl);
            } catch (error) {
                console.error('Error deleting file from Google Drive:', error);
            }
        }, 60000);

        // Delete local PDF file
        fs.unlinkSync(pdfFilename);
    } catch (error) {
        console.error('Error searching nhentai:', error);
        res.status(500).send('Error searching nhentai');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
