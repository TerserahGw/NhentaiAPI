import express from 'express';
import cron from 'node-cron';
import { NHentai } from '@shineiichijo/nhentai-ts';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36';
const cookie_value = 'cf_clearance=hScUYYW2Cy7cqxup8LNoSGhSdtu8rP7UKg7_IcBR3yg-1713277222-1.0.1.1-k6E9Qg7QSxFrQKK00569A7SG91JBWbopKtKLzOjVvrjTglOsSD29ZhykNAcrB.4WwTrBA8HqBSyGLQSn_Vhotg';
const nhentai = new NHentai({ site: 'nhentai.net', user_agent, cookie_value });
const app = express();
const port = process.env.PORT || 80;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deleteFileAfterOneHour = (pdfPath, fileUrl) => {
    setTimeout(() => {
        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
            console.log(`File deleted: ${pdfPath}`);
            console.log(`File URL deleted: ${fileUrl}`);
        }
    }, 3600000);
};

cron.schedule('* * * * *', async () => {
    try {
        const { data } = await nhentai.explore();
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
    const hostname = req.hostname;

    if (!query) {
        return res.status(400).send('Query parameter "q" is required');
    }

    try {
        let success = false;
        while (!success) {
            const randomPage = Math.floor(Math.random() * 10) + 1;
            const { data } = await nhentai.search(query, { page: randomPage });

            if (data.length === 0) {
                continue;
            }

            const randomIndex = Math.floor(Math.random() * data.length);
            const doujin = data[randomIndex];
            const doujinTitle = doujin.title;
            const doujinId = doujin.id;
            const doujinUrl = doujin.url;

            console.log(`Selected doujin title: ${doujinTitle}`);
            const { images } = await doujin.getContents();

            const storageDir = path.join(__dirname, 'pdf');
            if (!fs.existsSync(storageDir)) {
                fs.mkdirSync(storageDir);
            }

            const pdfFilename = path.join(storageDir, `${doujinId}.pdf`);

            await images.PDF(pdfFilename);

            const pdfUrl = `http://${hostname}/nsfw/${encodeURIComponent(doujinId)}.pdf`; // Doujin URL

            
            res.json({
                title: doujinTitle,
                id: doujinId,
                cover: doujin.cover,
                nhentai: doujinUrl,
                pdfUrl: pdfUrl
            });

            deleteFileAfterOneHour(pdfFilename, pdfUrl);

            success = true;
        }
    } catch (error) {
        console.error('Error searching nhentai or saving file:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/remove', (req, res) => {
    const securityKey = req.query.key;

    if (securityKey !== 'AdminKei778') {
        return res.status(403).send('Unauthorized');
    }

    const pdfFolder = path.join(__dirname, 'pdf');

    fs.readdir(pdfFolder, (err, files) => {
        if (err) {
            console.error('Error reading pdf folder:', err);
            return res.status(500).send('Internal Server Error');
        }

        for (const file of files) {
            const filePath = path.join(pdfFolder, file);
            fs.unlinkSync(filePath);
            console.log(`Removed file: ${filePath}`);
        }

        res.send('All files removed from pdf folder');
    });
});

app.use('/nsfw', (req, res, next) => {
    const filePath = path.join(__dirname, 'pdf', req.path);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    next();
},
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});
